#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdout as output } from "node:process";
import { pathToFileURL } from "node:url";

const PRODUCTION_CONTEXT_URL = "https://study-brain-cniico.vercel.app/api/studybrain/planning/context";

function usage() {
  return [
    "Uso:",
    "  node fetch-weekly-planning-context.mjs --base-url <https://...> --token <sb_live_...> --week-start <YYYY-MM-DD> --week-end <YYYY-MM-DD> --timezone <IANA>",
    "",
    "Opcional: --semester-id <id> y --output <context.json>.",
    "También admite STUDYBRAIN_BASE_URL y STUDYBRAIN_AGENT_TOKEN."
  ].join("\n");
}

function safeArgument(argument) {
  return typeof argument === "string" && argument.startsWith("sb_live_") ? "[TOKEN REDACTED]" : argument;
}

function parseArgs(argv) {
  const options = {
    base_url: process.env.STUDYBRAIN_BASE_URL || "https://study-brain-cniico.vercel.app",
    token: process.env.STUDYBRAIN_AGENT_TOKEN || ""
  };
  const accepted = new Set(["--base-url", "--token", "--semester-id", "--week-start", "--week-end", "--timezone", "--output"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!accepted.has(argument)) throw new Error(`Argumento desconocido: ${safeArgument(argument)}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}.`);
    options[argument.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  return options;
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return Boolean(value);
  } catch {
    return false;
  }
}

async function fetchContext(options) {
  if (!options.base_url) throw new Error("--base-url o STUDYBRAIN_BASE_URL es obligatorio.");
  if (!options.token) throw new Error("--token o STUDYBRAIN_AGENT_TOKEN es obligatorio.");
  if (!options.token.startsWith("sb_live_") || options.token.length < 32 || options.token.length > 160) {
    throw new Error("El token no tiene un formato StudyBrain válido.");
  }
  if (!validDate(options.week_start) || !validDate(options.week_end) || options.week_start > options.week_end) {
    throw new Error("week-start y week-end deben formar un rango válido.");
  }
  if (!validTimezone(options.timezone)) throw new Error("timezone debe ser una zona horaria IANA válida.");
  let baseUrl;
  try { baseUrl = new URL(options.base_url); } catch { throw new Error("La base URL no es válida."); }
  if (baseUrl.protocol !== "https:") throw new Error("La base URL debe usar HTTPS.");
  const endpoint = options.base_url === "https://study-brain-cniico.vercel.app"
    ? new URL(PRODUCTION_CONTEXT_URL)
    : new URL("/api/studybrain/planning/context", baseUrl);
  endpoint.searchParams.set("weekStart", options.week_start);
  endpoint.searchParams.set("weekEnd", options.week_end);
  endpoint.searchParams.set("timezone", options.timezone);
  if (options.semester_id) endpoint.searchParams.set("semesterId", options.semester_id);
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${options.token}` },
    signal: AbortSignal.timeout(30000)
  });
  const responseText = await response.text();
  let body;
  try { body = responseText ? JSON.parse(responseText) : null; } catch { body = null; }
  if (!response.ok) {
    const error = body?.error ? `${body.error}: ${body.message || "Solicitud rechazada."}` : `HTTP ${response.status}`;
    throw new Error(error);
  }
  if (!body || body.version !== "1.0" || !body.semester?.id || !body.week?.timezone || !Array.isArray(body.missingContext)) {
    throw new Error("StudyBrain devolvió un contexto de planificación incompleto.");
  }
  return body;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const context = await fetchContext(options);
    const serialized = `${JSON.stringify(context, null, 2)}\n`;
    if (options.output) {
      const target = resolve(options.output);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
      console.log(`Contexto guardado: ${target}`);
      console.log(`Semestre: ${context.semester.id} · Ramos: ${context.courses.length} · Datos faltantes: ${context.missingContext.length}`);
    } else {
      output.write(serialized);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo obtener el contexto de planificación.");
    console.error(usage());
    process.exitCode = 1;
  }
}

export { fetchContext, parseArgs };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
