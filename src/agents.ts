import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import * as P from "./prompts.js";
import { t } from "./tools.js";

// Cada subagente: cuándo usarlo (description), cómo comportarse (prompt),
// qué tools puede usar (tools) y qué modelo (model).
export const agentes: Record<string, AgentDefinition> = {
  calendario: {
    description: "Consulta reuniones, agenda y disponibilidad.",
    prompt: P.CALENDARIO,
    tools: [t("listar_eventos")],
    model: "haiku",
  },
  correo: {
    description: "Busca, lee, clasifica y resume correos. Si Gmail está conectado, también puede enviar.",
    prompt: P.CORREO,
    tools: [
      t("buscar_correos"), t("leer_correo"),
      "mcp__gmail__gmail_buscar_correos", "mcp__gmail__gmail_leer_correo", "mcp__gmail__gmail_enviar_correo",
    ],
    model: "sonnet",
  },
  mensajeria: {
    description: "Lee y resume mensajes de Slack y WhatsApp.",
    prompt: P.MENSAJERIA,
    tools: [t("leer_mensajes")],
    model: "haiku",
  },
  financiero: {
    description: "Responde preguntas sobre caja, gastos, ingresos y runway del fondo.",
    prompt: P.FINANCIERO,
    tools: [t("resumen_financiero")],
    model: "sonnet",
  },
  legal: {
    description: "Resume y revisa contratos, term sheets y NDAs.",
    prompt: P.LEGAL,
    tools: [t("listar_documentos"), t("leer_documento")],
    model: "sonnet",
  },
  rh: {
    description: "Responde sobre políticas internas: vacaciones, home office, onboarding.",
    prompt: P.RH,
    tools: [t("consultar_politica")],
    model: "haiku",
  },
  reportes: {
    description: "Genera reportes que combinan varias áreas, como el reporte semanal.",
    prompt: P.REPORTES,
    tools: [t("listar_eventos"), t("buscar_correos"), t("leer_correo"), t("leer_mensajes"), t("resumen_financiero")],
    model: "sonnet",
  },
};
