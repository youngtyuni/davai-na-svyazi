#!/usr/bin/env node
// Валидатор контента: node tools/validate.js [--prod]
// Проверяет ивенты из content/events/*.js по docs/CONTENT_SCHEMA.md. Exit 1 при ошибках.
"use strict";
const { loadAll } = require("./_load");

const PROD = process.argv.includes("--prod");

// Канонический список флагов из GAME_DESIGN.md + всё, что есть в data.achievements
const DESIGN_FLAGS = [
  "said_davai", "prosecco", "lied", "pitched", "free_work", "forgot_name", "phone_hide", "toilet",
  "ai_talk", "honest", "ghosted", "complained", "fake_laugh", "ask_budget", "burnout"
];
const LIMITS = { text: 280, optionText: 90, result: 220, npcTitle: 70 };
const DELTA_MIN = -40, DELTA_MAX = 40;
const STATS = ["energy", "cringe", "clout"];

const { data, content, files, eventFiles } = loadAll({ prod: PROD });
const FLAGS = new Set(DESIGN_FLAGS.concat(data.achievements.map(a => a.flag)));

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(where + ": " + msg);
const warn = (where, msg) => warnings.push(where + ": " + msg);

const len = s => String(s || "").length;
const isInt = v => Number.isInteger(v);

let totalEnc = 0, totalOpt = 0, totalReal = 0;
const globalIds = new Map(); // id встречи → ивент

content.events.forEach(ev => {
  const file = eventFiles[ev.id] || "?";
  const evWhere = `[${file} → ${ev.id}]`;
  if (!ev.id) err(evWhere, "у ивента нет id");
  ["title", "subtitle", "emoji", "intro"].forEach(k => { if (!ev[k]) err(evWhere, `нет поля ${k}`); });
  const picks = ev.picks || 8;
  const encs = Array.isArray(ev.encounters) ? ev.encounters : [];
  if (!encs.length) err(evWhere, "нет встреч");
  const localIds = new Set(encs.map(e => e.id));
  const referencedByNext = new Set();

  encs.forEach(e => {
    totalEnc++;
    const where = `[${file} → ${ev.id} → ${e.id || "(без id)"}]`;
    if (!e.id) err(where, "нет id встречи");
    else if (globalIds.has(e.id)) err(where, `дубликат id (уже есть в ивенте ${globalIds.get(e.id)})`);
    else globalIds.set(e.id, ev.id);
    if (e.id && !e.id.startsWith(ev.id + "_")) warn(where, `id без префикса «${ev.id}_»`);

    if (!e.npc || !e.npc.name) err(where, "нет npc.name");
    if (e.npc && len(e.npc.title) > LIMITS.npcTitle) err(where, `npc.title длиннее ${LIMITS.npcTitle} (${len(e.npc.title)})`);
    if (!e.text) err(where, "нет text");
    if (len(e.text) > LIMITS.text) err(where, `text длиннее ${LIMITS.text} (${len(e.text)})`);
    if (e.roles !== undefined) {
      if (!Array.isArray(e.roles) || !e.roles.length) err(where, "roles должен быть непустым массивом");
      else e.roles.forEach(r => { if (!data.roles.some(x => x.id === r)) err(where, `неизвестная роль «${r}»`); });
    }

    const opts = Array.isArray(e.options) ? e.options : [];
    if (opts.length < 2 || opts.length > 4) err(where, `вариантов должно быть 2–4, сейчас ${opts.length}`);
    opts.forEach((o, i) => {
      totalOpt++;
      const ow = `${where} вариант ${i + 1}`;
      if (!o.text) err(ow, "нет text");
      if (len(o.text) > LIMITS.optionText) err(ow, `text длиннее ${LIMITS.optionText} (${len(o.text)})`);
      if (!o.result) err(ow, "нет result");
      if (len(o.result) > LIMITS.result) err(ow, `result длиннее ${LIMITS.result} (${len(o.result)})`);
      STATS.forEach(k => {
        if (o[k] === undefined) return;
        if (!isInt(o[k])) err(ow, `${k} должен быть целым числом`);
        else if (o[k] < DELTA_MIN || o[k] > DELTA_MAX) err(ow, `${k}=${o[k]} вне диапазона ${DELTA_MIN}…${DELTA_MAX}`);
      });
      if (o.contact) {
        if (!o.contact.name) err(ow, "у contact нет name");
        if (!["real", "empty"].includes(o.contact.kind)) err(ow, `contact.kind должен быть real|empty, сейчас «${o.contact.kind}»`);
        if (o.contact.kind === "real") totalReal++;
      }
      (o.flags || []).forEach(f => { if (!FLAGS.has(f)) err(ow, `неизвестный флаг «${f}»`); });
      if (o.next) {
        if (!localIds.has(o.next)) err(ow, `next «${o.next}» не найден в ивенте ${ev.id}`);
        else referencedByNext.add(o.next);
      }
    });
  });

  // структурные проверки ивента
  const pool = encs.filter(e => !e.chained);
  if (!pool.some(e => e.final)) err(evWhere, "нет ни одной встречи с final: true");
  const universal = pool.filter(e => !e.roles).length;
  if (universal < picks) {
    const msg = `универсальных встреч ${universal}, нужно ≥ picks (${picks})`;
    if (file.startsWith("_")) warn(evWhere, msg); else err(evWhere, msg);
  }
  encs.filter(e => e.chained && !referencedByNext.has(e.id))
    .forEach(e => warn(evWhere, `цепочечная встреча ${e.id} ни на кого не ссылается через next`));
});

warnings.forEach(w => console.log("ПРЕДУПРЕЖДЕНИЕ " + w));
if (errors.length) {
  errors.forEach(e => console.error("ОШИБКА " + e));
  console.error(`\n${errors.length} ошибок, ${warnings.length} предупреждений`);
  process.exit(1);
}

console.log(`OK: файлов ${files.length}, ивентов ${content.events.length}, встреч ${totalEnc}, вариантов ${totalOpt}, реальных контактов ${totalReal}` +
  (warnings.length ? `, предупреждений ${warnings.length}` : ""));
