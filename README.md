# StudyBrain Codex Plugin

Plugin público de Codex para trabajar con evidencia académica y enviar resultados confirmados a [StudyBrain](https://study-brain-cniico.vercel.app).

## Qué puede hacer

- Analizar evaluaciones corregidas y preparar una importación estructurada.
- Generar informes generales del ramo basados únicamente en evidencia registrada.
- Crear una planificación semanal desde el contexto académico autorizado.

## Instalación y uso

1. Descarga el ZIP de [`releases/`](releases/) o clona este repositorio.
2. Conserva completa la carpeta `studybrain-codex-plugin/`.
3. Añádela como plugin local en Codex o pide a Codex que use las skills de esa carpeta.
4. Revisa [`plugin.md`](plugin.md) y solicita la skill que necesites: `evaluation-analysis`, `mastery-analysis` o `weekly-planning`.

Los tokens de StudyBrain se solicitan únicamente al momento de conectar. Nunca deben guardarse en archivos, prompts persistentes, commits ni logs.

Las importaciones de evaluaciones y el envío de planes semanales requieren que Codex muestre primero un resumen y reciba una confirmación explícita del usuario.

## Skills

- [`evaluation-analysis`](skills/evaluation-analysis/SKILL.md)
- [`mastery-analysis`](skills/mastery-analysis/SKILL.md)
- [`weekly-planning`](skills/weekly-planning/SKILL.md)

Los ejemplos incluidos son sintéticos y no contienen datos personales.
