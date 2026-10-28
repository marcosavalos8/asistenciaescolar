// Genera firestore.rules = reglas actuales de citasFacil + bloque de asistencia.
// Uso: node scripts/merge-rules.mjs <ruta-a-reglas-base>
// El proyecto Firebase es compartido: publicar solo el bloque de asistencia
// BORRARÍA las reglas de citasFacil. Siempre publica el archivo combinado.
import { readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2];
if (!base) {
  console.error("Uso: node scripts/merge-rules.mjs <reglas-base.rules>");
  process.exit(1);
}
const START = "    // >>> ASISTENCIA ESCOLAR >>>";
const END = "    // <<< ASISTENCIA ESCOLAR <<<";

let src = readFileSync(base, "utf8").replace(/\r\n/g, "\n");
const block = readFileSync(new URL("../firestore/asistencia.rules", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Idempotente: si la base ya trae el bloque, se reemplaza.
const a = src.indexOf(START);
const b = src.indexOf(END);
if (a >= 0 && b > a) src = src.slice(0, a) + src.slice(b + END.length);

// Inserta antes de las dos llaves finales: `  }` (documents) y `}` (service).
const last = src.lastIndexOf("}");
const prev = src.lastIndexOf("}", last - 1);
if (last < 0 || prev < 0) {
  console.error("No se encontró el cierre de `match /databases/{database}/documents { ... }`.");
  process.exit(1);
}
const out = src.slice(0, prev).replace(/\s*$/, "") + `\n\n${START}\n${block.replace(/\s*$/, "")}\n${END}\n  }\n}\n`;
writeFileSync(new URL("../firestore.rules", import.meta.url), out);
console.log(`firestore.rules generado (${out.split("\n").length} líneas)`);
