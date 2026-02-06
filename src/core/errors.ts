/** Base error for carrier operations */
export class CarrierError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CarrierError";
    Object.setPrototypeOf(this, CarrierError.prototype);
  }
}

/** OAuth / token / 401 */
export class AuthError extends CarrierError {
  constructor(message: string, cause?: unknown) {
    super(message, "AUTH_ERROR", 401, cause);
    this.name = "AuthError";
  }
}

/** Rate limit (429) */
export class RateLimitError extends CarrierError {
  public readonly retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message, "RATE_LIMIT", 429);
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

/** Request timeout */
export class TimeoutError extends CarrierError {
  constructor(message: string, cause?: unknown) {
    super(message, "TIMEOUT", undefined, cause);
    this.name = "TimeoutError";
  }
}

/** Bad request / 4xx (except 401/429) */
export class BadRequestError extends CarrierError {
  constructor(message: string, statusCode: number, cause?: unknown) {
    super(message, "BAD_REQUEST", statusCode, cause);
    this.name = "BadRequestError";
  }
}

/** Server error / 5xx */
export class ServerError extends CarrierError {
  constructor(message: string, statusCode: number, cause?: unknown) {
    super(message, "SERVER_ERROR", statusCode, cause);
    this.name = "ServerError";
  }
}
