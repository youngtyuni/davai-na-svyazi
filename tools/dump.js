// Дамп всего контента в markdown для чтения/редактуры: node tools/dump.js > corpus.md
const { loadAll } = require("./_load.js");
const { data, content } = loadAll({ prod: true });
const d = o => ["energy", "cringe", "clout"].filter(k => o[k]).map(k => `${k} ${o[k] > 0 ? "+" : ""}${o[k]}`).join(", ");
console.log("# ДАВАЙ НА СВЯЗИ — полный корпус\n");
console.log("## Роли\n");
for (const r of data.roles) console.log(`- **${r.name}** (${r.id}) — «${r.tagline}» · карточка: ${r.card}`);
console.log("\n## Финалы\n");
for (const e of data.endings) console.log(`- ${e.emoji} **${e.title}** (${e.id}) — ${e.verdict} / ${e.body}`);
console.log("\n## Ачивки\n");
for (const a of data.achievements) console.log(`- ${a.emoji} **${a.title}** (${a.flag} ×${a.count}) — ${a.text}`);
for (const ev of content.events) {
  console.log(`\n\n# ИВЕНТ: ${ev.emoji} ${ev.title} (${ev.id})\n`);
  console.log(`**Подзаголовок:** ${ev.subtitle}\n\n**Интро:** ${ev.intro}\n`);
  for (const enc of ev.encounters) {
    const tags = [enc.roles ? `роли: ${enc.roles.join(", ")}` : "", enc.final ? "ФИНАЛ" : "", enc.chained ? "цепочка" : ""].filter(Boolean).join(" · ");
    console.log(`\n### ${enc.id}${tags ? " — " + tags : ""}\n`);
    console.log(`**${enc.npc.emoji} ${enc.npc.name}** — _${enc.npc.title}_\n\n${enc.text}\n`);
    enc.options.forEach((o, i) => {
      const extra = [d(o), o.contact ? `контакт: ${o.contact.name} (${o.contact.kind}${o.contact.note ? ", «" + o.contact.note + "»" : ""})` : "", o.flags ? `флаги: ${o.flags.join(", ")}` : "", o.next ? `→ ${o.next}` : ""].filter(Boolean).join(" · ");
      console.log(`${i + 1}. **${o.text}**\n   → ${o.result}\n   _${extra}_`);
    });
  }
}
