/**
  simulates UPS token + rating responses.
 */
import nock from "nock";
import { createUPSCarrier, loadConfig } from "./index.js";

const TOKEN_PATH = "/security/v1/oauth/token";
const RATING_PATH = "/api/rating/v1/Shop";

const sampleRequest = {
  from: { country: "US", postalCode: "10001" },
  to: { country: "US", postalCode: "90210" },
  package: {
    weight: { value: 5.2, unit: "lb" as const },
    dimensions: { length: 10, width: 8, height: 6, unit: "in" as const },
  },
};

const fakeToken = {
  access_token: "demo_access_token",
  expires_in: 3600,
  token_type: "Bearer",
};

const fakeRatingResponse = {
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

async function main() {
  const config = loadConfig();
  const baseUrl = config.UPS_BASE_URL.replace(/\/$/, "");

  nock(baseUrl).post(TOKEN_PATH, /grant_type=client_credentials/).reply(200, fakeToken);
  nock(baseUrl).post(RATING_PATH).reply(200, fakeRatingResponse);

  const carrier = createUPSCarrier({ config });
  const rates = await carrier.getRates(sampleRequest);
  console.log(JSON.stringify(rates, null, 2));
}

main()
  .then(() => {
    nock.cleanAll();
    process.exit(0);
  })
  .catch((err) => {
    nock.cleanAll();
    console.error(err);
    process.exit(1);
  });
