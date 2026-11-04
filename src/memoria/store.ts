import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Memoria de investigación: persiste ENTRE sesiones (a diferencia del pizarrón
// de orquestador.ts, que solo vive mientras dura una consulta). Los agentes
// guardan aquí lo que descubren sobre un tema (empresa, persona, trato) para
// no tener que re-investigarlo la próxima vez que se les pregunte por lo mismo.
const DIR_DATOS = path.resolve(process.cwd(), ".data");
const ARCHIVO = path.join(DIR_DATOS, "memoria-investigacion.json");

export type Hallazgo = {
  id: string;
  tema: string;
  hallazgo: string;
  fuente: string; // "gmail" | "slack" | "legal" | ... (de dónde salió el dato)
  agente: string; // qué agente lo guardó
  fecha: string; // ISO
};

async function leerTodo(): Promise<Hallazgo[]> {
  try {
    const raw = await readFile(ARCHIVO, "utf-8");
    return JSON.parse(raw) as Hallazgo[];
  } catch {
    return [];
  }
}

async function escribirTodo(hallazgos: Hallazgo[]): Promise<void> {
  await mkdir(DIR_DATOS, { recursive: true });
  await writeFile(ARCHIVO, JSON.stringify(hallazgos, null, 2));
}

export async function guardarHallazgo(datos: { tema: string; hallazgo: string; fuente: string; agente: string }): Promise<Hallazgo> {
  const hallazgos = await leerTodo();
  const nuevo: Hallazgo = { id: crypto.randomUUID(), fecha: new Date().toISOString(), ...datos };
  hallazgos.push(nuevo);
  await escribirTodo(hallazgos);
  return nuevo;
}

export async function buscarHallazgos(consulta: string, limite = 10): Promise<Hallazgo[]> {
  const hallazgos = await leerTodo();
  const q = consulta.trim().toLowerCase();
  const coincidencias = q
    ? hallazgos.filter(h => h.tema.toLowerCase().includes(q) || h.hallazgo.toLowerCase().includes(q))
    : hallazgos;
  return coincidencias
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, limite);
}

export async function listarTemas(): Promise<string[]> {
  const hallazgos = await leerTodo();
  return [...new Set(hallazgos.map(h => h.tema))].sort();
}
