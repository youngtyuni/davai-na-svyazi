#!/usr/bin/env node
// Жадные стратегии по ивентам: node tools/strategies.js [N] [--prod] [--strategy=name] [--event=id]
// N — забегов на ивент (по умолчанию 200, равномерно по ролям). Печатает распределение финалов
// для каждой стратегии по каждому ивенту. Стратегии вынесены из engine.test.js, чтобы
// проверять достижимость поведенческих финалов «живым» игроком, а не случайным выбором.
"use strict";
const path = require("path");
const { loadAll } = require("./_load");
const E = require(path.join(__dirname, "..", "js", "engine.js"));

const args = process.argv.slice(2);
const PROD = !args.includes("--no-prod"); // по умолчанию prod (без _sample)
const nArg = args.find(a => /^\d+$/.test(a));
const N = nArg ? parseInt(nArg, 10) : 200;
const onlyStrategy = (args.find(a => a.startsWith("--strategy=")) || "").slice(11);
const onlyEvent = (args.find(a => a.startsWith("--event=")) || "").slice(8);

const { data, content } = loadAll({ prod: PROD });
const EVENTS = content.events.filter(ev => !onlyEvent || ev.id === onlyEvent);
const ROLES = data.roles;
if (!EVENTS.length) { console.error("Нет ивентов"); process.exit(1); }

// ---------- стратегии: pick(state, rng) → индекс варианта ----------
const byStat = (key, dir) => g => {
  let best = 0, bestV = -Infinity;
  g.current.options.forEach((o, i) => {
    const v = (o[key] || 0) * dir;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};
const minCringe = byStat("cringe", -1);
const maxCringe = byStat("cringe", 1);
const maxClout = byStat("clout", 1);
const maxSpend = byStat("energy", -1); // самый затратный по энергии
const random = (g, rng) => Math.floor(rng() * g.current.options.length);
// всегда берём вариант с нужным флагом, если есть; иначе — минимальный кринж
const withFlag = flags => g => {
  const i = g.current.options.findIndex(o => (o.flags || []).some(f => flags.includes(f)));
  return i >= 0 ? i : minCringe(g);
};
const maxFlags = withFlag(["free_work", "pitched"]);
const maxFreeWork = withFlag(["free_work"]);
const maxPitch = withFlag(["pitched"]);
// предпочитаем реальный контакт, иначе — минимальный кринж
const preferReal = g => {
  const i = g.current.options.findIndex(o => o.contact && o.contact.kind === "real");
  return i >= 0 ? i : minCringe(g);
};

const STRATEGIES = {
  "random": random,
  "min-cringe": minCringe,
  "max-clout": maxClout,
  "max-cringe": maxCringe,
  "max-spend": maxSpend,
  "max-flags": maxFlags,
  "max-free-work": maxFreeWork,
  "max-pitch": maxPitch,
  "prefer-real-contact": preferReal
};

function play(roleId, eventId, seed, pick) {
  const g = E.createGame(data, content, { seed, roleId, eventId });
  const rng = E.mulberry32(seed * 3 + 11);
  let steps = 0;
  while (!g.done && steps++ < 100) E.choose(g, pick(g, rng));
  return g;
}

const ENDINGS = data.endings.map(e => e.id);
const pct = n => (100 * n / N).toFixed(1).padStart(5) + "%";

// Пороги из QA-критериев: по ним помечаем проблемные ячейки
const CHECKS = {
  "min-cringe": { id: "energy_zero", max: 30 },
  "max-cringe": { id: "cringe_max", min: 40 },
  "max-free-work": { any: ["free_worker"], soft: true },
  "max-pitch": { any: ["pitcher"], soft: true },
  "prefer-real-contact": { any: ["found_people"] }
};

const problems = [];
const warnings = [];
Object.keys(STRATEGIES).forEach(name => {
  if (onlyStrategy && name !== onlyStrategy) return;
  const pick = STRATEGIES[name];
  console.log(`\n=== ${name} (${N} забегов на ивент) ===`);
  const total = {}; ENDINGS.forEach(id => { total[id] = 0; });
  EVENTS.forEach(ev => {
    const count = {}; ENDINGS.forEach(id => { count[id] = 0; });
    for (let i = 0; i < N; i++) {
      const role = ROLES[i % ROLES.length];
      const g = play(role.id, ev.id, i * 101 + 7, pick);
      count[g.ending.id]++; total[g.ending.id]++;
    }
    const row = ENDINGS.filter(id => count[id]).sort((a, b) => count[b] - count[a])
      .map(id => `${id} ${(100 * count[id] / N).toFixed(0)}%`).join(", ");
    let mark = "";
    const chk = CHECKS[name];
    if (chk) {
      if (chk.max !== undefined && 100 * count[chk.id] / N > chk.max) { mark = `  ← ${chk.id} > ${chk.max}%`; problems.push(`${name}/${ev.id}: ${chk.id} ${(100 * count[chk.id] / N).toFixed(0)}% > ${chk.max}%`); }
      if (chk.min !== undefined && 100 * count[chk.id] / N < chk.min) { mark = `  ← ${chk.id} < ${chk.min}%`; problems.push(`${name}/${ev.id}: ${chk.id} ${(100 * count[chk.id] / N).toFixed(0)}% < ${chk.min}%`); }
      // Поведенческие финалы (free_worker/pitcher) не обязаны быть достижимы в каждом ивенте — предупреждение, не ошибка
      if (chk.any) chk.any.forEach(id => { if (!count[id]) { mark += `  ← ${id} недостижим`; (chk.soft ? warnings : problems).push(`${name}/${ev.id}: ${id} ни разу`); } });
    }
    console.log(`  ${ev.id.padEnd(11)} ${row}${mark}`);
  });
  const sumRow = ENDINGS.map(id => `${pct(total[id] / EVENTS.length)} ${id}`).join(" · ");
  console.log(`  ${"итого".padEnd(11)} ${sumRow}`);
});

if (warnings.length) { console.log("\nПредупреждения (финал недостижим в ивенте):"); warnings.forEach(p => console.log("  - " + p)); }
if (problems.length) {
  console.log("\nПРОБЛЕМЫ:");
  problems.forEach(p => console.log("  - " + p));
  process.exitCode = 1;
} else {
  console.log("\nВсе проверки стратегий пройдены.");
}
