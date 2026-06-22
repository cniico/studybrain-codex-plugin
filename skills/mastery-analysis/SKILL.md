---
name: mastery-analysis
description: Genera un informe general de un ramo usando exclusivamente evidencia existente de evaluaciones corregidas con preguntas o ítems, puntajes obtenidos y totales, y contenidos vinculados; resume cobertura, refuerzos, errores recurrentes y evolución sin estimar dominio. Usar cuando el usuario pida un panorama académico, una síntesis de dominio respaldado o contenidos sin evidencia en StudyBrain.
---

# Informe general del ramo

Generar una síntesis académica del ramo sin crear ni modificar dominio por contenido. Tratar la ausencia de evidencia como ausencia de evidencia, nunca como bajo desempeño.

## Evidencia admisible

Incluir un resultado por contenido solo cuando provenga de una evaluación corregida que tenga:

- preguntas o ítems identificables;
- puntaje obtenido y puntaje total válidos;
- uno o más contenidos vinculados;
- origen registrado como manual, StudyAI Beta o `evaluation-analysis`/agente.

Usar temarios para determinar qué contenidos existen y cuáles aún no tienen evidencia. Usar notas globales, comentarios, temarios y errores sin vínculo a un ítem únicamente como contexto descriptivo; no convertirlos en porcentajes, niveles ni evidencia de dominio.

## Reglas inviolables

- No inventar preguntas, puntajes, contenidos, errores, evaluaciones ni vínculos.
- No calcular porcentajes ni niveles para contenidos sin evidencia admisible.
- No completar huecos mediante inferencias, promedios del ramo, notas globales o autopercepción.
- No crear `score`, `level`, `confidence` ni equivalentes estimados.
- No sobrescribir, recalcular ni importar el dominio guardado por contenido.
- No usar `POST /api/studybrain/mastery/import` para escribir estimaciones.
- No generar ejercicios, cuestionarios ni práctica personalizada.
- No presentar un error como real si no está vinculado a una evaluación o ítem corregido.

## Flujo

1. Limitar todos los datos al mismo semestre y ramo.
2. Enumerar el temario vigente y las evaluaciones analizadas disponibles.
3. Validar cada ítem: puntajes numéricos, total mayor que cero, puntaje obtenido no mayor que el total y contenido vinculado.
4. Excluir del cálculo cualquier ítem incompleto y declararlo en `dataWarnings` sin rellenar datos faltantes.
5. Resumir los contenidos con evidencia usando únicamente los resultados reales ya registrados.
6. Identificar contenidos que requieren refuerzo según sus puntajes reales, sin inventar umbrales si StudyBrain no entrega uno. Si no hay criterio explícito, describir comparaciones observables como “menor desempeño relativo”.
7. Agrupar errores equivalentes solo cuando compartan tipo normalizado y contenido o contexto comparable. Conservar la cantidad y las evaluaciones de origen.
8. Comparar evolución únicamente cuando el mismo contenido tenga evidencia válida en al menos dos evaluaciones ordenables. Indicar mejora, descenso o estabilidad a partir de los puntajes observados.
9. Enumerar los contenidos del temario sin evidencia admisible.
10. Proponer recomendaciones generales breves y trazables a los datos; no convertirlas en práctica personalizada.

## Salida

Entregar un informe legible y, cuando sea útil, un JSON estructurado. El informe debe incluir:

- panorama general del ramo;
- contenidos con evidencia suficiente;
- contenidos que requieren refuerzo según puntajes reales;
- errores más repetidos;
- evolución entre evaluaciones, cuando exista;
- evaluaciones analizadas;
- contenidos sin evidencia suficiente;
- recomendaciones generales breves;
- advertencias sobre datos faltantes o inválidos.

No usar el objeto `mastery` ni una salida compatible con `/api/studybrain/mastery/import`. Si el usuario pide guardar el informe, hacerlo solo mediante un mecanismo dedicado a reportes generales y claramente separado del dominio por contenido. Si ese mecanismo no existe, entregar el informe sin persistirlo.

Consultar [`../../plugin.md`](../../plugin.md) para las reglas compartidas de conexión y seguridad. No guardar tokens en archivos.
