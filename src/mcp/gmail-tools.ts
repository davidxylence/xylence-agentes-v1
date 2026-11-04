import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { google } from "googleapis";
import { clienteGmailAutorizado } from "../connectors/gmail-oauth.js";

const respuesta = (valor: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(valor, null, 2) }] });

const NO_CONECTADO = {
  conectado: false,
  mensaje: "Gmail no está conectado. Dile al usuario que vaya a /conectores y haga clic en 'Conectar con Google', o usa las tools de datos de prueba (buscar_correos/leer_correo) mientras tanto.",
};

async function gmailClienteOrNull() {
  const sesion = await clienteGmailAutorizado();
  if (!sesion) return null;
  return { gmail: google.gmail({ version: "v1", auth: sesion.oauth2Client }), email: sesion.email };
}

function decodificarBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extraerCuerpo(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return decodificarBase64Url(payload.body.data);
  const parteTexto = (payload.parts ?? []).find((p: any) => p.mimeType === "text/plain")
    ?? (payload.parts ?? []).find((p: any) => p.mimeType === "text/html");
  if (parteTexto?.body?.data) return decodificarBase64Url(parteTexto.body.data);
  for (const p of payload.parts ?? []) {
    const anidado = extraerCuerpo(p);
    if (anidado) return anidado;
  }
  return "";
}

function cabecera(payload: any, nombre: string): string {
  return (payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === nombre.toLowerCase())?.value ?? "";
}

const gmailBuscarCorreos = tool(
  "gmail_buscar_correos",
  "Busca correos REALES en Gmail. Usa sintaxis de búsqueda de Gmail (ej: 'from:founder@x.com', 'newer_than:7d', 'is:unread'). Vacío = bandeja reciente.",
  { consulta: z.string(), maximo: z.number().int().min(1).max(25).optional() },
  async ({ consulta, maximo }) => {
    const cliente = await gmailClienteOrNull();
    if (!cliente) return respuesta(NO_CONECTADO);
    const lista = await cliente.gmail.users.messages.list({
      userId: "me",
      q: consulta || undefined,
      maxResults: maximo ?? 10,
    });
    const mensajes = lista.data.messages ?? [];
    const detalles = await Promise.all(
      mensajes.map(async (m) => {
        const msg = await cliente.gmail.users.messages.get({
          userId: "me", id: m.id!, format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        return {
          id: m.id,
          de: cabecera(msg.data.payload, "From"),
          asunto: cabecera(msg.data.payload, "Subject"),
          fecha: cabecera(msg.data.payload, "Date"),
          snippet: msg.data.snippet,
        };
      })
    );
    return respuesta({ conectado: true, cuenta: cliente.email, resultados: detalles });
  }
);

const gmailLeerCorreo = tool(
  "gmail_leer_correo",
  "Lee el cuerpo completo de un correo REAL de Gmail por id (el id viene de gmail_buscar_correos).",
  { id: z.string() },
  async ({ id }) => {
    const cliente = await gmailClienteOrNull();
    if (!cliente) return respuesta(NO_CONECTADO);
    const msg = await cliente.gmail.users.messages.get({ userId: "me", id, format: "full" });
    return respuesta({
      conectado: true,
      id,
      de: cabecera(msg.data.payload, "From"),
      asunto: cabecera(msg.data.payload, "Subject"),
      fecha: cabecera(msg.data.payload, "Date"),
      cuerpo: extraerCuerpo(msg.data.payload).slice(0, 8000),
    });
  }
);

const gmailEnviarCorreo = tool(
  "gmail_enviar_correo",
  "Prepara y, solo si confirmar=true, ENVÍA un correo real desde Gmail. SIEMPRE llama primero sin 'confirmar' (o confirmar=false) para mostrarle la vista previa al usuario; solo pasa confirmar=true después de que el usuario lo haya aprobado explícitamente en el chat.",
  {
    destinatario: z.string(),
    asunto: z.string(),
    cuerpo: z.string(),
    confirmar: z.boolean().optional(),
  },
  async ({ destinatario, asunto, cuerpo, confirmar }) => {
    const cliente = await gmailClienteOrNull();
    if (!cliente) return respuesta(NO_CONECTADO);

    if (!confirmar) {
      return respuesta({
        enviado: false,
        vista_previa: { de: cliente.email, destinatario, asunto, cuerpo },
        mensaje: "Esto es solo una vista previa, NO se ha enviado. Muéstrasela al usuario y pídele confirmación explícita antes de volver a llamar esta tool con confirmar:true.",
      });
    }

    const mensajeMime =
      `From: ${cliente.email}\r\n` +
      `To: ${destinatario}\r\n` +
      `Subject: =?UTF-8?B?${Buffer.from(asunto, "utf-8").toString("base64")}?=\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
      cuerpo;

    const raw = Buffer.from(mensajeMime).toString("base64url");
    const envio = await cliente.gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return respuesta({ enviado: true, id: envio.data.id, destinatario, asunto });
  }
);

export const servidorGmail = createSdkMcpServer({
  name: "gmail",
  version: "0.1.0",
  tools: [gmailBuscarCorreos, gmailLeerCorreo, gmailEnviarCorreo],
});
