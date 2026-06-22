---
name: weekly-planning
description: Generar una planificación académica semanal genérica para StudyBrain desde un contexto JSON estructurado, con plan JSON canónico y adaptadores Markdown/CSV. Usar cuando el usuario pida planificar o replanificar una semana con disponibilidad confirmada.
---

# Planificación semanal para StudyBrain

Generar primero un plan JSON que cumpla `plan.schema.json`. Ese objeto es la única fuente de verdad. Derivar de él, sin reinterpretarlo:

- `plan_semanal_general.md`, desde `summaryMarkdown`;
- `eventos_exportables.csv`, desde `events`.

No usar Markdown ni CSV como entrada interna obligatoria. No generar ejercicios personalizados, quizzes ni práctica tipo Duolingo.

## Obtener contexto desde StudyBrain

Cuando el usuario autorice la lectura y entregue un token de planificación, consultar primero la API privada:

```bash
node skills/weekly-planning/scripts/fetch-weekly-planning-context.mjs \
  --base-url "https://study-brain-cniico.vercel.app" \
  --week-start <YYYY-MM-DD> \
  --week-end <YYYY-MM-DD> \
  --timezone <IANA> \
  --output context.json
```

`semesterId` es opcional: StudyBrain resuelve el semestre activo cuando no se envía. La consulta requiere `studybrain:planning:read` y la función Planificación semanal activa. No usar un token antiguo de escritura como permiso implícito de lectura.

Revisar `missingContext` antes de planificar. Solicitar al usuario únicamente los datos ausentes necesarios, en especial disponibilidad, bloques ocupados y preferencias. No completar esos campos mediante inferencias.

## Confirmación previa de evaluaciones

Antes de construir un plan, consultar el contexto disponible de StudyBrain y revisar las evaluaciones futuras confirmadas del contexto `evaluations`.

Si faltan fechas, horas o evaluaciones relevantes para la semana, detenerse y pedirlas explícitamente al usuario. Mostrar primero un resumen simple de lo detectado e indicar qué datos aún necesitan confirmación.

No inventar fechas ni asumir que una evaluación anterior sigue vigente. Si una evaluación no tiene hora confirmada, usar solo la fecha como prioridad y no crear un bloque ocupado inventado. Solo después de recibir esa confirmación construir el plan y enviar a StudyBrain el contexto estructurado con las evaluaciones validadas.

## Contratos

- Entrada: `context.schema.json`.
- Salida canónica: `plan.schema.json`.

Bloquean la creación del plan:

- `version` incompatible;
- `semester.id` ausente o inválido;
- `week.start`, `week.end` o `week.timezone` ausentes o inválidos;
- rango con `week.end` anterior a `week.start`;
- referencias académicas a un `courseSlug` que no existe en `courses`.

No bloquean la creación, pero reducen la precisión y deben registrarse en `warnings` o `dataGaps`:

- `evaluations`, `syllabusTopics`, `mastery`, `errors`, `recommendations`, `studyPreferences`, `previousPlans` o `weeklyGoal` ausentes;
- `availability` ausente o vacía;
- `busyBlocks` ausente.

Normalizar los campos opcionales ausentes a arreglos vacíos, objeto vacío o `null`, según `context.schema.json`. Nunca convertir la ausencia en un hecho inventado.

## Identidad y referencias

Cada ramo debe tener `courseSlug` estable y `courseName` visible. Evaluaciones, temarios, señales y eventos deben referenciar el ramo por `courseSlug`; `courseName` no es identificador.

Todos los eventos generados por esta skill son académicos y requieren un `courseSlug` presente en `courses`. Cada evento también requiere un `id` estable y único dentro del plan. Construirlo de forma determinista con tipo, `courseSlug`, fecha y hora, agregando un sufijo estable si hay colisión.

## Semana y zona horaria

Copiar sin inferencias:

- `week.start` a `plan.weekStart`;
- `week.end` a `plan.weekEnd`;
- `week.timezone` a `plan.timezone`;
- `week.weekStartsOn` a `plan.weekStartsOn`, si existe.

No inferir el rango desde eventos. No desplazar fechas por la zona horaria. `monday` es solo el valor predeterminado documentado de `weekStartsOn` cuando no se recibe una preferencia; `week.start` y `week.end` siempre mandan.

## Reglas universales

