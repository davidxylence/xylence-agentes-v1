import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as datos from "./mock-data.js";

// Ayudante: toda tool devuelve texto (aquí, JSON) al modelo.
const respuesta = (valor: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(valor, null, 2) }],
});

const listarEventos = tool(
  "listar_eventos", "Lista eventos del calendario entre dos fechas (YYYY-MM-DD).",
  { desde: z.string(), hasta: z.string() },
  async ({ desde, hasta }) => respuesta(datos.eventos.filter(e => e.fecha >= desde && e.fecha <= hasta)),
);

const buscarCorreos = tool(
  "buscar_correos", "Busca correos por texto en remitente o asunto. Vacío = todos.",
  { consulta: z.string() },
  async ({ consulta }) => {
    const q = consulta.toLowerCase();
    return respuesta(datos.correos
      .filter(c => !q || `${c.de} ${c.asunto}`.toLowerCase().includes(q))
      .map(({ id, de, asunto }) => ({ id, de, asunto })));
  },
);

const leerCorreo = tool(
  "leer_correo", "Lee el cuerpo completo de un correo por id.",
  { id: z.string() },
  async ({ id }) => respuesta(datos.correos.find(c => c.id === id) ?? "No encontrado"),
);

const leerMensajes = tool(
  "leer_mensajes", "Lee mensajes recientes. Canal vacío = todos los canales.",
  { canal: z.string() },
  async ({ canal }) => respuesta(canal ? { [canal]: datos.mensajes[canal as keyof typeof datos.mensajes] ?? [] } : datos.mensajes),
);

const resumenFinanciero = tool(
  "resumen_financiero", "Resumen financiero de un mes (YYYY-MM).",
  { periodo: z.string() },
  async ({ periodo }) => respuesta(datos.finanzas[periodo] ?? `Sin datos para ${periodo}`),
);

const listarDocumentos = tool(
  "listar_documentos", "Lista documentos legales. Tipo: term_sheet, nda o vacío para todos.",
  { tipo: z.string() },
  async ({ tipo }) => respuesta(datos.documentos.filter(d => !tipo || d.tipo === tipo).map(({ id, tipo, titulo }) => ({ id, tipo, titulo }))),
);

const leerDocumento = tool(
  "leer_documento", "Lee un documento legal por id.",
  { id: z.string() },
  async ({ id }) => respuesta(datos.documentos.find(d => d.id === id) ?? "No encontrado"),
);

const consultarPolitica = tool(
  "consultar_politica", "Consulta una política interna: vacaciones, home_office u onboarding.",
  { tema: z.string() },
  async ({ tema }) => respuesta(datos.politicas[tema] ?? `No hay política para "${tema}"`),
);

// Un solo servidor MCP "en proceso" con todas las tools.
// El modelo las ve como: mcp__xylence__<nombre>
export const servidorXylence = createSdkMcpServer({
  name: "xylence",
  version: "0.1.0",
  tools: [listarEventos, buscarCorreos, leerCorreo, leerMensajes, resumenFinanciero, listarDocumentos, leerDocumento, consultarPolitica],
});

export const t = (nombre: string) => `mcp__xylence__${nombre}`;
