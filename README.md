## Implementation 

- Normalized rate request: origin (from), destination (to), package weight and optional dimensions, optional service level. All validated with Zod before any API call.
- Normalized rate response: service name, service code, amount, currency, optional estimated days.
- Single Carrier interface (getRates) and createUPSCarrier factory. Adding FedEx or USPS later is a new carrier module implementing the same interface.
- OAuth 2.0 Client Credentials for UPS: token cached and reused until near expiry; no refresh token (we get a new access token by calling the token endpoint again with client_id and client_secret).
- On rating 401 we clear token cache, get a new token, and retry the rating request once. If the token endpoint then returns 401 we throw AuthError for the caller to handle.
- Config loaded from env via dotenv; UPS_BASE_URL, UPS_CLIENT_ID, UPS_CLIENT_SECRET required (no fallbacks). Validated with Zod.
- Structured errors: AuthError, RateLimitError, TimeoutError, BadRequestError, ServerError. Each has code and optional statusCode and cause.
- Network timeouts: token request 15s, rating request 30s. ECONNABORTED and ETIMEDOUT become TimeoutError.
- HTTP error codes: 401, 429, 4xx, 5xx mapped to the errors above. Response body errors array checked and thrown as BadRequestError.
- Malformed responses: token response must have access_token and expires_in; rating response must have RateResponse.RatedShipment array and valid TotalCharges per item. Otherwise we throw BadRequestError with a clear message.
- Input validation: rate request validated with RateRequestSchema (Zod) at the start of getRates; invalid shape throws BadRequestError before any API call.
- Integration tests use nock and loadConfig so they use .env vars; tests cover happy path, token reuse, token 401, rating 400, rating 401 then retry success, rating 401 then token 401.
- Demo uses nock to stub token and rating at the configured base URL; no live UPS calls. Same flow as production: get token, cache, call rating.

## How to run

```bash
npm install
npm run build
npm test
```

For the demo, copy .env.example to .env and set UPS_BASE_URL, UPS_CLIENT_ID, UPS_CLIENT_SECRET (values can be placeholders; nock stubs the requests). Then:

```bash
npm run demo
```

## Project structure

- src/types: domain types and Zod schemas (address, package, rate request, normalized rate)
- src/core: Carrier interface, custom errors
- src/config: env loading and validation
- src/carriers/ups: auth (OAuth, token cache), rating (request/response mapping), createUPSCarrier
- tests/integration: stubbed end-to-end tests with nock



Adding The new UPS modules or FedEx,DLH etc will be very easy due to the compartmentalization of code (And directory structure). We'll only need to make minimal changes to match the new API endpoints.



Given more time, I'd like to simplify the codebase even more (because simple is always scalable & better).
Also I'd like to discover any other Exceptions etc.# CyberShip_test
# CyberShip_test
# CyberShip_test
