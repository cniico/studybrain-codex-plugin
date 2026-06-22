# Plugin: StudyBrain Codex Plugin

## Propósito

Reunir skills de Codex que analicen materiales académicos y, con autorización explícita, envíen resultados estructurados a StudyBrain.

## Skills disponibles

- `evaluation-analysis`: analiza evaluaciones corregidas, propone preguntas, puntajes, contenidos y errores, y solo importa tras confirmación.
- `mastery-analysis`: genera un informe general del ramo usando exclusivamente evidencia real; no estima ni modifica el dominio guardado.
- `weekly-planning`: crea un plan semanal desde contexto académico autorizado y solo lo envía tras confirmación.

## Conexión y seguridad

- Solicitar el token correspondiente solo cuando sea necesario conectar con StudyBrain.
- Mantener el token únicamente en memoria durante la operación.
- No escribir tokens, hashes de tokens, credenciales o datos personales en archivos, commits ni logs.
- Usar exclusivamente conexiones HTTPS y los permisos concedidos por el token.
- Mostrar un resumen de toda importación o plan y esperar confirmación explícita antes de enviarlo.
- No incluir evidencia académica real en este repositorio.

## Endpoints usados

- `POST /api/studybrain/import`
- `GET /api/studybrain/planning/context`
- `POST /api/studybrain/planning/import`

## Instalación

Clona o descarga este repositorio y añade la carpeta completa como plugin local de Codex. También puedes instalar el ZIP disponible en [`releases/`](releases/).
