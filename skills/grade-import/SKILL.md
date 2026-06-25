---
name: grade-import
description: Importar notas a StudyBrain desde capturas, imagenes, PDFs, informes o texto copiado: extrae notas sin token cuando sea posible, conecta con Importacion de notas, cruza contra contexto autorizado, muestra una propuesta editable, exige confirmacion explicita y solo entonces registra notas.
---

# Importacion segura de notas

Guiar de principio a fin el registro de notas en StudyBrain cuando el usuario entregue capturas, imagenes, PDFs, informes de notas o texto copiado y pida algo como "Registra estas notas en StudyBrain" o "Analiza esta captura de notas y subelas a mi cuenta".

Usar exclusivamente la infraestructura publica ya disponible:

- `GET /api/studybrain/grades/context`
- `POST /api/studybrain/grades/import`
- permiso `studybrain:grades:read`
- permiso `studybrain:grades:write`
- permiso de Perfil visible como **Importacion de notas**

No usar endpoints administrativos, Firebase Admin, funciones `developer-demo`, otros scopes, otros modelos de notas ni servicios externos de OCR. No inventar datos. No importar nada sin confirmacion explicita sobre la propuesta concreta.

## Flujo obligatorio

1. Recibir archivos o texto del usuario.
2. Leer el material con las capacidades nativas de Codex para archivos, imagenes y PDFs. No implementar OCR propio ni llamar servicios externos nuevos.
3. Extraer una primera lista de notas sin pedir token cuando el material sea legible.
4. Marcar como ilegible, incompleto o dudoso cualquier dato que no pueda confirmarse visualmente o por texto.
5. Solicitar el token de **Importacion de notas** solo cuando sea necesario conectar con StudyBrain para consultar contexto autorizado o importar.
6. Consultar `GET /api/studybrain/grades/context` usando solo el token entregado para esta operacion.
7. Asociar cada nota detectada solo con `courseSlug`, categoria e `itemId` presentes en el contexto autorizado.
8. Mostrar una propuesta editable en tabla con estados claros.
9. Resolver aclaraciones, duplicados y ambiguedades con el usuario.
10. Antes de importar, resumir cuantas notas se registraran, cuantas requieren aclaracion y cuantas se omitiran.
11. Esperar confirmacion final clara, por ejemplo: "Si, importa las 3 notas listas".
12. Llamar `POST /api/studybrain/grades/import` solo con filas listas y reemplazos especificos confirmados.
13. Informar notas registradas, omitidas, pendientes, reemplazos confirmados y ramos afectados.

Una instruccion inicial como "analiza y sube estas notas" autoriza preparar el flujo, pero no reemplaza la confirmacion final sobre filas concretas.

## Archivos admitidos

Aceptar materiales entregados directamente a Codex:

- capturas de pantalla;
- imagenes;
- PDFs;
- informes de notas;
- texto copiado.

Si el archivo esta borroso, cortado, protegido, incompleto, tiene paginas faltantes o no permite confirmar una nota, decirlo claramente y no inventar datos. Pedir una version mas legible o una transcripcion puntual solo de los campos necesarios.

## Extraccion inicial

Detectar cuando sea visible:

- ramo;
- categoria;
- evaluacion o item;
- nota;
- ponderacion, solo como referencia cuando aparezca;
- semestre o periodo, cuando sea visible.

No inventar:

- ramos;
- evaluaciones;
- nombres de items;
- ponderaciones;
- fechas;
- notas.

Las ponderaciones visibles sirven solo como referencia para ayudar al matching o para mostrar contexto al usuario. No usarlas para modificar el modelo de notas ni para crear items.

## Notas chilenas

Aceptar notas con coma decimal, por ejemplo:

```text
6,3
5,8
4,0
```

Normalizar internamente de forma segura para el contrato de importacion, pero mostrar siempre al usuario la nota con coma decimal.

