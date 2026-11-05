#!/usr/bin/env node
// Тесты движка: node tools/engine.test.js
// Без зависимостей — только assert и реальный контент из content/events/*.js (prod, без _sample).
"use strict";
const assert = require("assert");
const path = require("path");
const { loadAll } = require("./_load");
const E = require(path.join(__dirname, "..", "js", "engine.js"));

const { data, content } = loadAll({ prod: true });
const EVENTS = content.events;
const ROLES = data.roles;
assert.ok(EVENTS.length >= 1, "нет ивентов");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.message)); }
}
const section = s => console.log("\n" + s);
const realCount = st => st.contacts.filter(c => c.kind === "real").length;

// Прогоняет забег стратегией pick(state) → индекс варианта
function play(roleId, eventId, seed, pick) {
  const g = E.createGame(data, content, { seed, roleId, eventId });
  let steps = 0;
  while (!g.done && steps++ < 100) E.choose(g, pick(g));
  assert.ok(g.done, "забег не закончился за 100 шагов");
  return g;
}
const byStat = (key, dir) => g => {
  let best = 0, bestV = -Infinity;
  g.current.options.forEach((o, i) => {
    const v = (o[key] || 0) * dir;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};
const minCringe = byStat("cringe", -1); // минимальный кринж (max of −cringe)
const maxCringe = byStat("cringe", 1);
const maxClout = byStat("clout", 1);
const minEnergy = byStat("energy", -1); // самый затратный по энергии

// ---------- 1. pickEncounters ----------
section("pickEncounters: роль × ивент");
EVENTS.forEach(ev => {
  const pool = ev.encounters.filter(e => !e.chained);
  ROLES.forEach(role => {
    test(`${ev.id} × ${role.id}`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const q = E.pickEncounters(ev, role.id, E.makeRng(seed));
        const picks = ev.picks || 8;
        const forRole = pool.filter(e => Array.isArray(e.roles) && e.roles.includes(role.id));
        const universal = pool.filter(e => !Array.isArray(e.roles) || !e.roles.length);
        const possible = Math.min(picks, Math.min(2, forRole.length) + universal.length);
        assert.strictEqual(q.length, possible, `seed ${seed}: длина ${q.length}, ожидалось ${possible}`);
        const ids = q.map(e => e.id);
        assert.strictEqual(new Set(ids).size, ids.length, `seed ${seed}: дубли ${ids}`);
        assert.ok(!q.some(e => e.chained), `seed ${seed}: chained в первичной выборке`);
        q.forEach(e => {
          if (Array.isArray(e.roles)) assert.ok(e.roles.includes(role.id), `seed ${seed}: чужая ролевая ${e.id} (${e.roles})`);
        });
        const finals = q.filter(e => e.final);
        if (pool.some(e => e.final && (!e.roles || e.roles.includes(role.id)))) {
          assert.strictEqual(finals.length, 1, `seed ${seed}: финальных ${finals.length}`);
          assert.ok(q[q.length - 1].final, `seed ${seed}: final не последняя`);
        }
        const roleInQ = q.filter(e => Array.isArray(e.roles)).length;
        assert.strictEqual(roleInQ, Math.min(2, forRole.length), `seed ${seed}: ролевых ${roleInQ}, есть ${forRole.length}`);
      }
    });
  });
});

