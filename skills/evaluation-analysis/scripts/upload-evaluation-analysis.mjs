#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEvaluationAnalysis } from "./validate-evaluation-analysis.mjs";

function usage() {
  return [
    "Uso:",
    "  node upload-evaluation-analysis.mjs --base-url <https://...> --token <sb_live_...> --file <archivo.json>",
    "",
    "Opcional: --yes confirma el envío no interactivo solo después de que el usuario lo haya autorizado."
  ].join("\n");
}

function safeArgument(argument) {
  return typeof argument === "string" && argument.startsWith("sb_live_") ? "[TOKEN REDACTED]" : argument;
}

function parseArgs(argv) {
  const options = { yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--yes") {
      options.yes = true;
      continue;
    }
    if (!["--base-url", "--token", "--file"].includes(argument)) {
      throw new Error(`Argumento desconocido: ${safeArgument(argument)}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}.`);
    options[argument.slice(2).replace("-", "_")] = value;
    index += 1;
  }
  return options;
}

function validateOptions(options) {
  if (!options.base_url) throw new Error("--base-url es obligatorio.");
  if (!options.token) throw new Error("--token es obligatorio.");
  if (!options.file) throw new Error("--file es obligatorio.");
  let baseUrl;
  try {
    baseUrl = new URL(options.base_url);
  } catch {
    throw new Error("--base-url debe ser una URL válida.");
  }
  if (baseUrl.protocol !== "https:") throw new Error("--base-url debe usar HTTPS.");
  if (!options.token.startsWith("sb_live_") || options.token.length < 32 || options.token.length > 160) {
    throw new Error("El token no tiene un formato StudyBrain válido.");
  }
  return baseUrl;
}

async function confirmUpload(payload, endpoint, assumeYes) {
  console.log("Evaluación lista para subir:");
  console.log(`- Semestre: ${payload.semesterId}`);
  console.log(`- Ramo: ${payload.courseSlug}`);
  console.log(`- Evaluación: ${payload.evaluation.title}`);
  console.log(`- Endpoint: ${endpoint}`);
  if (assumeYes) return true;
  if (!input.isTTY || !output.isTTY) throw new Error("Se requiere confirmación interactiva. Ejecuta en una terminal o usa --yes tras obtener autorización explícita.");
  const prompt = createInterface({ input, output });
  try {
    const answer = (await prompt.question("¿Confirmas el envío a StudyBrain? [s/N] ")).trim().toLowerCase();
    return answer === "s" || answer === "si" || answer === "sí" || answer === "y" || answer === "yes";
  } finally {
    prompt.close();
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const baseUrl = validateOptions(options);
    const { payload, resolvedPath, issues } = await loadEvaluationAnalysis(options.file);
    if (issues.length) {
      console.error(`No se enviará el archivo; contiene ${issues.length} problema(s):`);
      issues.forEach((issue) => console.error(`- ${issue}`));
      process.exitCode = 1;
      return;
    }

    const endpoint = new URL("/api/studybrain/import", baseUrl).href;
    console.log(`JSON validado: ${resolvedPath}`);
    if (!await confirmUpload(payload, endpoint, options.yes)) {
      console.log("Envío cancelado. No se modificó StudyBrain.");
      return;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = responseText;
    }

    if (!response.ok) {
      console.error(`StudyBrain respondió con error HTTP ${response.status}.`);
      if (responseBody) console.error(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`Evaluación subida correctamente (HTTP ${response.status}).`);
    if (responseBody) console.log(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo subir la evaluación.");
    console.error(usage());
    process.exitCode = 1;
  }
}

await main();
