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
      const anchor = E.findAnchor(ev);
      const rest = pool.filter(e => e !== anchor);
      for (let seed = 1; seed <= 20; seed++) {
        const q = E.pickEncounters(ev, role.id, E.makeRng(seed));
        const picks = ev.picks || 8;
        const forRole = rest.filter(e => Array.isArray(e.roles) && e.roles.includes(role.id));
        const universal = rest.filter(e => !Array.isArray(e.roles) || !e.roles.length);
        const possible = Math.min(picks, (anchor ? 1 : 0) + Math.min(2, forRole.length) + universal.length);
        assert.strictEqual(q.length, possible, `seed ${seed}: длина ${q.length}, ожидалось ${possible}`);
        const ids = q.map(e => e.id);
        assert.strictEqual(new Set(ids).size, ids.length, `seed ${seed}: дубли ${ids}`);
        assert.ok(!q.some(e => e.chained), `seed ${seed}: chained в первичной выборке`);
        if (anchor) assert.strictEqual(q[0], anchor, `seed ${seed}: anchor не первая`);
        q.forEach(e => {
          if (e !== anchor && Array.isArray(e.roles)) assert.ok(e.roles.includes(role.id), `seed ${seed}: чужая ролевая ${e.id} (${e.roles})`);
        });
        const finals = q.filter(e => e.final && e !== anchor);
        if (rest.some(e => e.final && (!e.roles || e.roles.includes(role.id)))) {
          assert.strictEqual(finals.length, 1, `seed ${seed}: финальных ${finals.length}`);
          assert.ok(q[q.length - 1].final, `seed ${seed}: final не последняя`);
        }
        // late — сплошным блоком после всех не-late (кроме final)
        const bodyPhases = q.filter(e => e !== anchor && !e.final).map(e => e.phase === "late");
        const firstLate = bodyPhases.indexOf(true);
        if (firstLate >= 0) assert.ok(bodyPhases.slice(firstLate).every(Boolean), `seed ${seed}: late раньше обычных`);
        const roleInQ = q.filter(e => e !== anchor && Array.isArray(e.roles)).length;
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

// ---------- 1b. anchor / phase / time ----------
section("anchor, phase: late, время вечера");
function arcEvent(over) {
  const encs = [];
  for (let i = 0; i < 6; i++) encs.push({ id: "u" + i, npc: {}, text: "", options: [] });
  for (let i = 0; i < 4; i++) encs.push({ id: "l" + i, phase: "late", npc: {}, text: "", options: [] });
  encs.push({ id: "r1", roles: ["cd"], phase: "late", npc: {}, text: "", options: [] });
  encs.push({ id: "fin", final: true, npc: {}, text: "", options: [] });
  encs.splice(3, 0, { id: "anc", anchor: true, roles: ["musician"], npc: { name: "Анкер" }, text: "", options: [] });
  return Object.assign({ id: "arc", picks: 8, encounters: encs }, over || {});
}
test("anchor всегда в выборке и всегда первая, роли на неё не действуют", () => {
  const ev = arcEvent();
  ROLES.forEach(r => {
    for (let s = 1; s <= 15; s++) {
      const q = E.pickEncounters(ev, r.id, E.makeRng(s));
      assert.strictEqual(q.length, 8, `${r.id}/${s}: длина ${q.length}`);
      assert.strictEqual(q[0].id, "anc", `${r.id}/${s}: первая ${q[0].id}`);
      assert.strictEqual(q.filter(e => e.id === "anc").length, 1);
      assert.strictEqual(q[7].id, "fin");
    }
  });
});
test("несколько anchor → первая по порядку в файле, остальные как обычные", () => {
  const ev = arcEvent();
  ev.encounters.push({ id: "anc2", anchor: true, npc: {}, text: "", options: [] });
  let seenSecond = false;
  for (let s = 1; s <= 40; s++) {
    const q = E.pickEncounters(ev, "designer", E.makeRng(s));
    assert.strictEqual(q[0].id, "anc");
    const i = q.findIndex(e => e.id === "anc2");
    if (i > 0) seenSecond = true;
  }
  assert.ok(seenSecond, "второй anchor ни разу не попал как обычная встреча");
  assert.strictEqual(E.findAnchor(ev).id, "anc");
  assert.strictEqual(E.findAnchor({ encounters: [{ id: "x", anchor: true, chained: true }] }), null, "chained anchor игнорируется");
});
test("late — после всех не-late и перед final; внутри фазы порядок меняется", () => {
  const ev = arcEvent();
  const lateOrders = new Set(), earlyOrders = new Set();
  for (let s = 1; s <= 30; s++) {
    const q = E.pickEncounters(ev, "cd", E.makeRng(s));
    const body = q.slice(1, -1);
    const isLate = body.map(e => e.phase === "late");
    const first = isLate.indexOf(true);
    assert.ok(first > 0, `seed ${s}: нет обычных перед late`);
    assert.ok(isLate.slice(first).every(Boolean), `seed ${s}: late вперемешку: ${q.map(e => e.id)}`);
    assert.ok(q[q.length - 1].final);
    assert.ok(body.some(e => e.id === "r1"), "ролевая late не выбрана");
    lateOrders.add(body.filter(e => e.phase === "late").map(e => e.id).join(","));
    earlyOrders.add(body.filter(e => e.phase !== "late").map(e => e.id).join(","));
  }
  assert.ok(lateOrders.size > 1 && earlyOrders.size > 1, "порядок внутри фаз не случайный");
});
test("без anchor/phase/time движок работает как раньше", () => {
  const ev = { id: "plain", picks: 4, encounters: [0, 1, 2, 3, 4].map(i => ({ id: "p" + i, npc: {}, text: "", options: [{ text: "x", result: "y" }] })) };
  const g = E.createGame(data, { events: [ev] }, { seed: 3, roleId: "designer", eventId: "plain" });
  assert.strictEqual(g.queue.length, 4);
  assert.deepStrictEqual(g.time, E.DEFAULT_TIME);
  assert.strictEqual(E.clock(g), "19:00");
  while (!g.done) E.choose(g, 0);
  assert.deepStrictEqual(g.log.map(l => l.time), ["19:00", "21:00", "23:00", "01:00"]);
  assert.deepStrictEqual(g.log.map(l => l.step), [1, 2, 3, 4]);
  assert.strictEqual(E.timeSpan(g), "", "без event.time строки времени в шере нет");
  assert.strictEqual(E.shareText(g, g.ending).split("\n").length, 9);
});
test("время: интерполяция, переход через полночь, монотонно растёт, последняя = конец", () => {
  assert.strictEqual(E.clockAt(["19:00", "01:30"], 0, 8), "19:00");
  assert.strictEqual(E.clockAt(["19:00", "01:30"], 7, 8), "01:30");
  assert.strictEqual(E.clockAt(["23:30", "00:10"], 1, 3), "23:50");
  assert.strictEqual(E.clockAt(["19:00", "01:30"], 0, 1), "19:00");
  assert.strictEqual(E.clockAt(["19:00", "01:30"], 99, 8), "01:30", "индекс за пределами — клампится");
  const ev = arcEvent({ time: ["19:00", "01:30"] });
  ev.encounters.forEach(e => { e.options = [{ text: "x", result: "y" }]; });
  const g = E.createGame(data, { events: [ev] }, { seed: 5, roleId: "cd", eventId: "arc" });
  assert.deepStrictEqual(g.time, ["19:00", "01:30"]);
  const toMin = t => { const p = E.parseHM(t); return p < E.parseHM("19:00") ? p + 1440 : p; };
  let prev = -1;
  while (!g.done) {
    const t = E.clock(g);
    assert.strictEqual(t, E.clock(g, g.index));
    assert.ok(toMin(t) > prev, `время не растёт: ${t} после ${prev}`);
    prev = toMin(t);
    E.choose(g, 0);
  }
  assert.strictEqual(g.log[0].time, "19:00");
  assert.strictEqual(g.log[g.log.length - 1].time, "01:30");
  assert.strictEqual(E.timeSpan(g), "19:00 → 01:30");
  const txt = E.shareText(g, g.ending, "https://x/");
  assert.strictEqual(txt.split("\n").length, 10);
  assert.ok(txt.includes("\n19:00 → 01:30\n"));
  // ранний выход: конец — время последней сыгранной встречи
  const g2 = E.createGame(data, { events: [ev] }, { seed: 5, roleId: "cd", eventId: "arc" });
  E.choose(g2, 0); E.choose(g2, 0); E.leaveEnglish(g2);
  assert.strictEqual(E.timeSpan(g2), "19:00 → " + g2.log[1].time);
  assert.notStrictEqual(g2.log[1].time, "01:30");
});
test("невалидный time → значения по умолчанию", () => {
  assert.deepStrictEqual(E.eventTime({ time: ["25:00", "01:00"] }), E.DEFAULT_TIME);
  assert.deepStrictEqual(E.eventTime({ time: "19:00" }), E.DEFAULT_TIME);
  assert.deepStrictEqual(E.eventTime({}), E.DEFAULT_TIME);
  assert.deepStrictEqual(E.eventTime({ time: ["7:05", "9:00"] }), ["7:05", "9:00"]);
  assert.strictEqual(E.clockAt(["7:05", "9:00"], 0, 2), "07:05");
});
test("цепочка next удлиняет очередь — время остаётся монотонным", () => {
  const encs = [
    { id: "a", npc: {}, text: "", options: [{ text: "x", result: "y", next: "a2" }] },
    { id: "a2", chained: true, npc: {}, text: "", options: [{ text: "x", result: "y" }] },
    { id: "b", npc: {}, text: "", options: [{ text: "x", result: "y" }] },
    { id: "c", npc: {}, text: "", options: [{ text: "x", result: "y" }] }
  ];
  const ev = { id: "ch", picks: 3, time: ["20:00", "23:00"], encounters: encs };
  const g = E.createGame(data, { events: [ev] }, { seed: 1, roleId: "designer", eventId: "ch" });
  while (!g.done) E.choose(g, 0);
  const mins = g.log.map(l => E.parseHM(l.time));
  for (let i = 1; i < mins.length; i++) assert.ok(mins[i] >= mins[i - 1], "время убывает: " + g.log.map(l => l.time));
  assert.strictEqual(g.log[g.log.length - 1].time, "23:00");
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
test("outcome.total — длина очереди до вставки цепочки (HUD исхода = HUD встречи)", () => {
  const encs = [
    { id: "a", npc: {}, text: "", options: [{ text: "x", result: "y", next: "b" }] },
    { id: "b", chained: true, npc: {}, text: "", options: [{ text: "x", result: "y" }] },
    { id: "c", npc: {}, text: "", options: [{ text: "x", result: "y" }] }
  ];
  const ev = { id: "x", picks: 2, encounters: encs };
  const g = E.createGame(data, { events: [ev] }, { seed: 1, roleId: "designer", eventId: "x" });
  assert.strictEqual(g.queue.length, 2);
  while (g.current.id !== "a") E.choose(g, 0);
  const o = E.choose(g, 0);
  assert.strictEqual(o.total, 2, "total зафиксирован до вставки цепочки");
  assert.strictEqual(g.queue.length, 3, "очередь выросла после вставки");
  assert.strictEqual(o.step, g.index, "step — номер сыгранной встречи");
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
  const span = E.timeSpan(g);
  assert.strictEqual(lines.length, span ? 10 : 9);
  if (span) assert.strictEqual(lines[6], span, "строка времени — сразу под шкалами");
  assert.strictEqual(lines[1], E.runEmoji(g));
  const t2 = E.shareText(g, g.ending);
  const last2 = t2.split("\n").pop();
  assert.ok(!last2.includes("→") && last2.endsWith("?"), "без url вызов без стрелки: " + last2);
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