No interpretar automaticamente `63` como `6,3`, salvo que el archivo lo deje inequivocamente claro, por ejemplo por una columna rotulada "Nota x10" o por un patron consistente y documentado en el mismo informe. Si hay duda, marcar la fila como `Requiere confirmacion` y preguntar.

## Contrato de contexto

Despues de recibir el token de **Importacion de notas**, consultar:

```http
GET /api/studybrain/grades/context
Authorization: Bearer <token en memoria>
```

El contexto autorizado debe tratarse como la unica fuente valida para ramos, categorias e items importables. La skill puede trabajar con nombres exactos o campos equivalentes que entregue la API, pero debe conservar esta estructura logica:

```json
{
  "courses": [
    {
      "courseSlug": "algebra",
      "courseName": "Algebra",
      "categories": [
        {
          "name": "Controles",
          "items": [
            {
              "itemId": "item_autorizado",
              "title": "Control 2",
              "confirmedGrade": null
            }
          ]
        }
      ]
    }
  ]
}
```

Tambien pueden venir datos de semestre, periodo, permisos, notas ya registradas o restricciones de la funcion. No mostrar tokens, hashes ni identificadores internos innecesarios al usuario.

Si la API indica que falta `studybrain:grades:read`, que la funcion esta desactivada o que no hay semestre activo, explicar el problema y detener el flujo sin intentar otros endpoints.

## Reglas de matching

Para cada nota detectada:

1. Asociar solo contra ramos presentes en `courses`.
2. Asociar solo contra categorias e items presentes en el contexto autorizado.
3. Priorizar coincidencias exactas de ramo, categoria e item.
4. Usar coincidencias por nombre normalizado solo como sugerencia, no como certeza automatica.
5. Normalizar para sugerir coincidencias quitando tildes, diferencias de mayusculas, espacios dobles y puntuacion menor.
6. No convertir una sugerencia normalizada en lista para importar si hay mas de una posibilidad razonable.
7. Si hay mas de una coincidencia posible, marcar `Ambigua`.
8. Si no hay item compatible, marcar `No encontrada`.
9. Nunca inventar `courseSlug`, categoria ni `itemId`.
10. Nunca importar una fila ambigua, no encontrada o no asociada sin aclaracion explicita del usuario.

Una aclaracion explicita puede ser una frase del usuario que seleccione una evaluacion concreta de la propuesta, por ejemplo: "La de Programacion es Tarea 3 de Laboratorios". Tras la aclaracion, actualizar la tabla y volver a pedir confirmacion final.

## Estados de la propuesta

Usar exactamente estos estados:

- `Lista para importar`
- `Requiere confirmacion`
- `Ambigua`
- `Ya existe`
- `No encontrada`

`Lista para importar` exige nota valida y asociacion unica con `courseSlug`, categoria e `itemId` autorizados.

`Requiere confirmacion` aplica cuando el dato probablemente es usable, pero falta una confirmacion humana antes de importarlo, por ejemplo una nota escrita como `63` sin coma.

`Ambigua` aplica cuando hay dos o mas coincidencias razonables.

`Ya existe` aplica cuando el contexto o la importacion indique que el item ya tiene una nota confirmada.

`No encontrada` aplica cuando no hay item autorizado compatible.

## Vista previa obligatoria

Antes de importar, mostrar una tabla clara y editable con estas columnas:

```text
Ramo | Categoria | Evaluacion o item | Nota detectada | Coincidencia | Estado | Observacion
```

Ejemplo:

```text
Algebra | Controles | Control 2 | 5,8 | Coincidencia exacta | Lista para importar | -
Programacion | Tareas | Tarea 3 | 6,1 | Dos posibles coincidencias | Ambigua | Elegir evaluacion
Fisica | Laboratorios | Informe 1 | 63 | Item encontrado, nota sin decimal visible | Requiere confirmacion | Confirmar si es 6,3 o 63
```

La tabla debe ser editable en la conversacion: si el usuario corrige ramo, categoria, item o nota, reconstruir la propuesta con la correccion y volver a mostrar los cambios relevantes.

