#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

const MAX_EVENTS = 300;
const MAX_NOTES = 50;
const MAX_WARNINGS = 100;
const MAX_SUMMARY_LENGTH = 200000;
const WEEK_DAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function usage() {
  return [
    "Uso:",
    "  node upload-weekly-planning.mjs --plan <plan.json> --base-url <https://...> --token <sb_live_...>",
    "  node upload-weekly-planning.mjs --plan <plan.json> --validate-only",
    "",
    "El JSON estructurado es la única fuente de verdad para la subida.",
    "Opcional: --markdown-output <plan.md>, --csv-output <eventos.csv> y --yes.",
    "También admite STUDYBRAIN_BASE_URL y STUDYBRAIN_AGENT_TOKEN."
  ].join("\n");
}

function safeArgument(argument) {
  return typeof argument === "string" && argument.startsWith("sb_live_") ? "[TOKEN REDACTED]" : argument;
}

function parseArgs(argv) {
  const options = {
    base_url: process.env.STUDYBRAIN_BASE_URL || "",
    token: process.env.STUDYBRAIN_AGENT_TOKEN || "",
    validate_only: false,
    yes: false
  };
  const valued = new Set(["--base-url", "--token", "--plan", "--markdown-output", "--csv-output"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--yes" || argument === "--validate-only") {
      options[argument.slice(2).replaceAll("-", "_")] = true;
      continue;
    }
    if (!valued.has(argument)) throw new Error(`Argumento desconocido: ${safeArgument(argument)}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}.`);
    options[argument.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  return options;
}

function validateOptions(options) {
  if (!options.plan) throw new Error("--plan es obligatorio; Markdown y CSV no son fuentes de datos.");
  if (options.validate_only) return null;
  if (!options.base_url) throw new Error("--base-url o STUDYBRAIN_BASE_URL es obligatorio.");
  if (!options.token) throw new Error("--token o STUDYBRAIN_AGENT_TOKEN es obligatorio.");
  let baseUrl;
  try { baseUrl = new URL(options.base_url); } catch { throw new Error("La base URL no es válida."); }
  if (baseUrl.protocol !== "https:") throw new Error("La base URL debe usar HTTPS.");
  if (!options.token.startsWith("sb_live_") || options.token.length < 32 || options.token.length > 160) {
    throw new Error("El token no tiene un formato StudyBrain válido.");
  }
  return baseUrl;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimezone(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function minutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function findUndefined(value, path = "plan") {
  if (value === undefined) return path;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUndefined(value[index], `${path}.${index}`);
      if (found) return found;
    }
  } else if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const found = findUndefined(entry, `${path}.${key}`);
      if (found) return found;
    }
  }
  return "";
}

function requiredText(value, field, issues, max) {
  if (typeof value !== "string" || !value.trim()) issues.push(`${field} es obligatorio.`);
  else if (value.length > max) issues.push(`${field} admite hasta ${max} caracteres.`);
}

function validateStringArray(value, field, issues, maxItems) {
  if (!Array.isArray(value)) {
    issues.push(`${field} debe ser un arreglo.`);
    return;
  }
  if (value.length > maxItems) issues.push(`${field} admite hasta ${maxItems} elementos.`);
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) issues.push(`${field}.${index} debe ser texto no vacío.`);
    else if (entry.length > 1000) issues.push(`${field}.${index} admite hasta 1000 caracteres.`);
  });
}