1. Programar solo dentro de `availability` confirmada.
2. Restar cualquier intervalo de `busyBlocks` antes de crear eventos.
3. No solapar eventos.
4. Mantener todos los eventos dentro de `week.start` y `week.end`.
5. Exigir `endTime` posterior a `startTime`.
6. Respetar `studyPreferences.maxBlockMinutes` cuando se reciba.
7. No inventar disponibilidad, clases, comidas, gimnasio, feriados, obligaciones, horarios ni fechas de evaluación.
8. No crear un evento de evaluación si su horario no fue informado.
9. No asignar importancia, dificultad, riesgo ni prioridad como hechos si no llegaron en el contexto.
10. No crear reglas por ramo, universidad, carrera, periodo académico o zona horaria.
11. Mostrar un resumen de evaluaciones detectadas o confirmadas antes de enviar el plan a StudyBrain.

Si no queda disponibilidad útil, crear un plan válido con `events: []`. Explicar en `summaryMarkdown` y `warnings` que no se programaron bloques por falta de disponibilidad confirmada. No rechazar la semana.

## Priorización trazable

Usar únicamente señales recibidas, por ejemplo:

- fecha de evaluación confirmada;
- nivel de dominio informado;
- error reciente informado;
- recomendación recibida;
- objetivo semanal explícito;
- continuidad documentada en `previousPlans`.

Cada evento debe incluir `priorityReason` con razones breves vinculadas a esas señales. `priority` es opcional: incluirlo solo cuando el contexto permita sostenerlo. Si una señal falta, agregar una advertencia; no reemplazarla por una suposición.

## Flujo

1. Confirmar que el usuario activó Planificación semanal y generó un token con permisos de planificación.
2. Consultar `GET /api/studybrain/planning/context` con semana y zona horaria explícitas.
3. Revisar `evaluations` para detectar evaluaciones futuras confirmadas y resumirlas al usuario en formato simple.
4. Si faltan fechas, horas o evaluaciones relevantes, pedirlas explícitamente antes de continuar.
5. Leer `missingContext` y solicitar disponibilidad, bloques ocupados o preferencias que sigan ausentes.
6. Validar los campos bloqueantes y normalizar opcionales sin inventar datos.
7. Comprobar que todo `courseSlug` referenciado existe en `courses`.
8. Tomar literalmente rango y zona horaria.
9. Calcular ventanas utilizables a partir de `availability` menos `busyBlocks`.
10. Ordenar tareas solo con señales explícitas y documentar las razones.
11. Crear eventos válidos o un arreglo vacío.
12. Validar rango, duración, identidad, referencias y ausencia de solapamientos.
13. Construir el objeto que cumple `plan.schema.json` y derivar Markdown/CSV.
14. Mostrar el plan; tras confirmación, subirlo con `studybrain:planning:write`.

## Adaptadores

El Markdown debe incluir semana, zona horaria, prioridades sustentadas, eventos, advertencias, datos faltantes y decisiones. Su contenido canónico vive en `plan.summaryMarkdown`.

El CSV debe usar exactamente:

```csv
id,fecha,inicio,fin,courseSlug,asignatura,tipo,titulo,descripcion,prioridad
```

Generar ambos con el uploader para evitar divergencias:

```bash
node skills/weekly-planning/scripts/upload-weekly-planning.mjs \
  --plan plan.json \
  --validate-only \
  --markdown-output plan_semanal_general.md \
  --csv-output eventos_exportables.csv
```

## Envío a StudyBrain

- Leer la URL desde `STUDYBRAIN_BASE_URL`.
- Pedir el token en tiempo de ejecución si `STUDYBRAIN_AGENT_TOKEN` no está disponible de forma segura.
- Mantener el token solo en memoria, no imprimirlo ni guardarlo.
- Usar HTTPS y solicitar confirmación antes de enviar.
- Ejecutar `upload-weekly-planning.mjs --plan <plan.json>`.
- Permitir `events: []`.
- Si la API responde `weekly_planning_disabled`, indicar que la función debe activarse en `/agentes`.
- Si responde `missing_planning_read_scope`, solicitar un token de planificación; no reutilizar permisos antiguos.
- Si responde `missing_active_semester`, pedir al usuario que seleccione un semestre activo en StudyBrain.
- Si responde `invalid_week_range` o `invalid_timezone`, corregir la consulta sin inferir valores.

La API solo devuelve datos registrados. Disponibilidad, bloques ocupados, preferencias, objetivo semanal, calendario y cumplimiento permanecen vacíos hasta que el usuario los entregue.