No importar filas `Ambigua`, `Ya existe`, `No encontrada` ni `Requiere confirmacion` hasta que el usuario resuelva especificamente cada caso y la fila quede lista.

## Duplicados y notas ya existentes

Cuando `grades/context` indique una nota existente o `grades/import` responda que la nota ya existe:

1. No sobrescribir automaticamente.
2. Mostrar la nota actual y la nota detectada, sin exponer IDs internos innecesarios.
3. Preguntar explicitamente que hacer con esa nota especifica.
4. Aceptar reemplazo solo si el usuario confirma esa fila concreta, por ejemplo: "Reemplaza Control 2 de Algebra por 5,8".
5. Usar `action: "replaceConfirmedGrade"` solo para esa nota especifica y solo despues de esa confirmacion.
6. Nunca usar reemplazo masivo.

Si el usuario dice "importa todas" y hay filas `Ya existe`, omitir esas filas y explicar que requieren confirmacion especifica de reemplazo.

## Confirmacion final

Antes de llamar `POST /api/studybrain/grades/import`, resumir:

```text
X notas listas para registrar
Y notas requieren aclaracion
Z notas se omitiran
```

Luego pedir una confirmacion clara. Ejemplos validos:

```text
Si, importa las X notas listas.
Registra las 2 notas listas y omite las ambiguas.
Reemplaza Control 2 de Algebra por 5,8 e importa las demas listas.
```

Ejemplos insuficientes:

```text
ok
dale
subelas
```

Si la confirmacion es insuficiente, pedir que confirme explicitamente cuantas notas listas quiere importar y, si aplica, que nombre cada reemplazo.

## Contrato de importacion

Enviar a:

```http
POST /api/studybrain/grades/import
Authorization: Bearer <token en memoria>
Content-Type: application/json
```

Construir el payload solo con filas autorizadas y confirmadas. La forma exacta debe seguir el contrato vigente de StudyBrain, preservando esta estructura logica:

```json
{
  "grades": [
    {
      "courseSlug": "algebra",
      "category": "Controles",
      "itemId": "item_autorizado",
      "grade": 5.8,
      "displayGrade": "5,8",
      "source": {
        "kind": "screenshot",
        "label": "captura entregada por el usuario"
      }
    }
  ]
}
```

Para un reemplazo confirmado de forma especifica, incluir solo esa fila con la accion requerida por la API:

```json
{
  "courseSlug": "algebra",
  "category": "Controles",
  "itemId": "item_autorizado",
  "grade": 5.8,
  "displayGrade": "5,8",
  "action": "replaceConfirmedGrade"
}
```

No incluir filas ambiguas, no encontradas, ilegibles, sin item autorizado o pendientes de confirmacion. No enviar datos de otra cuenta ni IDs inventados.

Si la API responde que falta `studybrain:grades:write`, que la funcion esta desactivada, que el item no pertenece al contexto autorizado o que hay conflicto de duplicado, detener esa fila, informar el motivo y no intentar endpoints alternativos.

## Resultado final

Despues de importar, informar:

- notas registradas;
- notas omitidas;
- notas que quedaron pendientes;
- reemplazos confirmados, si hubo;
- ramos afectados.

No mostrar tokens, hashes, payload completo con IDs internos innecesarios ni datos sensibles. Si una fila falla por validacion de StudyBrain, mantenerla pendiente y explicar que requiere correccion o confirmacion.

## Seguridad

- Pedir el token solo al conectar con StudyBrain.
- Mantener el token solo en memoria durante la operacion.
- No escribir tokens en archivos, prompts persistentes, commits, logs ni tablas.
- Usar exclusivamente HTTPS hacia StudyBrain.
- Operar solo con ramos, categorias e items entregados por `grades/context`.
- No usar endpoints administrativos ni Firebase Admin.
- No usar funciones de developer-demo.
- No modificar scopes, modelo de notas ni seguridad existente.
- No inferir que un token permite operar otra cuenta.
- No exponer datos sensibles ni IDs internos salvo que sean imprescindibles para resolver una ambiguedad tecnica.

