// Шер-карточка в формате сторис 9:16 (1080×1920): рисует на canvas и отдаёт на скачивание.
// Нижние 250px оставлены пустыми под UI сторис.
(function () {
  "use strict";

  const W = 1080, H = 1920;
  const SAFE_BOTTOM = H - 250; // ниже — ничего важного
  const C = { bg: "#0B0B0B", lime: "#D8FF3B", pink: "#FF3EA5", paper: "#F3F0E6", blue: "#3B5BFF", grey: "#9a9a9a" };
  const HEAD = "Unbounded, 'Arial Black', sans-serif";
  const BODY = "'Inter Tight', Inter, system-ui, sans-serif";

  // Перенос текста по словам в пределах maxWidth. Возвращает массив строк
  function wrapText(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach(w => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  // Рисует строки по центру, возвращает y после последней строки
  function drawLines(ctx, lines, x, y, lineHeight, maxLines) {
    lines.slice(0, maxLines || lines.length).forEach(l => {
      ctx.fillText(l, x, y);
      y += lineHeight;
    });
    return y;
  }

  function drawBar(ctx, y, emoji, label, value, color) {
    const x = 110, w = 860, h = 34;
    ctx.font = "600 32px " + BODY;
    ctx.textAlign = "left";
    ctx.fillStyle = C.paper;
    ctx.fillText(emoji + " " + label, x, y);
    ctx.textAlign = "right";
    ctx.font = "700 32px " + HEAD;
    ctx.fillText(String(value), x + w, y);
    const by = y + 16;
    ctx.fillStyle = "#222";
    ctx.fillRect(x, by, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, by, Math.round(w * Math.max(0, Math.min(100, value)) / 100), h);
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, by, w, h);
    return by + h;
  }

  // Ждём шрифты страницы, чтобы canvas рисовал тем же Unbounded/Inter Tight
  function waitFonts() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    const loads = [
      document.fonts.load("900 80px Unbounded"),
      document.fonts.load("600 32px 'Inter Tight'")
    ].map(p => p.catch(() => null));
    return Promise.all(loads).then(() => document.fonts.ready).catch(() => null);
  }

  // Эмодзи-цепочка по кускам (чтобы не вылезала за ширину)
  function chunk(str, size) {
    const arr = Array.from(str);
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size).join(""));
    return out;
  }

  function renderShareCard(canvas, opts) {
    const { ending, state, role, url } = opts;
    const data = state._data;
    const E = window.Engine;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    return waitFonts().then(() => {
      // фон
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      // кислотная рамка + розовый сдвиг
      ctx.strokeStyle = C.pink;
      ctx.lineWidth = 12;
      ctx.strokeRect(54, 54, W - 92, H - 92);
      ctx.strokeStyle = C.lime;
      ctx.strokeRect(40, 40, W - 80, H - 80);

      // стикер-уголок
      ctx.save();
      ctx.translate(W - 190, 380); // справа от эмодзи, не задевает заголовок
      ctx.rotate(0.25);
      ctx.fillStyle = C.pink;
      ctx.fillRect(-80, -40, 160, 80);
      ctx.fillStyle = C.bg;
      ctx.font = "800 28px " + HEAD;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ИТОГ", 0, 2);
      ctx.restore();

      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";

      // заголовок игры
      ctx.fillStyle = C.lime;
      ctx.font = "900 54px " + HEAD;
      ctx.fillText("ДАВАЙ НА СВЯЗИ", W / 2, 180);
      ctx.fillStyle = C.paper;
      ctx.font = "500 28px " + BODY;
      ctx.fillText("симулятор нетворкинга в креативных индустриях", W / 2, 228);

      // эмодзи и название финала — огромным
      ctx.font = "190px " + BODY;
      ctx.fillText(ending.emoji, W / 2, 440);

      ctx.fillStyle = C.paper;
      ctx.font = "900 78px " + HEAD;
      const titleLines = wrapText(ctx, ending.title.toUpperCase(), 900);
      let y = drawLines(ctx, titleLines, W / 2, 560, 86, 2);

      // приговор
      ctx.fillStyle = C.lime;
      ctx.font = "600 38px " + BODY;
      const verdictLines = wrapText(ctx, ending.verdict, 880);
      y = drawLines(ctx, verdictLines, W / 2, y + 4, 48, 3);

      // эмодзи-цепочка вечера
      const chain = E ? E.runEmoji(state) : "";
      if (chain) {
        ctx.font = "60px " + BODY;
        y = drawLines(ctx, chunk(chain, 12), W / 2, y + 48, 72, 2) - 10;
      }

      // шкалы
      y += 30;
      y = drawBar(ctx, y, data.stats.energy.emoji, data.stats.energy.label, state.energy, C.lime) + 44;
      y = drawBar(ctx, y, data.stats.cringe.emoji, data.stats.cringe.label, state.cringe, C.pink) + 44;
      y = drawBar(ctx, y, data.stats.clout.emoji, data.stats.clout.label, state.clout, C.blue) + 52;

      // время вечера «19:00 → 01:30» — мелко, только если ивент задаёт time
      const span = E && E.timeSpan ? E.timeSpan(state) : "";
      if (span) {
        ctx.textAlign = "center";
        ctx.fillStyle = C.grey;
        ctx.font = "500 26px " + BODY;
        ctx.fillText(span, W / 2, y - 14);
        y += 30;
      }

      // контакты
      const real = state.contacts.filter(c => c.kind === "real").length;
      ctx.textAlign = "center";
      ctx.fillStyle = C.paper;
      ctx.font = "700 34px " + HEAD;
      ctx.fillText(data.contactsLine(state.contacts.length, real), W / 2, y);
      y += 56;

      // вызов + URL — не ниже безопасной зоны; limit — верх этого блока
      const challenge = E ? E.challengeLine(state) : "А ты кто?";
      ctx.font = "800 42px " + HEAD;
      const chLines = wrapText(ctx, challenge, 900);
      const needed = chLines.length * 52 + 70;
      const limit = SAFE_BOTTOM - needed;

      // роль — измеряем заранее, чтобы знать, сколько места останется под ачивки
      ctx.font = "500 28px " + BODY;
      const roleLines = wrapText(ctx, (role && role.card) || "", 880);
      const roleH = roleLines.length ? 12 + roleLines.length * 34 : 0;

      // ачивки (до 3, по строке): показываем столько, сколько влезает до вызова, минимум одну
      let ach = (opts.achievements || []).slice(0, 3);
      while (ach.length > 1 && y + ach.length * 48 + roleH + 40 > limit) ach = ach.slice(0, -1);
      ctx.textAlign = "left";
      ach.forEach(a => {
        ctx.font = "32px " + BODY;
        ctx.fillStyle = C.paper;
        ctx.fillText(a.emoji, 110, y);
        ctx.font = "700 28px " + BODY;
        ctx.fillText(a.title, 166, y);
        const tw = ctx.measureText(a.title).width;
        ctx.font = "400 26px " + BODY;
        ctx.fillStyle = C.grey;
        ctx.fillText(wrapText(ctx, "— " + a.text, 800 - tw)[0] || "", 166 + tw + 12, y);
        y += 48;
      });

      // роль
      ctx.textAlign = "center";
      ctx.fillStyle = C.grey;
      ctx.font = "500 28px " + BODY;
      y = drawLines(ctx, roleLines, W / 2, y + 12, 34, 2);

      // вызов: прижат к безопасной зоне, но никогда не наезжает на контент выше
      ctx.fillStyle = C.lime;
      ctx.font = "800 42px " + HEAD;
      y = Math.max(Math.min(y + 40, limit), y + 24);
      y = drawLines(ctx, chLines, W / 2, y, 52, 2);
      ctx.fillStyle = C.paper;
      ctx.font = "700 30px " + HEAD;
      ctx.fillText(url || "", W / 2, y + 12);
      return canvas;
    });
  }

  // Скачивание через toBlob → временная ссылка
  function downloadCard(canvas, filename) {
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        if (!blob) return resolve(false);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        resolve(true);
      }, "image/png");
    });
  }

  function canvasToFile(canvas, filename) {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob ? new File([blob], filename, { type: "image/png" }) : null), "image/png");
    });
  }

  window.Share = { renderShareCard, downloadCard, canvasToFile, wrapText, W, H };
})();