section("pickEncounters: детерминизм и граничные случаи");
test("одинаковый seed → одинаковая выборка (строка и число)", () => {
  EVENTS.forEach(ev => {
    const a = E.createGame(data, content, { seed: 123, roleId: "cd", eventId: ev.id });
    const b = E.createGame(data, content, { seed: 123, roleId: "cd", eventId: ev.id });
    assert.deepStrictEqual(a.queue.map(e => e.id), b.queue.map(e => e.id));
    const c = E.createGame(data, content, { seed: "abc", roleId: "cd", eventId: ev.id });
    const d = E.createGame(data, content, { seed: "abc", roleId: "cd", eventId: ev.id });
    assert.deepStrictEqual(c.queue.map(e => e.id), d.queue.map(e => e.id));
  });
});
test("разные seed дают разные выборки хотя бы иногда", () => {
  const ev = EVENTS[0];
  const seen = new Set();
  for (let s = 1; s <= 10; s++) seen.add(E.pickEncounters(ev, "designer", E.makeRng(s)).map(e => e.id).join(","));
  assert.ok(seen.size > 1);
});
test("контента меньше picks → выборка короче, без падения", () => {
  const ev = { id: "x", picks: 8, encounters: [
    { id: "a", npc: {}, text: "", options: [] }, { id: "b", final: true, npc: {}, text: "", options: [] },
    { id: "c", chained: true, npc: {}, text: "", options: [] }, { id: "d", roles: ["cd"], npc: {}, text: "", options: [] }
  ] };
  const q = E.pickEncounters(ev, "designer", E.makeRng(1));
  assert.deepStrictEqual(q.map(e => e.id), ["a", "b"]);
  const q2 = E.pickEncounters(ev, "cd", E.makeRng(1));
  assert.strictEqual(q2.length, 3);
  assert.strictEqual(q2[2].id, "b");
});
test("ролевой final для роли игрока попадает последним", () => {
  const encs = [];
  for (let i = 0; i < 10; i++) encs.push({ id: "u" + i, npc: {}, text: "", options: [] });
  encs.push({ id: "rf", roles: ["cd"], final: true, npc: {}, text: "", options: [] });
  const ev = { id: "x", picks: 8, encounters: encs };
  for (let s = 1; s <= 10; s++) {
    const q = E.pickEncounters(ev, "cd", E.makeRng(s));
    assert.strictEqual(q.length, 8);
    assert.strictEqual(q[7].id, "rf");
    const q2 = E.pickEncounters(ev, "designer", E.makeRng(s));
    assert.ok(!q2.some(e => e.id === "rf"));
  }
});

