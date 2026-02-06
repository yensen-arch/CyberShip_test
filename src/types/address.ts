import { z } from "zod";

/** Normalized address – carrier-agnostic */
export const AddressSchema = z.object({
  country: z.string().length(2),
  postalCode: z.string().min(1),
  city: z.string().optional(),
  stateProvinceCode: z.string().max(3).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
});

export type Address = z.infer<typeof AddressSchema>;