## Ejemplos de interaccion

### 1. Captura con una nota y coincidencia exacta

Usuario: "Registra esta captura de notas en StudyBrain."

Accion:

1. Leer la captura sin token.
2. Extraer: ramo `Algebra`, categoria `Controles`, item `Control 2`, nota `5,8`.
3. Pedir token de **Importacion de notas** para conectar.
4. Consultar `grades/context`.
5. Encontrar una unica coincidencia autorizada: `Algebra > Controles > Control 2`.
6. Mostrar:

```text
Ramo | Categoria | Evaluacion o item | Nota detectada | Coincidencia | Estado | Observacion
Algebra | Controles | Control 2 | 5,8 | Coincidencia exacta | Lista para importar | -
```

7. Resumir: `1 nota lista para registrar, 0 requieren aclaracion, 0 se omitiran`.
8. Esperar: "Si, importa la 1 nota lista."
9. Importar solo esa fila.
10. Informar que se registro `Algebra - Control 2: 5,8`.

### 2. PDF con varias notas y una coincidencia ambigua

Usuario: "Analiza este PDF de notas y subelas."

Accion:

1. Leer el PDF sin token.
2. Extraer:
   - `Programacion`, `Tareas`, `Tarea 3`, `6,1`;
   - `Calculo`, `Pruebas`, `Prueba 1`, `5,4`.
3. Pedir token solo para conectar.
4. Consultar `grades/context`.
5. Detectar que `Programacion > Tareas > Tarea 3` coincide con dos items autorizados similares: `Tarea 3 - Codigo` y `Tarea 3 - Informe`.
6. Detectar coincidencia exacta para `Calculo > Pruebas > Prueba 1`.
7. Mostrar:

```text
Ramo | Categoria | Evaluacion o item | Nota detectada | Coincidencia | Estado | Observacion
Programacion | Tareas | Tarea 3 | 6,1 | Dos posibles coincidencias | Ambigua | Elegir entre Tarea 3 - Codigo y Tarea 3 - Informe
Calculo | Pruebas | Prueba 1 | 5,4 | Coincidencia exacta | Lista para importar | -
```

8. Resumir: `1 nota lista para registrar, 1 requiere aclaracion, 0 se omitiran`.
9. Si el usuario confirma importar solo la lista, importar `Calculo` y dejar `Programacion` pendiente.
10. Si el usuario aclara "Programacion es Tarea 3 - Informe", actualizar la tabla y pedir confirmacion final antes de importar ambas.

### 3. Nota ya registrada que requiere reemplazo confirmado

Usuario: "Sube esta nota de Algebra, Control 2: 5,8."

Accion:

1. Extraer la nota desde el texto sin token.
2. Pedir token de **Importacion de notas** para conectar.
3. Consultar `grades/context`.
4. Detectar que `Algebra > Controles > Control 2` ya tiene nota confirmada `5,5`.
5. Mostrar:

```text
Ramo | Categoria | Evaluacion o item | Nota detectada | Coincidencia | Estado | Observacion
Algebra | Controles | Control 2 | 5,8 | Coincidencia exacta, nota existente | Ya existe | Actual: 5,5; detectada: 5,8
```

6. No importar ni reemplazar con una confirmacion general.
7. Preguntar: "Esta nota ya existe como 5,5. Si quieres reemplazarla, confirma especificamente: Reemplaza Control 2 de Algebra por 5,8."
8. Solo si el usuario confirma esa frase o una equivalente especifica, enviar esa fila con `action: "replaceConfirmedGrade"`.
9. Informar el reemplazo confirmado en el resultado final.

Consultar [`../../plugin.md`](../../plugin.md) para las reglas compartidas de conexion y seguridad.
