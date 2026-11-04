#!/usr/bin/env node
// Симуляция: node tools/simulate.js [N] [--prod]
// N забегов случайными выборами по всем ролям × ивентам. Печатает распределение финалов.
"use strict";
const path = require("path");
const { loadAll } = require("./_load");
const Engine = require(path.join(__dirname, "..", "js", "engine.js"));

const PROD = process.argv.includes("--prod");
const nArg = process.argv.slice(2).find(a => /^\d+$/.test(a));
const N = nArg ? parseInt(nArg, 10) : 500;
const MAX_SHARE = 35;
const ENGLISH_CHANCE = 0.02; // шанс нажать «Уйти по-английски» на каждой встрече

const { data, content } = loadAll({ prod: PROD });
if (!content.events.length) { console.error("Нет ивентов"); process.exit(1); }

const rng = Engine.mulberry32(42);
const endingCount = {};
data.endings.forEach(e => { endingCount[e.id] = 0; });
const sum = { energy: 0, cringe: 0, clout: 0 };
let early = 0, contactsSum = 0, realSum = 0, encountersSum = 0;
const perEvent = {};

for (let i = 0; i < N; i++) {
  const role = data.roles[i % data.roles.length];
  const event = content.events[Math.floor(i / data.roles.length) % content.events.length];
  const g = Engine.createGame(data, content, { seed: i * 7919 + 1, roleId: role.id, eventId: event.id });
  let steps = 0;
  while (!g.done && steps < 100) {
    // небольшой шанс «уйти по-английски», как делает живой игрок
    if (rng() < ENGLISH_CHANCE) { Engine.leaveEnglish(g); break; }
    Engine.choose(g, Math.floor(rng() * g.current.options.length));
    steps++;
  }
  endingCount[g.ending.id]++;
  Engine.STATS.forEach(k => { sum[k] += g[k]; });
  if (g.cringeMaxed || g.energy <= 0) early++;
  contactsSum += g.contacts.length;
  realSum += g.contacts.filter(c => c.kind === "real").length;
  encountersSum += g.log.length;
  perEvent[event.id] = perEvent[event.id] || {};
  perEvent[event.id][g.ending.id] = (perEvent[event.id][g.ending.id] || 0) + 1;
}

const pct = n => (100 * n / N).toFixed(1).padStart(5) + "%";
console.log(`Забегов: ${N} · ролей ${data.roles.length} · ивентов ${content.events.length}\n`);
console.log("Финалы:");
const warnings = [];
data.endings.forEach(e => {
  const n = endingCount[e.id];
  const share = 100 * n / N;
  let mark = "";
  if (n === 0) { mark = "  ← недостижим"; warnings.push(`финал «${e.title}» (${e.id}) ни разу не выпал`); }
  else if (share > MAX_SHARE) { mark = `  ← > ${MAX_SHARE}%`; warnings.push(`финал «${e.title}» (${e.id}) выпадает слишком часто: ${share.toFixed(1)}%`); }
  console.log(`  ${pct(n)}  ${e.emoji} ${e.title.padEnd(22)} ${e.id}${mark}`);
});

console.log("\nСредние на финише:");
Engine.STATS.forEach(k => console.log(`  ${data.stats[k].emoji} ${data.stats[k].label.padEnd(10)} ${(sum[k] / N).toFixed(1)}`));
console.log(`  контактов ${(contactsSum / N).toFixed(2)}, реальных ${(realSum / N).toFixed(2)}, встреч за забег ${(encountersSum / N).toFixed(1)}`);
console.log(`\nПреждевременный конец (кринж 100 / батарейка 0): ${pct(early).trim()}`);

if (content.events.length > 1) {
  console.log("\nПо ивентам:");
  Object.keys(perEvent).forEach(id => {
    const row = Object.entries(perEvent[id]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`  ${id}: ${row}`);
  });
}

if (warnings.length) {
  console.log("\nПРЕДУПРЕЖДЕНИЯ:");
  warnings.forEach(w => console.log("  - " + w));
}
