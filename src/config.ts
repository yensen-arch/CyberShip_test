import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  UPS_BASE_URL: z.string().url(),
  UPS_CLIENT_ID: z.string().min(1),
  UPS_CLIENT_SECRET: z.string().min(1),
});

export type Config = z.infer<typeof EnvSchema>;

/** Load and validate config from process.env */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse({
    UPS_BASE_URL: env.UPS_BASE_URL,
    UPS_CLIENT_ID: env.UPS_CLIENT_ID,
    UPS_CLIENT_SECRET: env.UPS_CLIENT_SECRET,
  });
  if (!result.success) {
    const msg = result.error.flatten().fieldErrors;
    throw new Error(`Invalid config: ${JSON.stringify(msg)}`);
  }
  return result.data;
}
