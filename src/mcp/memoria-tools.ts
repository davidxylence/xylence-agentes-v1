import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { guardarHallazgo, buscarHallazgos } from "../memoria/store.js";

const respuesta = (valor: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(valor, null, 2) }] });

const memoriaBuscar = tool(
  "memoria_buscar",
  "Busca en la memoria de investigación persistente (entre sesiones) lo que ya se descubrió antes sobre un tema (empresa, persona, trato). Llama esto ANTES de investigar algo en Gmail/Slack/documentos, para no repetir trabajo ya hecho en una sesión anterior.",
  { consulta: z.string() },
  async ({ consulta }) => respuesta({ resultados: await buscarHallazgos(consulta) })
);

const memoriaGuardar = tool(
  "memoria_guardar",
  "Guarda un hallazgo en la memoria de investigación persistente, para que esté disponible en futuras preguntas (incluso en otra sesión). Úsalo cuando descubras algo concreto y reutilizable sobre un tema (ej. un dato financiero, una cláusula, un compromiso mencionado en un correo/mensaje) — no guardes trivialidades.",
  {
    tema: z.string().describe("Nombre corto del tema: empresa, persona o trato (ej. 'Kolmo', 'Nubia Pagos')"),
    hallazgo: z.string().describe("El hallazgo en sí, en 1-3 líneas"),
    fuente: z.string().describe("De dónde salió: gmail, slack, documento legal, etc."),
    agente: z.string().describe("Tu propio nombre de agente (ej. 'correo', 'legal')"),
  },
  async ({ tema, hallazgo, fuente, agente }) => respuesta(await guardarHallazgo({ tema, hallazgo, fuente, agente }))
);

export const servidorMemoria = createSdkMcpServer({
  name: "memoria",
  version: "0.1.0",
  tools: [memoriaBuscar, memoriaGuardar],
});
