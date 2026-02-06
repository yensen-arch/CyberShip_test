import { z } from "zod";
import { AddressSchema } from "./address.js";
import { PackageSchema } from "./package.js";

/** Normalized rate request – from/to/package, optional service filter */
export const RateRequestSchema = z.object({
  from: AddressSchema,
  to: AddressSchema,
  package: PackageSchema,
  serviceLevel: z
    .enum([
      "UPS Ground",
      "UPS 3 Day Select",
      "UPS 2nd Day Air",
      "UPS Next Day Air Saver",
      "UPS Next Day Air",
      "UPS Next Day Air Early",
    ])
    .optional(),
});

export type RateRequest = z.infer<typeof RateRequestSchema>;

/** Single normalized rate – service name, amount, currency */
export const NormalizedRateSchema = z.object({
  serviceName: z.string(),
  serviceCode: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  estimatedDays: z.number().int().nonnegative().optional(),
});

export type NormalizedRate = z.infer<typeof NormalizedRateSchema>;
