import type { AxiosInstance } from "axios";
import type { RateRequest, NormalizedRate } from "../../types/index.js";
import { RateRequestSchema } from "../../types/index.js";
import {
  AuthError,
  BadRequestError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from "../../core/errors.js";
import type { UPSAuth } from "./auth.js";

/** UPS Rating API request body (minimal shape per UPS Rating docs) */
interface UPSRateRequest {
  RateRequest: {
    Shipment: {
      ShipFrom: { Address: { CountryCode: string; PostalCode: string } };
      ShipTo: { Address: { CountryCode: string; PostalCode: string } };
      Package: {
        Packaging: { Code: string };
        Dimensions?: { Length: number; Width: number; Height: number; Unit: { Code: string } };
        PackageWeight: { Weight: number; Unit: { Code: string } };
      };
      Service?: { Code: string };
    };
  };
}

/** UPS Rating API response (minimal) */
interface UPSRateResponse {
  RateResponse?: {
    RatedShipment?: Array<{
      Service?: { Code?: string; Name?: string };
      TotalCharges?: { MonetaryValue?: string; CurrencyCode?: string };
      GuaranteedDelivery?: { BusinessDaysInTransit?: number };
    }>;
  };
  response?: { errors?: Array<{ code?: string; message?: string }> };
}

const RATING_PATH = "/api/rating/v1/Shop";
const SERVICE_CODE_MAP: Record<string, string> = {
  "03": "UPS Ground",
  "12": "UPS 3 Day Select",
  "02": "UPS 2nd Day Air",
  "13": "UPS Next Day Air Saver",
  "01": "UPS Next Day Air",
  "14": "UPS Next Day Air Early",
};

export interface UPSRatingOptions {
  baseUrl: string;
  auth: UPSAuth;
  httpClient: AxiosInstance;
}

function toUPSRequest(req: RateRequest): UPSRateRequest {
  const pkg = req.package;
  const dims = pkg.dimensions;
  const shipment: UPSRateRequest["RateRequest"]["Shipment"] = {
    ShipFrom: {
      Address: { CountryCode: req.from.country, PostalCode: req.from.postalCode },
    },
    ShipTo: {
      Address: { CountryCode: req.to.country, PostalCode: req.to.postalCode },
    },
    Package: {
      Packaging: { Code: "02" },
      PackageWeight: {
        Weight: pkg.weight.value,
        Unit: { Code: pkg.weight.unit === "lb" ? "LBS" : "KGS" },
      },
    },
  };
  if (dims) {
    shipment.Package.Dimensions = {
      Length: dims.length,
      Width: dims.width,
      Height: dims.height,
      Unit: { Code: dims.unit === "in" ? "IN" : "CM" },
    };
  }
  if (req.serviceLevel) {
    const code = Object.entries(SERVICE_CODE_MAP).find(
      ([, name]) => name === req.serviceLevel,
    )?.[0];
    if (code) shipment.Service = { Code: code };
  }
  return { RateRequest: { Shipment: shipment } };
}

function validateAndParseRatingResponse(body: unknown): NormalizedRate[] {
  if (body == null || typeof body !== "object") {
    throw new BadRequestError("Malformed UPS rating response: not an object", 200, body);
  }
  const rated = (body as UPSRateResponse).RateResponse?.RatedShipment;
  if (!Array.isArray(rated)) {
    throw new BadRequestError("Malformed UPS rating response: missing or invalid RatedShipment", 200, body);
  }
  return rated.map((s, i) => {
    const monetary = (s as { TotalCharges?: { MonetaryValue?: string; CurrencyCode?: string } }).TotalCharges?.MonetaryValue;
    const amount = monetary != null ? parseFloat(monetary) : NaN;
    if (Number.isNaN(amount) || amount < 0) {
      throw new BadRequestError(
        `Malformed UPS rating response: invalid TotalCharges at index ${i}`,
        200,
        body,
      );
    }
    const currency = (s as { TotalCharges?: { CurrencyCode?: string } }).TotalCharges?.CurrencyCode ?? "USD";
    if (typeof currency !== "string" || currency.length !== 3) {
      throw new BadRequestError(
        `Malformed UPS rating response: invalid currency at index ${i}`,
        200,
        body,
      );
    }
    return {
      serviceName: (s as { Service?: { Name?: string; Code?: string } }).Service?.Name ?? (s as { Service?: { Code?: string } }).Service?.Code ?? "Unknown",
      serviceCode: (s as { Service?: { Code?: string } }).Service?.Code,
      amount,
      currency,
      estimatedDays: (s as { GuaranteedDelivery?: { BusinessDaysInTransit?: number } }).GuaranteedDelivery?.BusinessDaysInTransit,
    };
  });
}

/**
 * Fetches UPS rates for a normalized request. On 401, clears auth cache and retries once.
 */
export async function getRates(
  request: RateRequest,
  options: UPSRatingOptions,
): Promise<NormalizedRate[]> {
  const parsed = RateRequestSchema.safeParse(request);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new BadRequestError(`Invalid rate request: ${JSON.stringify(msg)}`, 400, parsed.error);
  }
  const validatedRequest = parsed.data;

  const { baseUrl, auth, httpClient } = options;
  const url = `${baseUrl.replace(/\/$/, "")}${RATING_PATH}`;

  const doRequest = async (): Promise<NormalizedRate[]> => {
    const token = await auth.getAccessToken();
    const { data, status } = await httpClient.post<UPSRateResponse>(
      url,
      toUPSRequest(validatedRequest),
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        validateStatus: () => true,
        timeout: 30000,
      },
    );

    if (status === 401) {
      auth.clearCache();
      throw new AuthError("UPS rating returned 401", { status, data });
    }
    if (status === 429) {
      throw new RateLimitError("UPS rate limit", undefined);
    }
    if (status >= 500) {
      throw new ServerError(
        `UPS server error: ${status}`,
        status,
        data,
      );
    }
    if (status >= 400) {
      const msg =
        (data as { response?: { errors?: Array<{ message?: string }> } })
          ?.response?.errors?.[0]?.message ?? `UPS error: ${status}`;
      throw new BadRequestError(msg, status, data);
    }
    if (status !== 200) {
      throw new BadRequestError(`Unexpected status: ${status}`, status, data);
    }

    const errors = (data as UPSRateResponse).response?.errors;
    if (errors?.length) {
      const first = errors[0];
      throw new BadRequestError(
        first?.message ?? "UPS rating error",
        400,
        data,
      );
    }

    return validateAndParseRatingResponse(data);
  }

  try {
    return await doRequest();
  } catch (err) {
    const isAuthError =
      err instanceof AuthError ||
      (err && typeof err === "object" && (err as { name?: string }).name === "AuthError");
    if (isAuthError) {
      auth.clearCache();
      const token = await auth.getAccessToken();
      const { data, status } = await httpClient.post<UPSRateResponse>(
        url,
        toUPSRequest(validatedRequest),
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          validateStatus: () => true,
          timeout: 30000,
        },
      );
      if (status === 401) throw err;
      if (status !== 200) {
        if (status >= 500) throw new ServerError(`UPS server error: ${status}`, status, data);
        throw new BadRequestError(`UPS error: ${status}`, status, data);
      }
      return validateAndParseRatingResponse(data);
    }
    if (err && typeof (err as { code?: string }).code === "string") {
      const e = err as { code: string; message?: string };
      if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
        throw new TimeoutError(e.message ?? "Request timeout", err);
      }
    }
    throw err;
  }
}
