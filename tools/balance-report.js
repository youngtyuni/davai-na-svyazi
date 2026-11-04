// Отчёт по дельтам: средние значения на вариант по каждому ивенту
const { loadAll } = require("./_load.js");
const { content } = loadAll({ prod: true });
const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(1);
console.log('event        opts  cringe  energy  clout  cringe≥20  cringe<0  contacts(real)');
for (const ev of content.events) {
  let n = 0, c = 0, e = 0, k = 0, hi = 0, neg = 0, ct = 0, real = 0;
  for (const enc of ev.encounters) for (const o of enc.options) {
    n++; c += o.cringe || 0; e += o.energy || 0; k += o.clout || 0;
    if ((o.cringe || 0) >= 20) hi++; if ((o.cringe || 0) < 0) neg++;
    if (o.contact) { ct++; if (o.contact.kind === 'real') real++; }
  }
  console.log(ev.id.padEnd(12), String(n).padStart(4), fmt(c / n).padStart(7), fmt(e / n).padStart(7), fmt(k / n).padStart(6), String(hi).padStart(9), String(neg).padStart(9), `${ct}(${real})`.padStart(10));
}
