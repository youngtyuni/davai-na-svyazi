// Рендер экранов в #app. Весь текст — через textContent, никакого innerHTML с контентом.
(function () {
  "use strict";

  const DATA = window.GAME_DATA;
  const CONTENT = window.GAME_CONTENT || { events: [] };
  const E = window.Engine;
  const STORAGE_KEY = "dns_progress";

  // Адрес игры для шер-текста: og:url из <head>, иначе текущий адрес без хеша и параметров
  const SITE_URL = (function () {
    const meta = document.querySelector('meta[property="og:url"]');
    const og = meta && (meta.getAttribute("content") || "").trim();
    return og || location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "");
  })();

  const app = {
    root: null,
    roleId: null,
    eventId: null,
    game: null,
    canvas: null,
    shareReady: null
  };

  // ---------- DOM-хелперы ----------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(k => {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") throw new Error("innerHTML запрещён");
        else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function button(text, onClick, cls, attrs) {
    return el("button", Object.assign({ class: "btn " + (cls || ""), type: "button", text, onclick: onClick }, attrs || {}));
  }

  function show(screen, name) {
    app.root.textContent = "";
    screen.classList.add("screen", "screen--" + name);
    screen.dataset.screen = name;
    app.root.appendChild(screen);
    window.scrollTo(0, 0);
    // фокус на заголовок для скринридеров
    const h = screen.querySelector("h1, h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }

  function toast(msg) {
    const t = el("div", { class: "toast", role: "status", text: msg });
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("toast--show"), 10);
    setTimeout(() => { t.classList.remove("toast--show"); setTimeout(() => t.remove(), 300); }, 1800);
  }

  function fmtDelta(n) {
    return (n > 0 ? "+" : "−") + Math.abs(n);
  }

  // ---------- localStorage: счётчик забегов и собранные финалы ----------

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const p = raw ? JSON.parse(raw) : null;
      if (p && typeof p === "object") return { runs: p.runs | 0, endings: Array.isArray(p.endings) ? p.endings : [] };
    } catch (e) { /* приватный режим и т.п. */ }
    return { runs: 0, endings: [] };
  }

  function saveProgress(endingId) {
    const p = loadProgress();
    p.runs += 1;
    if (!p.endings.includes(endingId)) p.endings.push(endingId);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* ок */ }
    return p;
  }

  // ---------- Шкалы ----------

  function statRow(key, value) {
    const s = DATA.stats[key];
    const row = el("div", { class: "stat stat--" + key + (key === "energy" && value < 20 ? " stat--low" : ""),
      role: "meter", "aria-label": s.label, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(value) }, [
      el("span", { class: "stat__key" }, [
        el("span", { class: "stat__emoji", "aria-hidden": "true", text: s.emoji }),
        el("span", { class: "stat__label", "aria-hidden": "true", text: s.label.toLowerCase() })
      ]),
      el("div", { class: "stat__bar" }, [el("div", { class: "stat__fill", style: { width: value + "%" } })]),
      el("span", { class: "stat__num", text: String(value) })
    ]);
    return row;
  }

  function statsPanel(values) {
    return el("div", { class: "stats" }, E.STATS.map(k => statRow(k, values[k])));
  }

  // Анимирует панель от before к after (ширина через CSS-transition, число — через rAF)
  function animateStats(panel, before, after) {
    E.STATS.forEach(k => {
      const row = panel.querySelector(".stat--" + k);
      if (!row) return;
      const fill = row.querySelector(".stat__fill");
      const num = row.querySelector(".stat__num");
      const from = before[k], to = after[k];
      row.setAttribute("aria-valuenow", String(to));
      requestAnimationFrame(() => {
        fill.style.width = to + "%";
        const t0 = performance.now(), dur = 600;
        const tick = now => {
          const p = Math.min(1, (now - t0) / dur);
          num.textContent = String(Math.round(from + (to - from) * p));
          if (p < 1) requestAnimationFrame(tick);
          else if (k === "energy") row.classList.toggle("stat--low", to < 20);
        };
        requestAnimationFrame(tick);
      });
    });
  }

  // ---------- Экраны ----------

  function collectedLine(progress) {
    return "Финалов: " + progress.endings.length + " из " + DATA.endings.length;
  }

  function allEndingsLabel(progress) {
    return "Все финалы (" + progress.endings.length + " из " + DATA.endings.length + ")";
  }

  // Стикеры и бейджи для стартового экрана — случайный на каждый показ
  const STICKERS = ["«скинь презу»", "«созвонимся»", "«за опыт»", "«мы семья»", "«давай ВП»", "«это пойдёт в кейс»", "«бюджета нет»", "«а что хотел сказать автор»", "«ты же дизайнер»", "«в силе?»"];
  const HERO_NPCS = [
    { name: "никто", title: "ex-всё, founder, в поиске себя", emoji: "🫥" },
    { name: "Ярик", title: "Founder, visionary, экосистема", emoji: "🧢" },
    { name: "Полина", title: "Куратор, «работаю с памятью»", emoji: "🥂" },
    { name: "Марк", title: "Промоутер. Гонорары на неделе", emoji: "🎧" },
    { name: "Лёша", title: "Вышел из найма. Три месяца", emoji: "✈️" },
    { name: "Света", title: "Комьюнити-билдер, «знаю всех»", emoji: "🤝" }
  ];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function renderStart() {
    const progress = loadProgress();
    const s = el("div", {}, [
      el("div", { class: "hero" }, [
        el("h1", { class: "hero__title", text: "ДАВАЙ НА СВЯЗИ" }),
        el("p", { class: "hero__sub", text: "симулятор нетворкинга в креативных индустриях" }),
        el("p", { class: "hero__desc", text: "Одна вечеринка. Восемь человек с длинными титулами. Три шкалы, все в минус." })
      ]),
      el("div", { class: "hero__badge" }, [
        el("span", { class: "sticker sticker--lime", text: pick(STICKERS) }),
        badge(pick(HERO_NPCS), false)
      ]),
      button("Пойти на ивент", () => renderRole(), "btn--primary btn--big"),
      progress.runs > 0 ? el("p", { class: "muted small center", text: collectedLine(progress) }) : null,
      progress.runs > 0 ? button(allEndingsLabel(progress), () => renderEndings(renderStart), "btn--ghost") : null,
      el("p", { class: "fine", text: "3 минуты. Ни одного полезного контакта." })
    ]);
    show(s, "start");
  }

  // Сетка всех финалов: открытые — с текстом, закрытые — «???»
  function renderEndings(back) {
    const progress = loadProgress();
    const cells = DATA.endings.map(e => {
      const open = progress.endings.includes(e.id);
      return el("li", { class: "ending-cell" + (open ? " ending-cell--open" : " ending-cell--locked") }, [
        el("span", { class: "ending-cell__emoji", "aria-hidden": "true", text: e.emoji }),
        el("span", { class: "ending-cell__title", text: open ? e.title : "???" }),
        el("span", { class: "ending-cell__text", text: open ? e.verdict : "так ты ещё не уходил" })
      ]);
    });
    const s = el("div", {}, [
      el("p", { class: "eyebrow", text: collectedLine(progress) }),
      el("h2", { class: "title", text: "Все финалы" }),
      el("ul", { class: "endings-grid" }, cells),
      button("Назад", back, "btn--secondary")
    ]);
    show(s, "endings");
  }

  // «🔋 −10 · ✨ +10» — стартовые модификаторы роли, чтобы шкалы были понятны до первой встречи
  function modsLine(role) {
    return E.STATS.filter(k => role.mods && role.mods[k])
      .map(k => DATA.stats[k].emoji + " " + fmtDelta(role.mods[k])).join(" · ");
  }

  function renderRole() {
    const cards = DATA.roles.map(r => el("button", {
      class: "card card--role", type: "button",
      onclick: () => { app.roleId = r.id; renderEvent(); }
    }, [
      el("span", { class: "card__emoji", "aria-hidden": "true", text: r.emoji }),
      el("span", { class: "card__body" }, [
        el("span", { class: "card__name", text: r.name }),
        el("span", { class: "card__tag", text: "«" + r.tagline + "»" }),
        modsLine(r) ? el("span", { class: "card__mods", text: modsLine(r) }) : null
      ])
    ]));
    const s = el("div", {}, [
      el("p", { class: "eyebrow", text: "регистрация · кто ты" }),
      el("h2", { class: "title", text: "Кто ты сегодня?" }),
      el("div", { class: "cards cards--roles" }, cards)
    ]);
    show(s, "role");
  }

  function renderEvent() {
    const events = CONTENT.events;
    const pick = id => { app.eventId = id; renderIntro(); };
    const cards = events.map(ev => el("button", {
      class: "card card--event", type: "button", onclick: () => pick(ev.id)
    }, [
      el("span", { class: "card__emoji", "aria-hidden": "true", text: ev.emoji }),
      el("span", { class: "card__body" }, [
        el("span", { class: "card__name", text: ev.title }),
        el("span", { class: "card__tag", text: ev.subtitle })
      ])
    ]));
    const role = DATA.roles.find(r => r.id === app.roleId);
    const s = el("div", {}, [
      el("p", { class: "eyebrow", text: "регистрация · " + (role ? role.emoji + " " + role.name + " · " : "") + "куда" }),
      el("h2", { class: "title", text: "Куда идём?" }),
      el("div", { class: "cards" }, cards),
      button("Куда позвали", () => pick(events[Math.floor(Math.random() * events.length)].id), "btn--secondary"),
      button("← Переписать бейдж", () => renderRole(), "btn--ghost")
    ]);
    show(s, "event");
  }

  function renderIntro() {
    app.game = E.createGame(DATA, CONTENT, { roleId: app.roleId, eventId: app.eventId });
    const ev = app.game.event;
    const s = el("div", {}, [
      el("div", { class: "intro__emoji", "aria-hidden": "true", text: ev.emoji }),
      el("h2", { class: "title", text: ev.title }),
      el("p", { class: "intro__sub", text: ev.subtitle }),
      el("p", { class: "intro__text", text: ev.intro }),
      el("p", { class: "intro__legend muted small", text: E.STATS.map(k => DATA.stats[k].emoji + " " + DATA.stats[k].label.toLowerCase()).join(" · ") + ". Все три ты не удержишь." }),
      button("Сдать куртку и зайти", () => renderEncounter(), "btn--primary btn--big")
    ]);
    show(s, "intro");
  }

  function badge(npc, shake) {
    return el("div", { class: "badge-wrap" }, [
      el("div", { class: "lanyard", "aria-hidden": "true" }),
      el("article", { class: "badge" + (shake ? " badge--shake" : "") }, [
        el("div", { class: "badge__clip", "aria-hidden": "true" }),
        el("div", { class: "badge__hello", text: "ПРИВЕТ, Я" }),
        el("h2", { class: "badge__name" }, [
          npc.emoji ? el("span", { class: "badge__emoji", "aria-hidden": "true", text: npc.emoji }) : null,
          el("span", { class: "badge__name-text", text: npc.name })
        ]),
        el("p", { class: "badge__title", text: npc.title })
      ])
    ]);
  }

  // n — номер показываемой встречи (на экране исхода index уже сдвинут, поэтому передаём явно), time — «21:40»,
  // total — длина очереди на момент встречи (цепочка может удлинить её сразу после выбора)
  function hud(game, values, n, time, total) {
    total = total || game.queue.length;
    const step = Math.min(n, total);
    return el("header", { class: "hud" }, [
      statsPanel(values),
      el("div", { class: "hud__side" }, [
        el("span", { class: "clock", "aria-label": "время", text: time }),
        el("span", { class: "counter", "aria-label": "встреча " + step + " из " + total, text: step + " из " + total }),
        game.done ? null : button("Уйти по-английски", () => { E.leaveEnglish(game); renderEnding(); }, "btn--tiny")
      ])
    ]);
  }

  // Экран встречи: бейдж + ситуация + варианты
  function renderEncounter() {
    const g = app.game;
    if (g.done) return renderEnding();
    const enc = g.current;
    const options = enc.options.map((o, i) => button(o.text, () => {
      E.choose(g, i);
      renderOutcome(enc);
    }, "btn--option"));
    const s = el("div", {}, [
      hud(g, g, g.index + 1, E.clock(g)),
      badge(enc.npc, false),
      el("p", { class: "situation", text: enc.text }),
      el("div", { class: "options", role: "group", "aria-label": "Варианты ответа" }, options)
    ]);
    show(s, "encounter");
  }

  // Тот же экран, но вместо вариантов — результат выбора
  function renderOutcome(enc) {
    const g = app.game;
    const o = g.outcome;
    const cringeUp = (o.deltas.cringe || 0) > 0;

    const deltaNodes = [];
    E.STATS.forEach(k => {
      const d = o.deltas[k];
      if (!d) return;
      // для кринжа рост — плохо, для остальных — хорошо
      const good = k === "cringe" ? d < 0 : d > 0;
      if (deltaNodes.length) deltaNodes.push(el("span", { class: "sep", text: " · " }));
      deltaNodes.push(el("span", { class: good ? "delta delta--good" : "delta delta--bad", text: DATA.stats[k].emoji + " " + fmtDelta(d) }));
    });

    const panel = hud(g, o.before, o.step || g.log.length, o.time || E.clock(g, g.log.length - 1), o.total);
    // пустой контакт — «контакт» в кавычках: понятно задним числом, без спойлера
    const contactLabel = o.contact ? (o.contact.kind === "real" ? "+ контакт: " : "+ «контакт»: ") + o.contact.name +
      (o.contact.note ? " (" + o.contact.note + ")" : "") : "";
    const s = el("div", {}, [
      panel,
      badge(enc.npc, cringeUp),
      el("p", { class: "chosen", title: enc.text, text: "— " + o.optionText }),
      el("div", { class: "outcome" }, [
        el("p", { class: "outcome__text", text: o.result }),
        deltaNodes.length ? el("p", { class: "outcome__deltas" }, deltaNodes) : null,
        o.contact ? el("div", { class: "contact-badge" }, [el("span", { text: contactLabel })]) : null,
        button("Дальше", () => renderEncounter(), "btn--primary")
      ])
    ]);
    show(s, "outcome");
    animateStats(panel.querySelector(".stats"), o.before, o.after);
  }

  function contactsList(contacts) {
    if (!contacts.length) return el("p", { class: "muted", text: "В телефоне те же люди, что и утром." });
    return el("ul", { class: "contacts" }, contacts.map(c => el("li", { class: "contact contact--" + c.kind }, [
      el("span", { class: "contact__mark", "aria-label": c.kind === "real" ? "напишет" : "не напишет", text: c.kind === "real" ? "✅" : "💤" }),
      el("span", { class: "contact__name", text: c.name }),
      c.title ? el("span", { class: "contact__title", text: " — " + c.title }) : null,
      c.note ? el("span", { class: "contact__note", text: " — " + c.note }) : null
    ])));
  }

  function achievementsList(list) {
    if (!list.length) return null;
    return el("ul", { class: "achs" }, list.map(a => el("li", { class: "ach" }, [
      el("span", { class: "ach__emoji", "aria-hidden": "true", text: a.emoji }),
      el("span", { class: "ach__body" }, [
        el("span", { class: "ach__title", text: a.title }),
        el("span", { class: "ach__text", text: a.text })
      ])
    ])));
  }

  function renderEnding() {
    const g = app.game;
    if (!g.done) E.finish(g);
    const ending = g.ending;
    const ach = E.resolveAchievements(g);
    const real = g.contacts.filter(c => c.kind === "real").length;
    // забег засчитываем один раз, даже если вернулись с экрана «Все финалы»
    const progress = g._counted ? loadProgress() : saveProgress(ending.id);
    g._counted = true;
    const text = E.shareText(g, ending, SITE_URL);
    const chain = E.runEmoji(g);
    const tgUrl = "https://t.me/share/url?url=" + encodeURIComponent(SITE_URL) + "&text=" + encodeURIComponent(text);

    const canvas = el("canvas", { class: "share-canvas", width: "1080", height: "1350", "aria-label": "Шер-карточка" });
    app.canvas = canvas;
    app.shareReady = window.Share.renderShareCard(canvas, {
      ending, state: g, role: g.role, event: g.event, url: SITE_URL, achievements: ach.all
    }).catch(err => { console.error(err); return null; });

    const actions = el("div", { class: "actions" }, [
      button("Сохранить сторис", () => {
        app.shareReady.then(() => window.Share.downloadCard(canvas, "davai-na-svyazi-" + ending.id + ".png"));
      }, "btn--primary"),
      button("Скопировать для чата", () => copyText(text), "btn--secondary"),
      navigator.share ? button("Поделиться", () => nativeShare(text, canvas, ending), "btn--secondary") : null,
      el("a", { class: "btn btn--secondary", href: tgUrl, target: "_blank", rel: "noopener", text: "В Telegram" }),
      button("Ещё один ивент", () => renderEvent(), "btn--primary"),
      button(allEndingsLabel(progress), () => renderEndings(renderEnding), "btn--ghost"),
      button("Сменить бейдж", () => { app.roleId = null; app.eventId = null; renderStart(); }, "btn--ghost")
    ]);

    const s = el("div", {}, [
      el("div", { class: "ending__emoji", "aria-hidden": "true", text: ending.emoji }),
      el("h1", { class: "ending__title", text: ending.title }),
      el("p", { class: "ending__verdict", text: ending.verdict }),
      chain ? el("p", { class: "ending__chain", "aria-label": "эмодзи-цепочка вечера", text: chain }) : null,
      el("p", { class: "ending__body", text: ending.body }),
      statsPanel(g),
      el("p", { class: "contacts-line", text: DATA.contactsLine(g.contacts.length, real) }),
      contactsList(g.contacts),
      ach.all.length ? el("h3", { class: "subhead", text: "Что ты натворил" }) : null,
      achievementsList(ach.all),
      el("p", { class: "muted small", text: "Вечер №" + progress.runs + " · " + g.role.emoji + " " + g.role.name + (E.timeSpan(g) ? " · " + E.timeSpan(g) : "") }),
      el("div", { class: "share-preview" }, [canvas]),
      actions
    ]);
    show(s, "ending");
  }

  // ---------- Шеринг ----------

  function copyText(text) {
    const done = () => toast("Скопировано. Скинь коллеге.");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => legacyCopy(text) && done());
    } else if (legacyCopy(text)) done();
  }

  function legacyCopy(text) {
    try {
      const ta = el("textarea", { style: { position: "fixed", opacity: "0" } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  function nativeShare(text, canvas, ending) {
    app.shareReady.then(() => window.Share.canvasToFile(canvas, "davai-na-svyazi-" + ending.id + ".png")).then(file => {
      const payload = { title: "ДАВАЙ НА СВЯЗИ", text, url: SITE_URL };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) payload.files = [file];
      return navigator.share(payload);
    }).catch(() => { /* пользователь закрыл шит — не ошибка */ });
  }

  // ---------- Старт ----------

  // Клавиши 1–4 выбирают вариант на экране встречи (десктоп)
  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= 4)) return;
    const screen = app.root.querySelector("[data-screen]");
    if (!screen || screen.dataset.screen !== "encounter") return;
    const btn = screen.querySelectorAll(".btn--option")[n - 1];
    if (btn) { e.preventDefault(); btn.click(); }
  }

  function init() {
    app.root = document.getElementById("app");
    document.addEventListener("keydown", onKey);
    if (!CONTENT.events.length) {
      app.root.appendChild(el("p", { class: "error", text: "Контент не подключён: нет ни одного ивента." }));
      return;
    }
    renderStart();
  }

  window.UI = { init, renderStart, renderRole, renderEvent, renderIntro, renderEncounter, renderEnding, renderEndings, app };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
