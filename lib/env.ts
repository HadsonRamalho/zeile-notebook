import z from "zod";

interface ServiceConfig {
  slug: string;
  envKey: keyof env;
  jsonEnvKey: keyof env;
}

const SUPPORTED_SERVICES: ServiceConfig[] = [
  {
    slug: "api",
    envKey: "NEXT_PUBLIC_API",
    jsonEnvKey: "NEXT_PUBLIC_API_JSON_PATH",
  },
];

const envSchema = z.object({
  NEXT_PUBLIC_API_JSON_PATH: z
    .string()
    .min(1, "NEXT_PUBLIC_API_JSON_PATH must be a valid string")
    .optional(),
  NEXT_PUBLIC_API: z
    .url({
      error: "NEXT_PUBLIC_API must be a valid URL",
    })
    .optional(),
  NEXT_PUBLIC_MODE: z.enum(["JSON", "API", "NO_ENDPOINTS"]),
  NEXT_PUBLIC_RUST_NOTEBOOK_API: z.url({
    error: "NEXT_PUBLIC_RUST_NOTEBOOK_API is required",
  }),
});

const envError = "Cannot access ENV before loading it";

type env = z.infer<typeof envSchema>;

class Env {
  private env!: env;
  private envIsLoaded = false;

  loadEnv() {
    if (this.envIsLoaded) return;

    const values = {
      NEXT_PUBLIC_MODE: process.env.NEXT_PUBLIC_MODE,
      NEXT_PUBLIC_RUST_NOTEBOOK_API: process.env.NEXT_PUBLIC_RUST_NOTEBOOK_API,
    };

    const result = envSchema.safeParse(values);

    if (!result.success) {
      const errorMsg = result.error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      console.error(errorMsg);

      if (typeof window === "undefined") {
        throw new Error(`Environment variable validation failed: ${errorMsg}`);
      }
    } else {
      this.env = result.data;
      this.envIsLoaded = true;
    }
  }

  get(key: keyof env) {
    if (!this.envIsLoaded) throw new Error(envError);

    return this.env[key];
  }

  getOpenAPIServices() {
    if (!this.envIsLoaded) throw new Error(envError);

    const mode = this.get("NEXT_PUBLIC_MODE");
    if (mode === "NO_ENDPOINTS") return [];

    return SUPPORTED_SERVICES.map((service) => {
      const apiURL = this.get(service.envKey);
      const jsonPath = this.get(service.jsonEnvKey);

      if (mode === "API" && !apiURL) {
        throw new Error(`${service.envKey} is required in API mode`);
      }
      if (mode === "JSON" && !jsonPath) {
        throw new Error(`${service.jsonEnvKey} is required in JSON mode`);
      }

      const source =
        mode === "API" ? `${apiURL!.replace(/\/+$/, "")}/docs/json` : jsonPath!;

      return {
        name: service.slug,
        source: source,
        outputDir: `./content/docs/api-reference/${service.slug}/endpoints`,
      };
    }).filter(Boolean);
  }

  getServices() {
    if (!this.envIsLoaded) {
      throw new Error(envError);
    }

    const services = this.getOpenAPIServices();

    const serviceSources = services.map((service) => service.source);
    return serviceSources
      .filter((url): url is string => typeof url === "string")
      .map((url) => {
        const cleanUrl = url.replace(/\/$/, "");
        return cleanUrl;
      });
  }
}

export const env = new Env();
