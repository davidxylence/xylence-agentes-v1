import { ejecutarConsulta } from "./orquestador.js";

const pregunta = process.argv.slice(2).join(" ") || "Dame el reporte semanal";

console.log(`\n❓ ${pregunta}\n`);

await ejecutarConsulta(pregunta, (e) => {
  if (e.type === "delegate") {
    console.log(`→ delega en [${e.agent}]: ${e.detail}`);
  } else if (e.type === "tool") {
    console.log(`   ↳ usa ${e.name} ${JSON.stringify(e.args)}`);
  } else if (e.type === "final") {
    if (e.subtype === "success") console.log(`\n${e.text}\n`);
    else console.log(`\n⚠️  Terminó con: ${e.subtype}`);
    console.log(`💰 $${e.costUsd.toFixed(4)} · ${e.turns} turnos · ${(e.durationMs / 1000).toFixed(1)}s`);
  }
});
