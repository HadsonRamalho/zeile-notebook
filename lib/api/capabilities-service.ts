import { createApi } from "./base";

const api = createApi("exec-compiled");

export interface LanguageCapability {
  language: string;
  available: boolean;
  missing: string[];
}

export interface CapabilitiesReport {
  sandbox: boolean;
  languages: LanguageCapability[];
}

export async function fetchExecutionCapabilities() {
  return api.get<CapabilitiesReport>("/capabilities");
}
