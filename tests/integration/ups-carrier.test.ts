import * as nock from "nock";
import axios from "axios";
import { createUPSCarrier, loadConfig } from "../../src/index.js";

const config = loadConfig();
const BASE_URL = config.UPS_BASE_URL.replace(/\/$/, "");
const TOKEN_PATH = "/security/v1/oauth/token";
const RATING_PATH = "/api/rating/v1/Shop";

const sampleRateRequest = {
  from: { country: "US", postalCode: "10001" },
  to: { country: "US", postalCode: "90210" },
  package: {
    weight: { value: 5.2, unit: "lb" as const },
    dimensions: { length: 10, width: 8, height: 6, unit: "in" as const },
  },
};

const validTokenResponse = {
  access_token: "test_access_token_123",
  expires_in: 3600,
  token_type: "Bearer",
};

const validRatingResponse = {
  RateResponse: {
    RatedShipment: [
      {
        Service: { Code: "03", Name: "UPS Ground" },
        TotalCharges: { MonetaryValue: "12.50", CurrencyCode: "USD" },
        GuaranteedDelivery: { BusinessDaysInTransit: 5 },
      },
      {
        Service: { Code: "02", Name: "UPS 2nd Day Air" },
        TotalCharges: { MonetaryValue: "24.00", CurrencyCode: "USD" },
        GuaranteedDelivery: { BusinessDaysInTransit: 2 },
      },
    ],
  },
};

describe("UPS Carrier integration (stubbed)", () => {
  const httpClient = axios.create();

  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.cleanAll();
  });

  it("happy path: returns normalized rates", async () => {
    nock(BASE_URL)
      .post(TOKEN_PATH, /grant_type=client_credentials/)
      .reply(200, validTokenResponse);
    nock(BASE_URL)
      .post(RATING_PATH, (body) => body?.RateRequest?.Shipment != null)
      .reply(200, validRatingResponse);

    const carrier = createUPSCarrier({ config, httpClient });
    const rates = await carrier.getRates(sampleRateRequest);

    expect(rates).toHaveLength(2);
    expect(rates[0]).toMatchObject({
      serviceName: "UPS Ground",
      serviceCode: "03",
      amount: 12.5,
      currency: "USD",
      estimatedDays: 5,
    });
    expect(rates[1]).toMatchObject({
      serviceName: "UPS 2nd Day Air",
      serviceCode: "02",
      amount: 24,
      currency: "USD",
      estimatedDays: 2,
    });
  });

  it("reuses token: second getRates does not call token again", async () => {
    const tokenScope = nock(BASE_URL)
      .post(TOKEN_PATH, /grant_type=client_credentials/)
      .once()
      .reply(200, validTokenResponse);
    nock(BASE_URL)
      .post(RATING_PATH)
      .reply(200, validRatingResponse)
      .persist();

    const carrier = createUPSCarrier({ config, httpClient });
    await carrier.getRates(sampleRateRequest);
    await carrier.getRates(sampleRateRequest);

    expect(tokenScope.isDone()).toBe(true);
  });

  it("auth fail: token 401 throws AuthError", async () => {
    nock(BASE_URL).post(TOKEN_PATH).reply(401, { error: "invalid_client" });

    const carrier = createUPSCarrier({ config, httpClient });

    await expect(carrier.getRates(sampleRateRequest)).rejects.toMatchObject({
      name: "AuthError",
      code: "AUTH_ERROR",
    });
  });

  it("bad rating response: 400 throws BadRequestError", async () => {
    nock(BASE_URL).post(TOKEN_PATH).reply(200, validTokenResponse);
    nock(BASE_URL)
      .post(RATING_PATH)
      .reply(400, { response: { errors: [{ message: "Invalid request" }] } });

    const carrier = createUPSCarrier({ config, httpClient });

    await expect(carrier.getRates(sampleRateRequest)).rejects.toMatchObject({
      name: "BadRequestError",
      code: "BAD_REQUEST",
    });
  });

  /**
   * Token expired / invalid: rating returns 401 → we clear cache, get new token, retry once → success.
   * (UPS uses Client Credentials – no refresh_token; we "refresh" by calling token endpoint again.)
   */
  it("rating 401 (token expired) → get new token and retry → success", async () => {
    const tokenScope1 = nock(BASE_URL)
      .post(TOKEN_PATH, /grant_type=client_credentials/)
      .reply(200, validTokenResponse);
    const tokenScope2 = nock(BASE_URL)
      .post(TOKEN_PATH, /grant_type=client_credentials/)
      .reply(200, { ...validTokenResponse, access_token: "new_token_after_401" });
    nock(BASE_URL)
      .post(RATING_PATH)
      .reply(401, { message: "Token expired" });
    nock(BASE_URL)
      .post(RATING_PATH)
      .reply(200, validRatingResponse);

    const carrier = createUPSCarrier({ config, httpClient });
    const rates = await carrier.getRates(sampleRateRequest);

    expect(tokenScope1.isDone()).toBe(true);
    expect(tokenScope2.isDone()).toBe(true);
    expect(rates).toHaveLength(2);
    expect(rates[0].amount).toBe(12.5);
  });

  /**
   * Rating 401 → we try to get new token but token endpoint returns 401 (bad credentials).
   * Caller gets AuthError – no infinite retry; caller can show "re-login" or fix credentials.
   */
  it("rating 401 then token endpoint 401 → throws AuthError (caller handles)", async () => {
    nock(BASE_URL)
      .post(TOKEN_PATH, /grant_type=client_credentials/)
      .reply(200, validTokenResponse);
    nock(BASE_URL)
      .post(RATING_PATH)
      .reply(401, { message: "Unauthorized" });
    nock(BASE_URL)
      .post(TOKEN_PATH, /grant_type=client_credentials/)
      .reply(401, { error: "invalid_client" });

    const carrier = createUPSCarrier({ config, httpClient });

    await expect(carrier.getRates(sampleRateRequest)).rejects.toMatchObject({
      name: "AuthError",
      code: "AUTH_ERROR",
    });
  });
});
