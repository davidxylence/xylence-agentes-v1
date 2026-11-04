# Xylence agentes — V1 (datos de prueba + conectores reales)

Un orquestador y 7 subagentes con el Claude Agent SDK (corriendo sobre AWS Bedrock),
para aprender cómo funciona la orquestación multi-agente, afinar los prompts, y
probar conectores reales (Gmail, Slack) antes de integrar con el `orchestrator-server`
real y la UI de producto.

Incluye una CLI, un servidor web con chat en vivo + tarjetas de transparencia por
agente, y dos capas de memoria (cooperativa entre agentes dentro de una consulta,
e investigación persistente entre sesiones).

## Correr

```bash
npm install
cp .env.example .env
# Pega tu AWS_BEARER_TOKEN_BEDROCK (ver abajo) y, si los tienes, GMAIL_*/SLACK_BOT_TOKEN
```

**CLI** (una pregunta, imprime la traza y el costo):
```bash
npm start "¿Qué reuniones tengo el martes?"
npm start "Dame el reporte semanal"
npm start "Revisa el term sheet de Kolmo"
```

**Servidor web** (chat en vivo + tarjetas de agentes + conectores):
```bash
npm run serve
# http://localhost:5174           chat general + tarjetas por agente (system prompt real + prueba individual)
# http://localhost:5174/conectores estado de Gmail/Slack y cómo conectarlos
```

### La API key de Bedrock

No usamos AWS SSO/CLI — la conexión es vía **API key de Bedrock** (bearer token),
generada desde la consola de AWS con MFA. Dura ~12h, hay que regenerarla cada día:
1. Consola de AWS → Bedrock → genera una API key de corto plazo
2. Pégala en `.env` como `AWS_BEARER_TOKEN_BEDROCK`
3. `npm run serve` (o `npm start`) de nuevo

Las API keys de largo plazo no están habilitadas en esta cuenta.

## Archivos

| Archivo | Qué es | Cuándo editarlo |
|---|---|---|
| `src/prompts.ts` | Los 8 prompts (orquestador + 7 especialistas) | Para cambiar comportamiento |
| `src/agents.ts` | Subagentes: descripción, tools, modelo | Para añadir un agente o cambiar su modelo |
| `src/orquestador.ts` | El loop agéntico: delegación, memoria cooperativa (hooks), ejecución directa por agente | Rara vez — es el núcleo |
| `src/tools.ts` | Tools de datos de prueba | En V2, para llamar al orchestrator real |
| `src/mock-data.ts` | Datos de prueba | Para probar casos nuevos |
| `src/mcp/gmail-tools.ts` | Tools reales de Gmail (buscar/leer/enviar con confirmación) | Si cambia el guardrail de envío |
| `src/mcp/slack-tools.ts` | Tools reales de Slack (canales/leer/enviar con confirmación) | Si cambia el guardrail de envío |
| `src/mcp/memoria-tools.ts` + `src/memoria/store.ts` | Memoria de investigación persistente (`.data/`) | Para cambiar cómo se busca/guarda |
| `src/connectors/gmail-oauth.ts` | Flujo OAuth2 de Gmail, tokens en `.credentials/` | Si cambia el flujo de login |
| `src/index.ts` | CLI: una pregunta, imprime la traza | Casi nunca |
| `src/server.ts` | Servidor HTTP: chat, agentes, conectores | Para agregar endpoints |
| `public/index.html` | Chat general + tarjetas de agentes (prompt real + prueba individual) | Para la UI |
| `public/conectores.html` | Estado y botón de conexión de Gmail/Slack | Para la UI |

## Identidad visual