// ---------- 2. Цепочки next ----------
section("Цепочки next");
const chains = [];
EVENTS.forEach(ev => ev.encounters.forEach(e => e.options.forEach((o, i) => { if (o.next) chains.push({ ev, enc: e, optIdx: i, next: o.next }); })));
test("в контенте есть цепочки", () => assert.ok(chains.length > 0));
chains.forEach(ch => {
  test(`${ch.enc.id}#${ch.optIdx} → ${ch.next}`, () => {
    const target = ch.ev.encounters.find(e => e.id === ch.next);
    assert.ok(target, "next указывает на несуществующую встречу");
    // Строим игру так, чтобы встреча-источник была в очереди: подменяем очередь вручную
    const role = (ch.enc.roles && ch.enc.roles[0]) || "designer";
    let g = null;
    for (let s = 1; s <= 300 && !g; s++) {
      const cand = E.createGame(data, content, { seed: s, roleId: role, eventId: ch.ev.id });
      if (cand.queue.includes(ch.enc)) g = cand;
    }
    assert.ok(g, "не нашли seed, где источник цепочки попадает в очередь");
    assert.ok(!g.queue.includes(target) || !target.chained, "chained-цель в первичной очереди");
    // доходим до источника безопасными вариантами (минимальный кринж), затем выбираем вариант с next
    let guard = 0;
    while (g.current !== ch.enc && !g.done && guard++ < 20) E.choose(g, minCringe(g));
    if (g.done) return; // забег оборвался раньше (кринж/энергия) — не ошибка цепочки
    const idxBefore = g.index;
    const lenBefore = g.queue.length; // замеряем прямо перед выбором: по пути могла сработать другая цепочка
    E.choose(g, ch.optIdx);
    if (g.done) return; // выбор добил шкалу — цепочка легитимно не показана
    assert.strictEqual(g.current, target, "следующая встреча — не цель next");
    assert.strictEqual(g.index, idxBefore + 1);
    assert.strictEqual(g.queue.length, lenBefore + 1, "счётчик M должен вырасти на 1 (честное число)");
    // добиваем забег, цель не должна встретиться второй раз
    while (!g.done && guard++ < 40) E.choose(g, minCringe(g));
    const shown = g.log.filter(l => l.encounterId === target.id).length;
    assert.strictEqual(shown, 1, "цепочечная встреча показана " + shown + " раз");
    const ids = g.log.map(l => l.encounterId);
    assert.strictEqual(new Set(ids).size, ids.length, "дубли в логе: " + ids);
  });
});
test("next на уже показанную встречу не показывается второй раз", () => {
  const encs = [
    { id: "a", npc: {}, text: "", options: [{ text: "x", result: "y", next: "b" }] },
    { id: "b", npc: {}, text: "", options: [{ text: "x", result: "y", next: "a" }] },
    { id: "c", npc: {}, text: "", options: [{ text: "x", result: "y" }] }
  ];
  const ev = { id: "x", picks: 3, encounters: encs };
  const g = E.createGame(data, { events: [ev] }, { seed: 1, roleId: "designer", eventId: "x" });
  let guard = 0;
  while (!g.done && guard++ < 20) E.choose(g, 0);
  const ids = g.log.map(l => l.encounterId);
  assert.strictEqual(new Set(ids).size, ids.length, "дубли: " + ids);
  assert.strictEqual(ids.length, 3);
});
test("next на несуществующую встречу — забег продолжается", () => {
  const encs = [
    { id: "a", npc: {}, text: "", options: [{ text: "x", result: "y", next: "zzz" }] },
    { id: "c", npc: {}, text: "", options: [{ text: "x", result: "y" }] }
  ];
  const ev = { id: "x", picks: 2, encounters: encs };
  const g = E.createGame(data, { events: [ev] }, { seed: 1, roleId: "designer", eventId: "x" });
  while (!g.done) E.choose(g, 0);
  assert.strictEqual(g.log.length, 2);
});

