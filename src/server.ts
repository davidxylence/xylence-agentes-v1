import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { ejecutarConsulta, ejecutarAgenteDirecto, listarAgentes, type EventoTraza } from "./orquestador.js";
import { estadoGmail, gmailConfigurado, urlDeAutorizacion, intercambiarCodigo, desconectarGmail } from "./connectors/gmail-oauth.js";
import { WebClient } from "@slack/web-api";

const PORT = Number(process.env.PORT ?? 5174);
const PUBLIC_HTML = new URL("../public/index.html", import.meta.url);
const CONECTORES_HTML = new URL("../public/conectores.html", import.meta.url);

function enviarJson(res: ServerResponse, status: number, valor: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(valor));
}

async function leerCuerpo(req: IncomingMessage): Promise<{ pregunta: string; sessionId?: string }> {
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const datos = JSON.parse(body);
    return { pregunta: String(datos.pregunta ?? "").trim(), sessionId: typeof datos.sessionId === "string" ? datos.sessionId : undefined };
  } catch {
    return { pregunta: "" };
  }
}

// NDJSON: una línea JSON por evento, el navegador la lee con fetch streaming.
async function transmitirEventos(res: ServerResponse, ejecutar: (onEvento: (e: EventoTraza) => void) => Promise<void>) {
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
  try {
    await ejecutar((evento) => res.write(JSON.stringify(evento) + "\n"));
  } catch (err) {
    res.write(JSON.stringify({ type: "error", message: String(err instanceof Error ? err.message : err) }) + "\n");
  }
  res.end();
}

const server = createServer(async (req, res) => {
  // Solo la ruta, sin query string — "/conectores?gmail_ok=1" debe servir lo mismo que "/conectores".
  const pathname = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;

  if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    const html = await readFile(PUBLIC_HTML);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && pathname === "/conectores") {
    const html = await readFile(CONECTORES_HTML);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && req.url === "/api/conectores/gmail/estado") {
    enviarJson(res, 200, await estadoGmail());
    return;
  }

  if (req.method === "GET" && req.url === "/api/conectores/gmail/iniciar") {
    if (!gmailConfigurado()) {
      enviarJson(res, 400, { error: "Falta GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET en .env" });
      return;
    }
    res.writeHead(302, { Location: urlDeAutorizacion() });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/conectores/gmail/callback")) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(302, { Location: "/conectores?gmail_error=" + encodeURIComponent(error) });
      res.end();
      return;
    }
    if (!code) {
      res.writeHead(302, { Location: "/conectores?gmail_error=sin_codigo" });
      res.end();
      return;
    }
    try {
      await intercambiarCodigo(code);
      res.writeHead(302, { Location: "/conectores?gmail_ok=1" });
      res.end();
    } catch (err) {
      res.writeHead(302, { Location: "/conectores?gmail_error=" + encodeURIComponent(String(err instanceof Error ? err.message : err)) });
      res.end();
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/conectores/gmail/desconectar") {
    await desconectarGmail();
    enviarJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/api/conectores/slack/estado") {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) { enviarJson(res, 200, { configurado: false, conectado: false }); return; }
    try {
      const auth = await new WebClient(token).auth.test();
      enviarJson(res, 200, { configurado: true, conectado: true, equipo: auth.team, bot: auth.user });
    } catch (err) {
      enviarJson(res, 200, { configurado: true, conectado: false, error: String(err instanceof Error ? err.message : err) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/consulta") {
    const { pregunta, sessionId } = await leerCuerpo(req);
    if (!pregunta) { enviarJson(res, 400, { error: "Falta 'pregunta'" }); return; }
    await transmitirEventos(res, (onEvento) => ejecutarConsulta(pregunta, onEvento, sessionId));
    return;
  }

  if (req.method === "GET" && req.url === "/api/agentes") {
    enviarJson(res, 200, listarAgentes());
    return;
  }

  const matchAgente = req.url?.match(/^\/api\/agentes\/([^/]+)\/consulta$/);
  if (req.method === "POST" && matchAgente) {
    const agenteId = decodeURIComponent(matchAgente[1]);
    const { pregunta } = await leerCuerpo(req);
    if (!pregunta) { enviarJson(res, 400, { error: "Falta 'pregunta'" }); return; }
    await transmitirEventos(res, (onEvento) => ejecutarAgenteDirecto(agenteId, pregunta, onEvento));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("No encontrado");
});

server.listen(PORT, () => {
  console.log(`\n🖥  Sala de control en http://localhost:${PORT}\n`);
});
