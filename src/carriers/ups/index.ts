import axios, { type AxiosInstance } from "axios";
import type { Carrier } from "../../core/index.js";
import type { RateRequest, NormalizedRate } from "../../types/index.js";
import type { Config } from "../../config.js";
import { UPSAuth } from "./auth.js";
import { getRates as getRatesFromAPI } from "./rating.js";

export { UPSAuth } from "./auth.js";
export { getRates } from "./rating.js";
export type { TokenResponse } from "./auth.js";

export interface CreateUPSCarrierOptions {
  config: Config;
  httpClient?: AxiosInstance;
}

export function createUPSCarrier(options: CreateUPSCarrierOptions): Carrier {
  const { config, httpClient = axios.create() } = options;
  const auth = new UPSAuth({ config, httpClient });

  return {
    async getRates(request: RateRequest): Promise<NormalizedRate[]> {
      return getRatesFromAPI(request, {
        baseUrl: config.UPS_BASE_URL,
        auth,
        httpClient,
      });
    },
  };
}