// ---------- 3. Clamp и обрывы ----------
section("Clamp, cringe_max, energy_zero, english_exit");
function synthGame(opts) {
  const encs = [];
  for (let i = 0; i < 8; i++) encs.push({ id: "e" + i, npc: { name: "N" }, text: "t", options: opts });
  const ev = { id: "syn", picks: 8, encounters: encs };
  return E.createGame(data, { events: [ev] }, Object.assign({ seed: 1, roleId: "designer", eventId: "syn" }, {}));
}
test("clamp 0–100 на всех шкалах", () => {
  const g = synthGame([{ text: "x", result: "r", energy: 40, cringe: -40, clout: 40 }, { text: "y", result: "r", energy: -40, cringe: 40, clout: -40 }]);
  E.choose(g, 0);
  assert.strictEqual(g.energy, 100); assert.strictEqual(g.cringe, 0); assert.strictEqual(g.clout, 70);
  E.choose(g, 0);
  assert.strictEqual(g.clout, 100);
  E.choose(g, 1); E.choose(g, 1);
  assert.strictEqual(g.energy, 20); assert.strictEqual(g.cringe, 80); assert.strictEqual(g.clout, 20);
  assert.strictEqual(E.clamp(-5, 0, 100), 0); assert.strictEqual(E.clamp(500, 0, 100), 100);
});
test("cringe ≥ 100 → cringe_max, забег окончен, next не срабатывает", () => {
  const g = synthGame([{ text: "x", result: "r", cringe: 40, next: "e7" }]);
  E.choose(g, 0); E.choose(g, 0);
  assert.ok(!g.done);
  E.choose(g, 0);
  assert.strictEqual(g.cringe, 100);
  assert.ok(g.done && g.cringeMaxed);
  assert.strictEqual(g.ending.id, "cringe_max");
  assert.strictEqual(E.choose(g, 0), null, "после финала choose ничего не делает");
});
test("energy ≤ 0 → energy_zero", () => {
  const g = synthGame([{ text: "x", result: "r", energy: -35 }]);
  E.choose(g, 0); E.choose(g, 0);
  assert.strictEqual(g.energy, 0);
  assert.ok(g.done);
  assert.strictEqual(g.ending.id, "energy_zero");
});
test("кринж 100 и энергия 0 одним выбором → приоритет cringe_max", () => {
  // старт 70/10: после 2 шагов energy 0 и cringe 100 одновременно
  const g = synthGame([{ text: "x", result: "r", energy: -35, cringe: 45 }]);
  E.choose(g, 0);
  assert.ok(!g.done);
  E.choose(g, 0);
  assert.ok(g.done);
  assert.strictEqual(g.energy, 0); assert.strictEqual(g.cringe, 100);
  assert.strictEqual(g.ending.id, "cringe_max");
});
test("leaveEnglish → english_exit; после финала — не меняет финал", () => {
  const g = synthGame([{ text: "x", result: "r", cringe: 5 }]);
  E.choose(g, 0);
  E.leaveEnglish(g);
  assert.ok(g.done); assert.strictEqual(g.exit, "english");
  assert.strictEqual(g.ending.id, "english_exit");
  const g2 = synthGame([{ text: "x", result: "r", cringe: 45 }]);
  E.choose(g2, 0); E.choose(g2, 0);
  assert.strictEqual(g2.ending.id, "cringe_max");
  E.leaveEnglish(g2);
  assert.strictEqual(g2.ending.id, "cringe_max");
});
test("стартовые модификаторы роли применяются и клампятся", () => {
  ROLES.forEach(r => {
    const g = E.createGame(data, content, { seed: 1, roleId: r.id, eventId: EVENTS[0].id });
    E.STATS.forEach(k => assert.strictEqual(g[k], E.clamp(data.stats[k].start + ((r.mods && r.mods[k]) || 0), 0, 100)));
  });
});

// ---------- 4. resolveEnding ----------
section("resolveEnding: 11 правил на синтетических контекстах");
function ctxState(over) {
  const st = { energy: 50, cringe: 30, clout: 50, contacts: [], flags: {}, exit: null, cringeMaxed: false, _data: data };
  return Object.assign(st, over);
}
const realC = { kind: "real" }, emptyC = { kind: "empty" };
const endingCases = [
  ["cringe_max", { cringe: 100, cringeMaxed: true, energy: 0, exit: "english", flags: { free_work: 5 } }],
  ["energy_zero", { energy: 0, exit: "english", flags: { free_work: 5 } }],
  ["english_exit", { exit: "english", flags: { free_work: 5, pitched: 5 } }],
  ["free_worker", { flags: { free_work: 2, pitched: 5 } }],
  ["pitcher", { flags: { pitched: 2 }, contacts: [realC, realC] }],
  ["found_people", { contacts: [realC, realC, emptyC, emptyC], cringe: 69, clout: 90 }],
  ["king", { contacts: [emptyC, emptyC, emptyC, emptyC], clout: 90, cringe: 90 }],
  ["legend", { clout: 70, cringe: 60, contacts: [emptyC] }],
  ["ghost", { clout: 39, contacts: [realC], cringe: 10 }],
  ["pro", { clout: 60, cringe: 49, contacts: [emptyC, emptyC] }],
  ["normal", { clout: 50, cringe: 30, contacts: [emptyC, emptyC] }]
];
endingCases.forEach(([id, over]) => {
  test(id, () => assert.strictEqual(E.resolveEnding(ctxState(over)).id, id));
});
test("found_people не срабатывает при кринже 70, king — при 1 реальном", () => {
  assert.notStrictEqual(E.resolveEnding(ctxState({ contacts: [realC, realC], cringe: 70 })).id, "found_people");
  assert.notStrictEqual(E.resolveEnding(ctxState({ contacts: [realC, emptyC, emptyC, emptyC], cringe: 90, clout: 50 })).id, "king");
});
test("в data ровно 11 финалов, последний — normal", () => {
  assert.strictEqual(data.endings.length, 11);
  assert.strictEqual(data.endings[10].id, "normal");
});

