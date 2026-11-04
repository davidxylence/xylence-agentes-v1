import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { WebClient } from "@slack/web-api";

const respuesta = (valor: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(valor, null, 2) }] });

const NO_CONECTADO = {
  conectado: false,
  mensaje: "Slack no está conectado. Falta SLACK_BOT_TOKEN en .env, o usa leer_mensajes (datos de prueba) mientras tanto.",
};

function clienteSlackOrNull(): WebClient | null {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  return new WebClient(token);
}

// Cache corto de nombre de canal -> id, para no listar canales en cada llamada.
let cacheCanales: { nombre: string; id: string }[] | null = null;
async function resolverCanal(cliente: WebClient, nombreOCanal: string): Promise<string | null> {
  if (nombreOCanal.startsWith("C") || nombreOCanal.startsWith("G")) return nombreOCanal; // ya es un id
  if (!cacheCanales) {
    const lista = await cliente.conversations.list({ types: "public_channel,private_channel", limit: 200 });
    cacheCanales = (lista.channels ?? []).map(c => ({ nombre: c.name ?? "", id: c.id ?? "" }));
  }
  const limpio = nombreOCanal.replace(/^#/, "").toLowerCase();
  return cacheCanales.find(c => c.nombre.toLowerCase() === limpio)?.id ?? null;
}

const slackListarCanales = tool(
  "slack_listar_canales",
  "Lista los canales REALES de Slack a los que el bot tiene acceso (debe estar invitado a cada uno).",
  {},
  async () => {
    const cliente = clienteSlackOrNull();
    if (!cliente) return respuesta(NO_CONECTADO);
    const lista = await cliente.conversations.list({ types: "public_channel,private_channel", limit: 200 });
    cacheCanales = (lista.channels ?? []).map(c => ({ nombre: c.name ?? "", id: c.id ?? "" }));
    return respuesta({
      conectado: true,
      canales: (lista.channels ?? []).map(c => ({ nombre: c.name, id: c.id, miembros: c.num_members })),
    });
  }
);

const slackLeerCanal = tool(
  "slack_leer_canal",
  "Lee mensajes REALES recientes de un canal de Slack (nombre sin # o id). El bot debe estar invitado a ese canal.",
  { canal: z.string(), limite: z.number().int().min(1).max(100).optional() },
  async ({ canal, limite }) => {
    const cliente = clienteSlackOrNull();
    if (!cliente) return respuesta(NO_CONECTADO);
    const id = await resolverCanal(cliente, canal);
    if (!id) {
      return respuesta({
        conectado: true,
        error: `No encontré el canal "${canal}" entre los canales a los que el bot tiene acceso. Usa slack_listar_canales para ver cuáles están disponibles, o invita al bot a ese canal.`,
      });
    }
    const historial = await cliente.conversations.history({ channel: id, limit: limite ?? 20 });
    return respuesta({
      conectado: true,
      canal,
      mensajes: (historial.messages ?? []).map(m => ({ usuario: m.user, texto: m.text, hora: m.ts })),
    });
  }
);

const slackEnviarMensaje = tool(
  "slack_enviar_mensaje",
  "Prepara y, solo si confirmar=true, ENVÍA un mensaje real a un canal de Slack. SIEMPRE llama primero sin 'confirmar' para mostrar la vista previa; solo pasa confirmar=true después de que el usuario lo haya aprobado explícitamente en el chat.",
  { canal: z.string(), texto: z.string(), confirmar: z.boolean().optional() },
  async ({ canal, texto, confirmar }) => {
    const cliente = clienteSlackOrNull();
    if (!cliente) return respuesta(NO_CONECTADO);

    if (!confirmar) {
      return respuesta({
        enviado: false,
        vista_previa: { canal, texto },
        mensaje: "Esto es solo una vista previa, NO se ha enviado. Muéstrasela al usuario y pídele confirmación explícita antes de volver a llamar esta tool con confirmar:true.",
      });
    }

    const id = await resolverCanal(cliente, canal);
    if (!id) return respuesta({ enviado: false, error: `No encontré el canal "${canal}".` });
    const envio = await cliente.chat.postMessage({ channel: id, text: texto });
    return respuesta({ enviado: true, canal, ts: envio.ts });
  }
);

export const servidorSlack = createSdkMcpServer({
  name: "slack",
  version: "0.1.0",
  tools: [slackListarCanales, slackLeerCanal, slackEnviarMensaje],
});