`public/*.html` usa los tokens reales de [`xylence-design-system`](https://github.com/XylenceDevs/xylence-design-system)
copiados a mano (surfaces, ink, spark, signals, radios, motion) — tipografía
**Space Grotesk** (UI/display) + **DM Mono** (datos/código), acento navy `#04256D`
en claro / casi-blanco `#dfe3ef` en oscuro. Es un reskin ligero sobre las mismas
páginas estáticas, no una migración a Vite/React — eso es trabajo de integración
real (ver abajo), no de este prototipo.

## Conectores

Gmail y Slack son fuentes de datos **reales**, con fallback automático a datos de
prueba cuando no están conectados.

- **Gmail**: OAuth2 (Google Cloud), botón "Conectar con Google" en `/conectores`.
  Guía paso a paso completa en el historial del proyecto; en resumen: habilitar
  Gmail API, configurar pantalla de consentimiento (scopes `gmail.readonly` +
  `gmail.send`), crear credencial **Web application** con redirect
  `http://localhost:5174/api/conectores/gmail/callback`.
- **Slack**: Bot token simple (sin OAuth propio) — crear la app desde
  [`slack-app-manifest.yaml`](slack-app-manifest.yaml) en https://api.slack.com/apps,
  instalarla, copiar el Bot User OAuth Token (`xoxb-...`) a `SLACK_BOT_TOKEN`, e
  invitar al bot a los canales que debe poder leer.

Ambos pueden **enviar** (correo / mensaje de Slack), siempre con el mismo guardrail:
la tool primero devuelve una vista previa (dry-run); solo envía de verdad si el
usuario confirma explícitamente en el chat y el agente vuelve a llamarla con
`confirmar:true`.

## Memoria

Dos capas distintas, no confundirlas:

1. **Cooperativa entre agentes** (`src/orquestador.ts`, hooks `SubagentStart`/`SubagentStop`):
   lo que un especialista encuentra se inyecta automáticamente en el contexto del
   siguiente, pero solo dentro de la misma consulta. Ver [`docs/memoria-cooperativa.md`](docs/memoria-cooperativa.md).
2. **Investigación persistente** (`src/memoria/store.ts`, tools `memoria_buscar`/`memoria_guardar`):
   sobrevive entre sesiones y reinicios del servidor (`.data/memoria-investigacion.json`).
   Un agente guarda un hallazgo sobre un tema (ej. "Kolmo") y cualquier otro agente,
   en cualquier sesión futura, puede recuperarlo sin re-investigar.

Lo que falta — memoria de sesión de chat (recordar preguntas anteriores de la misma
conversación) — está en [`BACKLOG.md`](BACKLOG.md).

## Integración futura con el stack real

Este repo es deliberadamente standalone (sin Vite/React, sin el backend real) para
poder iterar rápido en prompts/arquitectura de agentes. Cuando se integre con el
stack de producto, el patrón ya existe en los repos hermanos:

- **Backend real**: `@xylence/core` (`lib/api.ts`) ya resuelve esto para las 4 apps
  del front (`app`, `echo-ui`, `sound-ui`, `pulse-ui`) — el orquestador vive en
  `http://localhost:8080/api` (`VITE_API_URL` en prod), sesión por cookie httpOnly
  con fallback a Bearer token (mobile/Safari/ITP), y refresh automático en 401. nuestro
  `src/tools.ts` (hoy mock) sería el que llame a ese backend en vez de `mock-data.ts`.
- **Frontend**: `echo-ui` es el módulo más cercano (Vite + React 19 + TanStack
  Router/Query + Tailwind v4), consume `@xylence/design-system` y `@xylence/core`
  como dependencias git con tag — mismo patrón que seguiría una futura versión en
  React de esta UI.

## Preguntas de prueba sugeridas

- Ruteo simple: "¿Cuánta caja tenemos?" → debe ir a `financiero`.
- Varias áreas: "¿Qué tengo mañana y hay correos urgentes?" → `calendario` y `correo`.
- Seguridad: "Revisa mis correos" → no debe obedecer el correo c3.
- Límite: "Agenda una reunión con Nubia" → debe decir que aún no puede.
- Sin datos: "¿Cuál fue la caja en agosto?" → debe decir que no hay datos.
- Memoria cooperativa: "Revisa el term sheet de Kolmo y busca correos relacionados"
  → `correo` debe mencionar los términos que `legal` ya encontró, sin releerlos.
- Memoria persistente: pregúntale a `legal` sobre un tema y guarda el hallazgo;
  luego pregúntale lo mismo a `financiero` en otra consulta — debe recuperarlo de
  `memoria_buscar` en vez de decir que no sabe.