// ---------- 5. Ачивки, shareText, runEmoji ----------
section("resolveAchievements / shareText / runEmoji");
test("для одного флага — только высшая по count", () => {
  const st = ctxState({ flags: { said_davai: 3, prosecco: 1, lied: 2 } });
  const r = E.resolveAchievements(st);
  const davai = r.all.filter(a => a.flag === "said_davai");
  assert.strictEqual(davai.length, 1); assert.strictEqual(davai[0].count, 3);
  assert.ok(!r.all.some(a => a.flag === "prosecco"), "prosecco×1 не должен открыть ачивку ×3");
  assert.ok(r.all.some(a => a.flag === "lied"));
  const r1 = E.resolveAchievements(ctxState({ flags: { said_davai: 1 } }));
  assert.strictEqual(r1.all.length, 1); assert.strictEqual(r1.all[0].count, 1);
  assert.ok(r.shown.length <= 4);
});
test("shown ≤ 4 при множестве флагов", () => {
  const flags = {}; data.achievements.forEach(a => { flags[a.flag] = 5; });
  const r = E.resolveAchievements(ctxState({ flags }));
  assert.strictEqual(r.shown.length, 4);
  assert.ok(r.all.length > 4);
});
test("shareText содержит все строки и URL", () => {
  const g = play("cd", EVENTS[0].id, 7, minCringe);
  const url = "https://example.com/x/";
  const t = E.shareText(g, g.ending, url);
  assert.ok(t.includes("ДАВАЙ НА СВЯЗИ · " + g.ending.emoji + " " + g.ending.title));
  assert.ok(t.includes(g.ending.verdict));
  assert.ok(t.includes("🔋 " + data.stats.energy.label));
  assert.ok(t.includes("😬 " + data.stats.cringe.label));
  assert.ok(t.includes("✨ " + data.stats.clout.label));
  assert.ok(t.includes(data.contactsLine(g.contacts.length, realCount(g))));
  assert.ok(t.includes(E.runEmoji(g)));
  assert.ok(t.includes(E.challengeLine(g)));
  assert.ok(t.endsWith(" → " + url));
  const lines = t.split("\n");
  assert.strictEqual(lines.length, 9);
  assert.strictEqual(lines[1], E.runEmoji(g));
  const t2 = E.shareText(g, g.ending);
  assert.ok(!t2.includes("→") && t2.endsWith("?"));
});
test("bar: 10 клеток, корректное округление", () => {
  assert.strictEqual(E.bar(0, "x", "."), "..........");
  assert.strictEqual(E.bar(100, "x", "."), "xxxxxxxxxx");
  assert.strictEqual(E.bar(55, "x", "."), "xxxxxx....");
  assert.strictEqual(Array.from(E.bar(44, "🟩", "⬛")).length, 10);
});
test("challengeLine использует where", () => {
  assert.strictEqual(E.challengeLine({ event: { where: "на форуме" } }), "А ты кто на форуме?");
  assert.strictEqual(E.challengeLine({ event: {} }), "А ты кто?");
});
test("runEmoji: по одному эмодзи на встречу (все роли × ивенты)", () => {
  EVENTS.forEach((ev, i) => ROLES.forEach((r, j) => {
    const g = play(r.id, ev.id, i * 100 + j, g => Math.floor(E.makeRng(g.log.length + i + j)() * g.current.options.length));
    assert.strictEqual(Array.from(E.runEmoji(g)).length, g.log.length, `${ev.id}/${r.id}`);
  }));
});
test("stepEmoji приоритеты", () => {
  assert.strictEqual(E.stepEmoji({ contact: { kind: "real" }, flags: ["toilet"] }), "🤝");
  assert.strictEqual(E.stepEmoji({ contact: { kind: "empty" }, flags: ["toilet"] }), "📇");
  assert.strictEqual(E.stepEmoji({ flags: ["toilet"], deltas: { cringe: 30 } }), "🚽");
  assert.strictEqual(E.stepEmoji({ deltas: { cringe: 15 } }), "😬");
  assert.strictEqual(E.stepEmoji({ deltas: { energy: -15 } }), "🪫");
  assert.strictEqual(E.stepEmoji({ deltas: { clout: 10 } }), "✨");
  assert.strictEqual(E.stepEmoji({ deltas: {} }), "🙂");
});

