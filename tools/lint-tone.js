// Линтер тона 2.0: node tools/lint-tone.js [content/events/<id>.js ...]  (без аргументов — все прод-файлы)
// Считает запрещённые закрывашки, прыжки во времени, протокольные глаголы, повторы имён, лимиты. Exit 1 при нарушениях.
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
let files = process.argv.slice(2);
if (!files.length) files = fs.readdirSync(path.join(ROOT, "content/events")).filter(f => f.endsWith(".js") && !f.startsWith("_")).map(f => "content/events/" + f);
const load = f => { const w = { GAME_CONTENT: { events: [] } }; vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), vm.createContext({ window: w })); return w.GAME_CONTENT.events; };
const FORBIDDEN = [
  [/Это и (был|была|было|есть) /u, "«Это и был/есть X»"],
  [/Это не [^.!?]{1,40}\. Это /u, "«Это не X. Это Y»"],
  [/\b(Он|Она|Ты|Они) тоже\.\s*$/u, "«Он тоже.» в конце"],
  [/Теперь и ты\./u, "«Теперь и ты»"],
  [/посмотрел[аи]? (на тебя )?как на /u, "«посмотрел как на…»"],
  [/кивнул[аи]?,? как кивают/u, "«кивнул, как кивают»"],
  [/впервые за (вечер|ночь)/u, "«впервые за вечер»"],
  [/(самый честный|единственный (честный|нормальный|настоящий)) /u, "«самый честный / единственный нормальный»"],
  [/^Пауза\./u, "«Пауза.» первым словом"],
  [/был[аи]? «всем»/u, "«ты был „всем“»"],
];
const TIME_JUMP = /(^|[.!?»] )(Через (неделю|месяц|год|три|два|час|день|полгода|сутки|пять|неделю-другую|минуту)|Утром|Назавтра|К утру|В понедельник|Через \d)/u;
const PROTOCOL = /\b(сказал[аи]?|кивнул[аи]?|записал[аи]?|спросил[аи]?|посмотрел[аи]?)\b/gu;
let problems = 0, warnings = 0;
const allNames = new Map();
for (const f of files) {
  for (const ev of load(f)) {
    let jumps = 0, zapisal = 0; const names = new Map();
    const report = (id, msg) => { console.log(`  [${id}] ${msg}`); };
    console.log(`\n${ev.id} (${f})`);
    if (!ev.time) { console.log("  ⚠ нет поля time"); warnings++; }
    const anchors = ev.encounters.filter(e => e.anchor).length;
    if (anchors !== 1) { console.log(`  ✗ anchor-встреч: ${anchors} (нужна ровно 1)`); problems++; }
    if (!ev.encounters.some(e => e.final)) { console.log("  ✗ нет final"); problems++; }
    for (const enc of ev.encounters) {
      const n = enc.npc.name; names.set(n, (names.get(n) || 0) + 1);
      if (enc.npc.title.length > 50) { report(enc.id, `⚠ титул ${enc.npc.title.length} > 50`); warnings++; }
      if (enc.text.length > 200) { report(enc.id, `⚠ ситуация ${enc.text.length} > 200`); warnings++; }
      const saves = enc.options.some(o => (o.energy || 0) >= 0 || (o.cringe || 0) <= 0);
      if (!saves) { report(enc.id, "✗ ни один вариант не бережёт (energy ≥ 0 или cringe ≤ 0)"); problems++; }
      enc.options.forEach((o, i) => {
        const r = o.result;
        for (const [re, label] of FORBIDDEN) if (re.test(r)) { report(enc.id, `✗ вариант ${i + 1}: ${label} — «${r.slice(0, 60)}…»`); problems++; }
        if (TIME_JUMP.test(r)) jumps++;
        if (/записал[аи]? (тебя|контакт|как) /u.test(r)) zapisal++;
        const pv = (r.match(PROTOCOL) || []).length;
        if (pv > 1) { report(enc.id, `⚠ вариант ${i + 1}: протокольных глаголов ${pv}`); warnings++; }
        if (r.length > 200) { report(enc.id, `⚠ вариант ${i + 1}: исход ${r.length} > 200`); warnings++; }
        if (o.contact && o.contact.kind === "empty" && /напишет|ответит|позвонит/u.test(o.contact.note || "") && !/не напишет|не ответит/u.test(o.contact.note || "")) { report(enc.id, `⚠ вариант ${i + 1}: пустой контакт с обещанием ответа в note`); warnings++; }
      });
    }
    if (jumps > 2) { console.log(`  ✗ прыжков во времени: ${jumps} (макс. 2)`); problems++; }
    if (zapisal > 1) { console.log(`  ✗ «записал тебя как…»: ${zapisal} (макс. 1)`); problems++; }
    for (const [n, c] of names) { if (allNames.has(n) && allNames.get(n) !== ev.id) { console.log(`  ✗ имя «${n}» уже есть в ${allNames.get(n)}`); problems++; } allNames.set(n, ev.id); }
  }
}
console.log(`\nНарушений: ${problems}, предупреждений: ${warnings}`);
process.exit(problems ? 1 : 0);
