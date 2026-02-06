import type { RateRequest, NormalizedRate } from "../types/index.js";

/** Carrier-agnostic interface for getting shipping rates. */
export interface Carrier {
  /** Return normalized rates for the given request. */
  getRates(request: RateRequest): Promise<NormalizedRate[]>;
}
