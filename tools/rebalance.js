// Глобальная калибровка дельт в content/events/*.js (кроме файлов на "_").
// Использование: node tools/rebalance.js <cringeFactor> <energyFactor> [cloutFactor]
// Положительный кринж и отрицательная энергия умножаются на коэффициент и округляются до 5 (минимум 5 по модулю).
const fs = require("fs"), path = require("path");
const [cf = 0.6, ef = 0.8, kf = 1] = process.argv.slice(2).map(Number);
const dir = path.join(__dirname, "..", "content", "events");
const r5 = (v, min) => { const s = Math.sign(v); let a = Math.round(Math.abs(v) / 5) * 5; if (a < min) a = min; return s * a; };
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js") && !f.startsWith("_"))) {
  const p = path.join(dir, f); let s = fs.readFileSync(p, "utf8"); let n = 0;
  s = s.replace(/\bcringe:\s*(-?\d+)/g, (m, v) => { v = +v; if (v <= 0) return m; n++; return `cringe: ${r5(v * cf, 5)}`; });
  s = s.replace(/\benergy:\s*(-?\d+)/g, (m, v) => { v = +v; if (v >= 0) return m; n++; return `energy: ${r5(v * ef, 5)}`; });
  if (kf !== 1) s = s.replace(/\bclout:\s*(-?\d+)/g, (m, v) => { v = +v; if (v === 0) return m; n++; return `clout: ${r5(v * kf, 5)}`; });
  fs.writeFileSync(p, s); console.log(f, "правок:", n);
}