function validatePlan(plan) {
  const issues = [];
  if (!isPlainObject(plan)) return ["El plan debe ser un objeto JSON."];
  const undefinedPath = findUndefined(plan);
  if (undefinedPath) issues.push(`${undefinedPath} contiene undefined.`);
  if (plan.version !== "1.0") issues.push("version debe ser 1.0.");
  requiredText(plan.planningName, "planningName", issues, 200);
  requiredText(plan.semesterId, "semesterId", issues, 120);
  if (typeof plan.semesterId === "string" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(plan.semesterId)) {
    issues.push("semesterId no tiene un formato válido.");
  }
  if (!validDate(plan.weekStart)) issues.push("weekStart debe usar YYYY-MM-DD y ser una fecha válida.");
  if (!validDate(plan.weekEnd)) issues.push("weekEnd debe usar YYYY-MM-DD y ser una fecha válida.");
  if (validDate(plan.weekStart) && validDate(plan.weekEnd) && plan.weekEnd < plan.weekStart) {
    issues.push("weekEnd no puede ser anterior a weekStart.");
  }
  if (!validTimezone(plan.timezone)) issues.push("timezone debe ser una zona horaria IANA válida.");
  if (plan.weekStartsOn !== undefined && !WEEK_DAYS.has(plan.weekStartsOn)) issues.push("weekStartsOn no es válido.");
  requiredText(plan.summaryMarkdown, "summaryMarkdown", issues, MAX_SUMMARY_LENGTH);
  validateStringArray(plan.warnings, "warnings", issues, MAX_WARNINGS);
  validateStringArray(plan.notes, "notes", issues, MAX_NOTES);
  if (plan.dataGaps !== undefined) validateStringArray(plan.dataGaps, "dataGaps", issues, MAX_WARNINGS);
  if (!Array.isArray(plan.events)) {
    issues.push("events debe ser un arreglo; puede estar vacío.");
    return issues;
  }
  if (plan.events.length > MAX_EVENTS) issues.push(`events admite hasta ${MAX_EVENTS} elementos.`);
  const ids = new Set();
  const byDate = new Map();
  const maxBlockMinutes = plan.constraints?.maxBlockMinutes;
  if (maxBlockMinutes !== undefined && (!Number.isInteger(maxBlockMinutes) || maxBlockMinutes < 1 || maxBlockMinutes > 1440)) {
    issues.push("constraints.maxBlockMinutes debe ser un entero entre 1 y 1440.");
  }
  plan.events.forEach((event, index) => {
    const field = `events.${index}`;
    if (!isPlainObject(event)) {
      issues.push(`${field} debe ser un objeto.`);
      return;
    }
    requiredText(event.id, `${field}.id`, issues, 200);
    if (typeof event.id === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)) issues.push(`${field}.id no tiene un formato estable válido.`);
    if (ids.has(event.id)) issues.push(`${field}.id está duplicado.`);
    ids.add(event.id);
    if (!validDate(event.date)) issues.push(`${field}.date debe usar YYYY-MM-DD.`);
    else if (validDate(plan.weekStart) && validDate(plan.weekEnd) && (event.date < plan.weekStart || event.date > plan.weekEnd)) {
      issues.push(`${field}.date está fuera del rango semanal.`);
    }
    if (!validTime(event.startTime)) issues.push(`${field}.startTime debe usar HH:MM.`);
    if (!validTime(event.endTime)) issues.push(`${field}.endTime debe usar HH:MM.`);
    if (validTime(event.startTime) && validTime(event.endTime)) {
      if (event.endTime <= event.startTime) issues.push(`${field}.endTime debe ser posterior a startTime.`);
      const duration = minutes(event.endTime) - minutes(event.startTime);
      if (Number.isInteger(maxBlockMinutes) && duration > maxBlockMinutes) issues.push(`${field} supera constraints.maxBlockMinutes.`);
      if (!byDate.has(event.date)) byDate.set(event.date, []);
      byDate.get(event.date).push({ index, startTime: event.startTime, endTime: event.endTime });
    }
    requiredText(event.courseSlug, `${field}.courseSlug`, issues, 120);
    if (typeof event.courseSlug === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.courseSlug)) {
      issues.push(`${field}.courseSlug no tiene un formato válido.`);
    }
    requiredText(event.courseName, `${field}.courseName`, issues, 200);
    requiredText(event.type, `${field}.type`, issues, 80);
    requiredText(event.title, `${field}.title`, issues, 300);
    if (typeof event.description !== "string") issues.push(`${field}.description debe ser texto.`);
    else if (event.description.length > 2000) issues.push(`${field}.description admite hasta 2000 caracteres.`);
    if (!Array.isArray(event.priorityReason) || !event.priorityReason.length) {
      issues.push(`${field}.priorityReason debe explicar al menos una razón confirmada.`);
    } else {
      event.priorityReason.forEach((reason, reasonIndex) => {
        if (typeof reason !== "string" || !reason.trim()) issues.push(`${field}.priorityReason.${reasonIndex} debe ser texto no vacío.`);
        else if (reason.length > 300) issues.push(`${field}.priorityReason.${reasonIndex} admite hasta 300 caracteres.`);
      });
    }
    if (event.priority !== undefined && !["low", "medium", "high"].includes(event.priority)) {
      issues.push(`${field}.priority debe ser low, medium o high.`);
    }
  });
  for (const [date, entries] of byDate) {
    entries.sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index].startTime < entries[index - 1].endTime) {
        issues.push(`events.${entries[index].index} se solapa con otro evento el ${date}.`);
      }
    }
  }
  return issues;
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function planToCsv(plan) {
  const header = ["id", "fecha", "inicio", "fin", "courseSlug", "asignatura", "tipo", "titulo", "descripcion", "prioridad"];
  const rows = plan.events.map((event) => [
    event.id,
    event.date,
    event.startTime,
    event.endTime,
    event.courseSlug,
    event.courseName,
    event.type,
    event.title,
    event.description,
    event.priority || ""
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function planToMarkdown(plan) {
  return plan.summaryMarkdown.endsWith("\n") ? plan.summaryMarkdown : `${plan.summaryMarkdown}\n`;
}

async function writeExport(path, content) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return target;
}

async function buildPayload(options) {
  const planPath = resolve(options.plan);
  let plan;
  try {
    plan = JSON.parse(await readFile(planPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("El archivo indicado por --plan no contiene JSON válido.");
    throw error;
  }
  const issues = validatePlan(plan);
  if (issues.length) throw new Error(`El plan estructurado no es válido:\n- ${issues.join("\n- ")}`);
  const exports = {};
  if (options.markdown_output) exports.markdownPath = await writeExport(options.markdown_output, planToMarkdown(plan));
  if (options.csv_output) exports.csvPath = await writeExport(options.csv_output, planToCsv(plan));
  const payload = { ...plan, source: "weekly_planning_skill" };
  if (findUndefined(payload)) throw new Error("El payload contiene valores undefined.");
  JSON.stringify(payload);
  return { payload, planPath, ...exports };
}

async function confirmUpload(payload, endpoint, assumeYes) {
  console.log("Planificación estructurada lista para subir:");
  console.log(`- Semestre: ${payload.semesterId}`);
  console.log(`- Semana: ${payload.weekStart} a ${payload.weekEnd}`);
  console.log(`- Zona horaria: ${payload.timezone}`);
  console.log(`- Eventos: ${payload.events.length}`);
  console.log(`- Endpoint: ${endpoint}`);
  if (assumeYes) return true;
  if (!input.isTTY || !output.isTTY) throw new Error("Se requiere confirmación interactiva. Usa --yes solo tras obtener autorización explícita.");
  const prompt = createInterface({ input, output });
  try {
    const answer = (await prompt.question("¿Confirmas el envío a StudyBrain? [s/N] ")).trim().toLowerCase();
    return ["s", "si", "sí", "y", "yes"].includes(answer);
  } finally { prompt.close(); }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const baseUrl = validateOptions(options);
    const { payload, planPath, markdownPath, csvPath } = await buildPayload(options);
    console.log(`Plan validado: ${planPath}`);
    if (markdownPath) console.log(`Markdown exportado: ${markdownPath}`);
    if (csvPath) console.log(`CSV exportado: ${csvPath}`);
    if (options.validate_only) {
      console.log(`Validación correcta: ${payload.events.length} evento(s), timezone ${payload.timezone}.`);
      return;
    }
    const endpoint = new URL("/api/studybrain/planning/import", baseUrl).href;
    if (!await confirmUpload(payload, endpoint, options.yes)) {
      console.log("Envío cancelado. No se modificó StudyBrain.");
      return;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    const responseText = await response.text();
    let responseBody;
    try { responseBody = responseText ? JSON.parse(responseText) : null; } catch { responseBody = responseText; }
    if (!response.ok) {
      if (responseBody?.error === "weekly_planning_disabled") {
        console.error("La planificación semanal está desactivada. Actívala en /agentes antes de volver a enviar.");
      } else if (responseBody?.error) {
        console.error(`${responseBody.error}: ${responseBody.message || "Solicitud rechazada."}`);
      } else {
        console.error(`StudyBrain respondió con error HTTP ${response.status}.`);
      }
      if (responseBody) console.error(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`Planificación subida correctamente (HTTP ${response.status}).`);
    if (responseBody) console.log(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo procesar la planificación.");
    console.error(usage());
    process.exitCode = 1;
  }
}

export { buildPayload, parseArgs, planToCsv, planToMarkdown, validatePlan };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
