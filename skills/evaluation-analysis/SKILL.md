---
name: evaluation-analysis
description: Ejecuta de principio a fin el análisis e importación de una evaluación corregida desde PDF, imagen, captura, texto, pauta o feedback: identifica archivos, obtiene contexto y temario, detecta la jerarquía real, extrae evidencia, propone vínculos y errores, pide confirmación y solo entonces importa a StudyBrain. Usar cuando el usuario diga “analiza esta prueba corregida”, “súbela a StudyBrain” o quiera registrar evidencia sin copiar prompts adicionales.
---

# Analizar e importar evaluaciones corregidas

Completar el flujo con una sola petición del usuario. No pedir que copie prompts, construya JSON ni ejecute comandos. No modificar notas manuales u otros datos de StudyBrain.

## Flujo obligatorio

1. Identificar todos los archivos o materiales que forman la evaluación corregida. Leer todas sus páginas e imágenes y respetar su orden.
2. Inferir el ramo y la evaluación desde el archivo, la conversación y el contexto disponible. Pedirlos solo si no se pueden determinar con seguridad o requieren confirmación entre alternativas.
3. Solicitar el token de **Importaciones académicas** únicamente cuando sea necesario consultar contexto autorizado o realizar la importación. Mantenerlo solo en memoria y no repetirlo en mensajes, archivos, JSON o logs.
4. Consultar el semestre, ramo, evaluación y temario disponibles mediante la conexión autorizada a StudyBrain o el contexto ya presente en la sesión. El token actual de importación no concede por sí solo lectura general: si el entorno no permite consultar el temario, pedir al usuario el temario exacto o una exportación antes de vincular contenidos. No usar el endpoint de Planificación para suplir esta lectura.
5. Reconstruir la jerarquía real del documento a partir de encabezados, indentación, proximidad visual, cajas, tablas, etiquetas y continuidad entre páginas. Detectar dinámicamente secciones, ítems, preguntas, subpreguntas y apartados; no asumir números romanos, letras ni una numeración fija.
6. Detectar enunciados, respuestas del estudiante, puntajes obtenidos y totales, correcciones, marcas y comentarios visibles. Distinguir la respuesta del estudiante, la pauta y el feedback docente.
7. Vincular cada unidad evaluable únicamente con contenidos reales del temario consultado. Conservar el camino jerárquico al aplanar las unidades evaluables para el payload, por ejemplo dentro de `prompt`.
8. Marcar `uncertain: true` ante texto, autoría, puntaje, jerarquía o vínculo dudoso. No inventar puntajes, feedback, respuestas, errores, contenidos ni porcentajes.
9. Preparar y mostrar una propuesta resumida con evaluación, estructura detectada, preguntas o ítems, puntajes, contenidos vinculados, errores e incertidumbres. No mostrar el token.
10. Esperar confirmación explícita. Una instrucción inicial como “analiza y súbela” autoriza preparar el flujo, pero no reemplaza la confirmación sobre la propuesta concreta.
11. Solo después de confirmar, importar la evidencia detallada mediante `POST /api/studybrain/import`, usando `scripts/upload-evaluation-analysis.mjs` cuando esté disponible.
12. Informar el resultado y explicar que StudyBrain recalculará automáticamente el dominio por contenido desde los puntajes reales y sus vínculos.

Si el usuario no confirma, detenerse sin importar. No llamar `mastery-analysis` automáticamente.

## Extracción jerárquica

- Modelar primero un árbol interno fiel al documento y después convertir sus hojas evaluables en `items`.
- No crear un ítem separado para un encabezado sin puntaje o respuesta; usarlo como contexto de sus descendientes.
- Mantener juntos los apartados cuando comparten un único puntaje indivisible.
- Separar subpreguntas cuando tienen enunciado, respuesta o puntaje propio.
- Preservar etiquetas visibles sin depender de su formato. Si no existe una etiqueta, usar una descripción neutra basada en la posición, sin inventar numeración.
- Evitar contar dos veces un puntaje presente tanto en una subpregunta como en el subtotal de su sección.

## Evidencia y contenidos

- Exigir `maxPoints > 0` y `0 <= earnedPoints <= maxPoints` para cada ítem incluido en el cálculo.
- No deducir un error solo porque se descontaron puntos; exigir respuesta, corrección, marca o comentario visible.
- Mantener separados `correctionDescription`, `teacherFeedback` y `studentNote`.
- Usar `contentLinks` con `contentId` cuando esté disponible o con el nombre exacto del temario.
- No asociar todos los contenidos a todas las preguntas.
- Si el vínculo no es seguro, usar `excludeFromMastery: true`, `uncertain: true` y explicar la incertidumbre.
- Si una pregunta cubre varios contenidos, usar la distribución visible. No inventar porcentajes; si no existe una distribución defendible, excluirla del cálculo hasta recibir aclaración.
- Hacer que los `weightPercent` de cada pregunta incluida sumen 100%.

Clasificar errores como `calculation`, `conceptual`, `procedural`, `interpretation`, `notation`, `attention`, `unanswered` u `other`. Usar severidad `low`, `medium` o `high` solo cuando la evidencia permita sostenerla; de lo contrario dejarla sin clasificar en la propuesta y pedir confirmación o aclaración antes de importar.

## Propuesta previa

Mostrar un resumen compacto, no solo el JSON:

- ramo, semestre, evaluación y fecha si existe;
- jerarquía detectada y cantidad de unidades evaluables;
- puntaje total y desglose por unidad;
- contenidos vinculados por unidad;
- errores respaldados por evidencia visible;
- campos ilegibles, ambiguos o excluidos del dominio.

Después preguntar de forma inequívoca si se autoriza importar esa propuesta. Si el usuario corrige algo, actualizar la propuesta y volver a pedir confirmación.

## Contrato e importación

Construir un payload con `semesterId`, `courseSlug`, `evaluation.title`, `evaluation.maxScore > 0` y los arrays `contents`, `items` y `errors`. StudyBrain resuelve los contenidos contra el temario existente y rechaza coincidencias ausentes o ambiguas.

Antes de importar, revisar el contrato con `scripts/validate-evaluation-analysis.mjs`. Después de la confirmación explícita, ejecutar el uploader con el token solo en memoria. Usar `--yes` únicamente cuando la confirmación ya conste en la conversación y no exista terminal interactiva.

La skill no calcula, estima ni importa porcentajes o niveles de dominio. `/api/studybrain/import` guarda evidencia detallada; StudyBrain realiza el recálculo desde los puntajes reales. No usar `/api/studybrain/mastery/import` ni invocar `mastery-analysis` como parte de este flujo.

Consultar [`../../plugin.md`](../../plugin.md) para las reglas compartidas de conexión y seguridad.
