# Backlog

Ideas discutidas pero no implementadas todavía.

## Memoria cooperativa entre agentes

Hoy no existe memoria compartida en ningún nivel:

- **Entre especialistas:** cuando el orquestador delega con la tool `Agent`, cada
  subagente arranca aislado — solo recibe su `prompt` fijo y la `description` corta
  de esa delegación. No ve el historial del orquestador ni lo que hicieron otros
  especialistas. Lo único compartido es `mock-data.ts`, que es solo lectura estática.
- **Entre preguntas (sesión de chat):** cada llamada a `ejecutarConsulta()` crea un
  `query()` nuevo. El SDK sí soporta sesiones persistentes (`resume`/`sessionId`,
  ver `sdk.d.ts`), pero no las usamos — el chat no recuerda preguntas anteriores.

Dos mejoras posibles, en orden de esfuerzo:
1. **Memoria de sesión del chat** (fácil): usar `resume`/`sessionId` del SDK para que
   el orquestador recuerde preguntas anteriores en la misma pestaña/conversación.
2. **Memoria cooperativa entre agentes** (más trabajo): un contexto compartido que el
   orquestador arme con hallazgos de un especialista antes de delegar en el siguiente
   (ej. que `reportes` no vuelva a preguntar lo que `financiero` ya resolvió).
