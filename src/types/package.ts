import { z } from "zod";

const WeightSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(["lb", "kg"]),
});

const DimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(["in", "cm"]),
});

/** Normalized package – carrier-agnostic */
export const PackageSchema = z.object({
  weight: WeightSchema,
  dimensions: DimensionsSchema.optional(),
});

export type Package = z.infer<typeof PackageSchema>;