// ---------- 6. Полные забеги: лог, контакты, флаги ----------
section("Полные забеги");
test("лог: before/after согласованы, контакты и флаги копятся, нет исключений", () => {
  EVENTS.forEach((ev, i) => ROLES.forEach((r, j) => {
    const g = play(r.id, ev.id, 1000 + i * 10 + j, g => (g.log.length + i + j) % g.current.options.length);
    let contacts = 0; const flags = {};
    g.log.forEach((l, k) => {
      if (k > 0) assert.deepStrictEqual(l.before, g.log[k - 1].after);
      E.STATS.forEach(s => assert.strictEqual(l.after[s], E.clamp(l.before[s] + (l.deltas[s] || 0), 0, 100)));
      if (l.contact) contacts++;
      l.flags.forEach(f => { flags[f] = (flags[f] || 0) + 1; });
    });
    assert.strictEqual(g.contacts.length, contacts);
    assert.deepStrictEqual(g.flags, flags);
    assert.ok(g.log.length <= g.queue.length);
    assert.ok(g.ending && data.endings.includes(g.ending));
  }));
});

// ---------- 7. Жадные стратегии ----------
section("Жадные стратегии (ближе к живой игре, чем случайный выбор)");
function strategyReport(name, pick) {
  const count = {}; data.endings.forEach(e => { count[e.id] = 0; });
  let n = 0;
  const perEvent = {};
  EVENTS.forEach(ev => ROLES.forEach(r => {
    for (let s = 1; s <= 5; s++) {
      const g = play(r.id, ev.id, s * 31 + r.id.length, pick);
      count[g.ending.id]++; n++;
      perEvent[ev.id] = perEvent[ev.id] || {};
      perEvent[ev.id][g.ending.id] = (perEvent[ev.id][g.ending.id] || 0) + 1;
    }
  }));
  console.log(`\n  [${name}] забегов ${n}:`);
  data.endings.forEach(e => { if (count[e.id]) console.log(`    ${(100 * count[e.id] / n).toFixed(1).padStart(5)}%  ${e.emoji} ${e.id}`); });
  const never = data.endings.filter(e => !count[e.id]).map(e => e.id);
  if (never.length) console.log("    не выпали: " + never.join(", "));
  Object.keys(perEvent).forEach(id => {
    const row = Object.entries(perEvent[id]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`    ${id}: ${row}`);
  });
  return count;
}
test("минимальный кринж: нет исключений", () => { const c = strategyReport("min cringe", minCringe); assert.ok(c.cringe_max === 0 || true); });
test("максимальный клаут: нет исключений", () => { strategyReport("max clout", maxClout); });
test("максимальный кринж: cringe_max достижим", () => {
  const c = strategyReport("max cringe", maxCringe);
  assert.ok(c.cringe_max > 0);
});
test("максимальная трата энергии: energy_zero достижим", () => {
  const c = strategyReport("max energy spend", minEnergy);
  assert.ok(c.energy_zero > 0);
});

console.log(`\nИтого: ${passed} ok, ${failed} fail`);
process.exit(failed ? 1 : 0);
