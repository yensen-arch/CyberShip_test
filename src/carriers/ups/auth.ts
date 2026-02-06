import type { AxiosInstance } from "axios";
import { AuthError, TimeoutError } from "../../core/errors.js";
import type { Config } from "../../config.js";

const TOKEN_REQUEST_TIMEOUT_MS = 15000;

/** Token response from UPS OAuth (Client Credentials) */
export interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
}

/** Cached token with expiry */
interface CachedToken {
  accessToken: string;
  expiresAt: number; // ms
}

const TOKEN_PATH = "/security/v1/oauth/token";
const REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 min before expiry

export interface UPSAuthOptions {
  config: Config;
  httpClient: AxiosInstance;
}


export class UPSAuth {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly http: AxiosInstance;
  private cached: CachedToken | null = null;

  constructor(options: UPSAuthOptions) {
    this.baseUrl = options.config.UPS_BASE_URL.replace(/\/$/, "");
    this.clientId = options.config.UPS_CLIENT_ID;
    this.clientSecret = options.config.UPS_CLIENT_SECRET;
    this.http = options.httpClient;
  }

  /** Returns a valid access token; fetches or refreshes as needed. */
  async getAccessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - REFRESH_BUFFER_MS) {
      return this.cached.accessToken;
    }
    const token = await this.fetchToken();
    this.cached = {
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return this.cached.accessToken;
  }

  /** Force clear cache (e.g. after 401 retry). */
  clearCache(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<TokenResponse> {
    const url = `${this.baseUrl}${TOKEN_PATH}`;
    const basic = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
      "utf8",
    ).toString("base64");

    try {
      const { data, status } = await this.http.post<TokenResponse>(url, "grant_type=client_credentials", {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${basic}`,
        },
        validateStatus: () => true,
        timeout: TOKEN_REQUEST_TIMEOUT_MS,
      });

      if (status === 401 || (data as { error?: string }).error === "invalid_client") {
        throw new AuthError("Invalid UPS client credentials", data);
      }
      if (status !== 200) {
        throw new AuthError(
          `UPS token request failed: ${status}`,
          { status, data },
        );
      }
      if (!data.access_token || typeof data.expires_in !== "number") {
        throw new AuthError("Invalid UPS token response", data);
      }
      return data;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err && typeof (err as { code?: string }).code === "string") {
        const e = err as { code: string; message?: string };
        if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
          throw new TimeoutError(e.message ?? "Token request timeout", err);
        }
      }
      throw new AuthError(
        err instanceof Error ? err.message : "Token request failed",
        err,
      );
    }
  }
}
