#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VALID_SEVERITIES = new Set(["low", "medium", "high"]);
const VALID_ERROR_TYPES = new Set([
  "conceptual",
  "procedural",
  "calculation",
  "interpretation",
  "notation",
  "attention",
  "other"
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateSeverity(value, field, issues, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) issues.push(`${field} es obligatorio.`);
    return;
  }
  if (!VALID_SEVERITIES.has(value)) {
    issues.push(`${field} debe ser low, medium o high.`);
  }
}

function validateErrorType(value, field, issues, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) issues.push(`${field} es obligatorio.`);
    return;
  }
  if (!VALID_ERROR_TYPES.has(value)) {
    issues.push(`${field} no es un errorType válido.`);
  }
}

export function validateEvaluationAnalysis(payload) {
  const issues = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["El JSON debe contener un objeto en la raíz."];
  }

  if (!isNonEmptyString(payload.semesterId)) issues.push("semesterId es obligatorio.");
  if (!isNonEmptyString(payload.courseSlug)) issues.push("courseSlug es obligatorio.");
  if (!payload.evaluation || typeof payload.evaluation !== "object" || Array.isArray(payload.evaluation)) {
    issues.push("evaluation debe ser un objeto.");
  } else {
    const { evaluation } = payload;
    if (!isNonEmptyString(evaluation.title)) issues.push("evaluation.title es obligatorio.");
    if (!isFiniteNumber(evaluation.score) || evaluation.score < 0) {
      issues.push("evaluation.score debe ser un número igual o mayor a 0.");
    }
    if (!isFiniteNumber(evaluation.maxScore) || evaluation.maxScore <= 0) {
      issues.push("evaluation.maxScore debe ser un número mayor a 0.");
    }
    if (isFiniteNumber(evaluation.score) && isFiniteNumber(evaluation.maxScore) && evaluation.score > evaluation.maxScore) {
      issues.push("evaluation.score no puede superar evaluation.maxScore.");
    }
    if (evaluation.grade !== null && evaluation.grade !== undefined && !isFiniteNumber(evaluation.grade)) {
      issues.push("evaluation.grade debe ser un número o null.");
    }
  }

  for (const field of ["contents", "items", "errors"]) {
    if (!Array.isArray(payload[field])) issues.push(`${field} debe ser un array.`);
  }

  if (Array.isArray(payload.contents)) {
    payload.contents.forEach((content, index) => {
      if (!content || typeof content !== "object" || !isNonEmptyString(content.name)) {
        issues.push(`contents.${index}.name es obligatorio.`);
      }
    });
  }

  if (Array.isArray(payload.items)) {
    payload.items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        issues.push(`items.${index} debe ser un objeto.`);
        return;
      }
      if (!isNonEmptyString(item.prompt)) issues.push(`items.${index}.prompt es obligatorio.`);
      const excluded = item.excludeFromMastery === true || item.excludedFromMastery === true;
      if (!Array.isArray(item.contentLinks)) issues.push(`items.${index}.contentLinks debe ser un array.`);
      if (!excluded && Array.isArray(item.contentLinks) && !item.contentLinks.length) issues.push(`items.${index}.contentLinks requiere al menos un contenido.`);
      if (Array.isArray(item.contentLinks)) {
        const total = item.contentLinks.reduce((sum, link, linkIndex) => {
          if (!link || typeof link !== "object") {
            issues.push(`items.${index}.contentLinks.${linkIndex} debe ser un objeto.`);
            return sum;
          }
          if (!isNonEmptyString(link.contentId) && !isNonEmptyString(link.contentName)) issues.push(`items.${index}.contentLinks.${linkIndex} requiere contentId o contentName.`);
          if (!isFiniteNumber(link.weightPercent) || link.weightPercent <= 0 || link.weightPercent > 100) issues.push(`items.${index}.contentLinks.${linkIndex}.weightPercent debe estar entre 0 y 100.`);
          return sum + (isFiniteNumber(link.weightPercent) ? link.weightPercent : 0);
        }, 0);
        if (!excluded && Math.abs(total - 100) > 0.001) issues.push(`items.${index}.contentLinks debe sumar 100%.`);
      }
      if (!isFiniteNumber(item.maxPoints) || item.maxPoints <= 0) issues.push(`items.${index}.maxPoints debe ser mayor a 0.`);
      if (!isFiniteNumber(item.earnedPoints) || item.earnedPoints < 0) issues.push(`items.${index}.earnedPoints debe ser igual o mayor a 0.`);
      if (isFiniteNumber(item.maxPoints) && isFiniteNumber(item.earnedPoints) && item.earnedPoints > item.maxPoints) {
        issues.push(`items.${index}.earnedPoints no puede superar maxPoints.`);
      }
      validateErrorType(item.errorType, `items.${index}.errorType`, issues);
      validateSeverity(item.severity, `items.${index}.severity`, issues);
      if (item.uncertain !== undefined && typeof item.uncertain !== "boolean") {
        issues.push(`items.${index}.uncertain debe ser boolean.`);
      }
      if (item.excludeFromMastery !== undefined && typeof item.excludeFromMastery !== "boolean") issues.push(`items.${index}.excludeFromMastery debe ser boolean.`);
    });
  }

  if (Array.isArray(payload.errors)) {
    payload.errors.forEach((error, index) => {
      if (!error || typeof error !== "object") {
        issues.push(`errors.${index} debe ser un objeto.`);
        return;
      }
      if (!Array.isArray(error.contentNames)) issues.push(`errors.${index}.contentNames debe ser un array.`);
      validateErrorType(error.type, `errors.${index}.type`, issues, { required: true });
      validateSeverity(error.severity, `errors.${index}.severity`, issues, { required: true });
    });
  }

  return issues;
}

export async function loadEvaluationAnalysis(filePath) {
  const resolvedPath = path.resolve(filePath);
  let fileStats;
  try {
    fileStats = await stat(resolvedPath);
  } catch {
    throw new Error(`No existe el archivo JSON: ${resolvedPath}`);
  }
  if (!fileStats.isFile()) throw new Error(`La ruta no es un archivo: ${resolvedPath}`);

  let payload;
  try {
    payload = JSON.parse(await readFile(resolvedPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`El archivo no contiene JSON válido: ${error.message}`);
    throw error;
  }
  return { payload, resolvedPath, issues: validateEvaluationAnalysis(payload) };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || process.argv.length > 3) {
    console.error("Uso: node validate-evaluation-analysis.mjs <archivo.json>");
    process.exitCode = 1;
    return;
  }

  try {
    const { resolvedPath, issues } = await loadEvaluationAnalysis(filePath);
    if (issues.length) {
      console.error(`JSON inválido (${issues.length} problema(s)):`);
      issues.forEach((issue) => console.error(`- ${issue}`));
      process.exitCode = 1;
      return;
    }
    console.log(`JSON válido: ${resolvedPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo validar el JSON.");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) await main();
