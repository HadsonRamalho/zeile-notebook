#!/usr/bin/env node
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

const mode = process.env.NEXT_PUBLIC_MODE;
console.log(`Modo configurado: ${mode}`);

if (mode === "NO_ENDPOINTS") {
  console.error("Modo NO_ENDPOINTS não suporta geração de documentação");
  process.exit(1);
}

const SUPPORTED_SERVICES = [
  {
    slug: "api",
    envKey: "NEXT_PUBLIC_API",
    jsonEnvKey: "NEXT_PUBLIC_API_JSON_PATH",
  },
];

const services = SUPPORTED_SERVICES.map((service) => {
  const apiURL = process.env[service.envKey];
  const jsonPath = process.env[service.jsonEnvKey];

  if (mode === "API" && !apiURL) {
    throw new Error(`${service.envKey} é obrigatório no modo API`);
  }
  if (mode === "JSON" && !jsonPath) {
    throw new Error(`${service.jsonEnvKey} é obrigatório no modo JSON`);
  }

  const source =
    mode === "API" ? `${apiURL.replace(/\/+$/, "")}/docs/json` : jsonPath;

  return {
    name: service.slug,
    source,
    outputFile: `./content/docs/api-reference/${service.slug}/index.mdx`,
  };
});

async function loadSpec(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Falha ao buscar ${source}: ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(source, "utf-8"));
}

function jsonBlock(value) {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

function paramsTable(parameters = []) {
  if (parameters.length === 0) return "";

  const rows = parameters.map(
    (p) =>
      `| \`${p.name}\` | ${p.in} | ${p.schema?.type ?? "-"} | ${p.required ? "Sim" : "Não"} | ${p.description ?? ""} |`,
  );

  return [
    "| Nome | Local | Tipo | Obrigatório | Descrição |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderEndpoint(pathKey, methodKey, operation) {
  const parts = [`## ${methodKey.toUpperCase()} \`${pathKey}\``];

  if (operation.summary) parts.push(operation.summary);
  if (operation.description) parts.push(operation.description);

  const params = paramsTable(operation.parameters);
  if (params) parts.push("### Parâmetros", params);

  const requestBody =
    operation.requestBody?.content?.["application/json"]?.schema;
  if (requestBody) parts.push("### Corpo da requisição", jsonBlock(requestBody));

  const responses = Object.entries(operation.responses ?? {});
  if (responses.length > 0) {
    parts.push("### Respostas");
    for (const [status, response] of responses) {
      const schema = response.content?.["application/json"]?.schema;
      parts.push(`**${status}** — ${response.description ?? ""}`);
      if (schema) parts.push(jsonBlock(schema));
    }
  }

  return parts.join("\n\n");
}

function renderSpec(spec) {
  const sections = [];

  for (const [pathKey, methods] of Object.entries(spec.paths ?? {})) {
    for (const [methodKey, operation] of Object.entries(methods)) {
      sections.push(renderEndpoint(pathKey, methodKey, operation));
    }
  }

  return sections.join("\n\n---\n\n");
}

for (const service of services) {
  console.log(`\nProcessando: ${service.name}`);
  console.log(`Source: ${service.source}`);

  const spec = await loadSpec(service.source);
  const body = renderSpec(spec);

  const frontmatter = `---\ntitle: API Reference\n---\n\n`;

  fs.mkdirSync(path.dirname(service.outputFile), { recursive: true });
  fs.writeFileSync(service.outputFile, frontmatter + body);

  console.log(`Documentação gerada em: ${service.outputFile}, no modo ${mode}`);
}

console.log("\nGeração de documentação concluída!");
