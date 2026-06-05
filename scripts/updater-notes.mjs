#!/usr/bin/env node
// Extrait un résumé court et en texte brut depuis un fichier de release notes
// Markdown, pour l'afficher dans le popup natif "Update available" (qui ne
// rend pas le Markdown).
//
// Règles :
//   - on retire le titre `## ...`
//   - on garde le paragraphe d'intro et la section "### Highlights" (sans son
//     titre), convertie en puces "•"
//   - on s'arrête à la première autre section `### ...` (macOS, Windows,
//     License, etc.) — ces parties n'ont pas leur place dans un popup d'update
//   - on enlève les marqueurs Markdown inline (`` ` ``, **gras**, *italique*)
//
// Usage : node scripts/updater-notes.mjs <fichier.md>

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: updater-notes.mjs <release-notes.md>");
  process.exit(1);
}

const stripInline = (s) =>
  s
    .replace(/`([^`]*)`/g, "$1") // code inline
    .replace(/\*\*([^*]+)\*\*/g, "$1") // gras
    .replace(/\*([^*]+)\*/g, "$1") // italique
    .trim();

const out = [];
for (const raw of readFileSync(path, "utf8").split("\n")) {
  const line = raw.replace(/\s+$/, "");

  if (/^##\s+/.test(line) && !/^###/.test(line)) continue; // titre H2 : ignoré

  const h3 = line.match(/^###\s+(.*)$/);
  if (h3) {
    if (/^highlights$/i.test(h3[1].trim())) continue; // garde le contenu, pas le titre
    break; // toute autre section : on s'arrête
  }

  if (/^[-*]\s+/.test(line)) {
    out.push("• " + stripInline(line.replace(/^[-*]\s+/, "")));
  } else {
    out.push(stripInline(line));
  }
}

// Réduit les lignes vides consécutives et coupe le blanc en tête/queue.
const text = out
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

process.stdout.write(text + "\n");
