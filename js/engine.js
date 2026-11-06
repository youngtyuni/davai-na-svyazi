// Движок игры «ДАВАЙ НА СВЯЗИ». Чистая логика без DOM — работает и в браузере, и в Node.
(function (root) {
  "use strict";

  // ---------- PRNG ----------

  // mulberry32: маленький детерминированный генератор, достаточно для выборки встреч
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    if (typeof seed === "string") {
      // строка → число простым хешем
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
      return mulberry32(h);
    }
    return mulberry32(Number(seed));
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  const STATS = ["energy", "cringe", "clout"];

  // ---------- Выборка встреч ----------

  // anchor-встреча ивента: первая по порядку в файле с anchor: true (остальные anchor — обычные встречи)
  function findAnchor(event) {
    return (event.encounters || []).find(e => e.anchor && !e.chained) || null;
  }

  // Собирает очередь встреч на забег:
  // [anchor] + обычные (до 2 ролевых + универсальные, случайно) + phase:"late" (случайно) + final
  // anchor универсальна: ролевые ограничения на неё не действуют
  function pickEncounters(event, roleId, rng) {
    rng = rng || Math.random;
    const picks = event.picks || 8;
    const pool = (event.encounters || []).filter(e => !e.chained);
    const anchor = findAnchor(event);
    const rest = anchor ? pool.filter(e => e !== anchor) : pool;
    const limit = Math.max(0, picks - (anchor ? 1 : 0));

    const forRole = rest.filter(e => Array.isArray(e.roles) && e.roles.includes(roleId));
    const universal = rest.filter(e => !Array.isArray(e.roles) || e.roles.length === 0);

    let selected = shuffle(forRole, rng).slice(0, 2);
    const need = Math.max(0, limit - selected.length);
    selected = selected.concat(shuffle(universal, rng).slice(0, need));

    // гарантируем одну финальную встречу, если она есть в ивенте
    if (!selected.some(e => e.final)) {
      const candidates = rest.filter(e => e.final && !selected.includes(e) &&
        (!Array.isArray(e.roles) || e.roles.includes(roleId)));
      if (candidates.length) {
        const fin = candidates[Math.floor(rng() * candidates.length)];
        if (selected.length >= limit && selected.length) {
          // заменяем последнюю неролевую встречу, чтобы не раздувать забег
          let idx = -1;
          for (let i = selected.length - 1; i >= 0; i--) {
            if (!Array.isArray(selected[i].roles)) { idx = i; break; }
          }
          if (idx === -1) idx = selected.length - 1;
          selected.splice(idx, 1);
        }
        selected.push(fin);
      }
    }

    const finals = selected.filter(e => e.final);
    const body = selected.filter(e => !e.final);
    const early = shuffle(body.filter(e => e.phase !== "late"), rng);
    const late = shuffle(body.filter(e => e.phase === "late"), rng);
    return (anchor ? [anchor] : []).concat(early, late, finals);
  }

  // ---------- Время вечера ----------

  const DEFAULT_TIME = ["19:00", "01:00"];
  const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

  function parseHM(str) {
    const m = HM_RE.exec(String(str || "").trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function fmtHM(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  // [начало, конец] ивента как строки HH:MM; невалидное поле → значения по умолчанию
  function eventTime(event) {
    const t = event && Array.isArray(event.time) ? event.time : null;
    if (t && t.length === 2 && parseHM(t[0]) !== null && parseHM(t[1]) !== null) return [t[0], t[1]];
    return DEFAULT_TIME.slice();
  }

  // Время встречи index (0-based) из total: линейная интерполяция от начала к концу,
  // с переходом через полночь, с округлением до 5 минут. Последняя встреча — ровно конец
  function clockAt(time, index, total) {
    const start = parseHM(time[0]), end0 = parseHM(time[1]);
    const end = end0 < start ? end0 + 1440 : end0;
    if (!(total > 1)) return fmtHM(start);
    const i = clamp(index, 0, total - 1);
    if (i === total - 1) return fmtHM(end);
    const span = end - start;
    return fmtHM(Math.round((start + span * i / (total - 1)) / 5) * 5);
  }

  // Текущее время в забеге: по номеру встречи в очереди (по умолчанию — текущая)
  function clock(state, index) {
    const i = index === undefined ? state.index : index;
    return clockAt(state.time || eventTime(state.event), i, state.queue.length);
  }

  // ---------- Состояние ----------

  function createGame(data, content, opts) {
    opts = opts || {};
    const rng = makeRng(opts.seed);
    const role = data.roles.find(r => r.id === opts.roleId) || data.roles[0];
    const events = content.events || [];
    const event = events.find(e => e.id === opts.eventId) || events[0];
    if (!event) throw new Error("Нет ни одного ивента");

    const state = {
      seed: opts.seed,
      roleId: role.id,
      eventId: event.id,
      role, event,
      energy: 0, cringe: 0, clout: 0,
      contacts: [],
      flags: {},
      log: [],
      queue: pickEncounters(event, role.id, rng),
      time: eventTime(event),
      index: 0,
      current: null,
      outcome: null,
      done: false,
      exit: null,
      cringeMaxed: false,
      ending: null
    };
    // стартовые значения + модификаторы роли
    STATS.forEach(k => {
      const start = data.stats[k].start + ((role.mods && role.mods[k]) || 0);
      state[k] = clamp(start, 0, 100);
    });
    state.current = state.queue[0] || null;
    state._data = data; // ссылка на правила для финалов/ачивок (не сериализовать)
    if (!state.current) finish(state);
    return state;
  }

  function finish(state) {
    state.done = true;
    state.current = null;
    state.ending = resolveEnding(state);
    return state;
  }

  // Применяет выбор игрока: дельты, контакт, флаги, лог, переход к следующей встрече
  function choose(state, optionIndex) {
    if (state.done || !state.current) return null;
    const enc = state.current;
    const opt = enc.options[optionIndex];
    if (!opt) throw new Error("Нет варианта " + optionIndex + " во встрече " + enc.id);

    const before = { energy: state.energy, cringe: state.cringe, clout: state.clout };
    const deltas = {};
    STATS.forEach(k => {
      const d = Number(opt[k] || 0);
      if (d) {
        state[k] = clamp(state[k] + d, 0, 100);
        deltas[k] = d;
      }
    });

    let contact = null;
    if (opt.contact) {
      contact = Object.assign({ kind: "empty" }, opt.contact);
      state.contacts.push(contact);
    }
    (opt.flags || []).forEach(f => { state.flags[f] = (state.flags[f] || 0) + 1; });

    const outcome = {
      encounterId: enc.id,
      step: state.index + 1,
      total: state.queue.length, // до вставки цепочки — HUD исхода должен совпадать с HUD встречи
      time: clock(state, state.index),
      npc: enc.npc,
      optionText: opt.text,
      result: opt.result,
      deltas, before,
      after: { energy: state.energy, cringe: state.cringe, clout: state.clout },
      contact,
      flags: opt.flags || []
    };
    state.log.push(outcome);
    state.outcome = outcome;

    if (state.cringe >= 100) {
      state.cringeMaxed = true;
      return finish(state), outcome;
    }
    if (state.energy <= 0) {
      return finish(state), outcome;
    }

    if (opt.next) {
      const nextEnc = (state.event.encounters || []).find(e => e.id === opt.next);
      // уже показанную встречу (в т.ч. саму себя) второй раз не ставим — иначе цикл
      const shown = nextEnc && state.queue.slice(0, state.index + 1).includes(nextEnc);
      if (nextEnc && !shown) {
        // убираем дубликат дальше по очереди и ставим цепочечную встречу первой
        const rest = state.queue.slice(state.index + 1).filter(e => e !== nextEnc);
        state.queue = state.queue.slice(0, state.index + 1).concat([nextEnc], rest);
      }
    }

    state.index += 1;
    if (state.index >= state.queue.length) {
      finish(state);
    } else {
      state.current = state.queue[state.index];
    }
    return outcome;
  }

  function leaveEnglish(state) {
    if (state.done) return state;
    state.exit = "english";
    return finish(state);
  }

  // ---------- Финалы и ачивки ----------

  function buildCtx(state) {
    return {
      energy: state.energy,
      cringe: state.cringe,
      clout: state.clout,
      contacts: state.contacts.length,
      realContacts: state.contacts.filter(c => c.kind === "real").length,
      flags: state.flags,
      exit: state.exit,
      cringeMaxed: state.cringeMaxed
    };
  }

  function resolveEnding(state, data) {
    data = data || state._data;
    const ctx = buildCtx(state);
    return data.endings.find(e => { try { return !!e.when(ctx); } catch (err) { return false; } })
      || data.endings[data.endings.length - 1];
  }

  // Для каждого флага — только самая «старшая» сработавшая ачивка. shown ≤ 4, all — полный список
  function resolveAchievements(state, data) {
    data = data || state._data;
    const best = {};
    data.achievements.forEach(a => {
      const n = state.flags[a.flag] || 0;
      if (n >= a.count && (!best[a.flag] || best[a.flag].count < a.count)) best[a.flag] = a;
    });
    // порядок — как в data (по первому упоминанию флага)
    const order = [];
    data.achievements.forEach(a => { if (!order.includes(a.flag)) order.push(a.flag); });
    const all = order.filter(f => best[f]).map(f => best[f]);
    return { shown: all.slice(0, 4), all };
  }

  // ---------- Эмодзи-цепочка вечера ----------

  // Приоритет: контакт → флаг → крупная дельта → 🙂
  const FLAG_EMOJI = [
    ["toilet", "🚽"], ["phone_hide", "📱"], ["free_work", "🎁"], ["pitched", "📣"],
    ["said_davai", "📞"], ["prosecco", "🥂"], ["honest", "🫀"]
  ];

  function stepEmoji(entry) {
    if (entry.contact && entry.contact.kind === "real") return "🤝";
    if (entry.contact) return "📇";
    const flags = entry.flags || [];
    for (let i = 0; i < FLAG_EMOJI.length; i++) {
      if (flags.includes(FLAG_EMOJI[i][0])) return FLAG_EMOJI[i][1];
    }
    const d = entry.deltas || {};
    if ((d.cringe || 0) >= 15) return "😬";
    if ((d.energy || 0) <= -15) return "🪫";
    if ((d.clout || 0) >= 10) return "✨";
    return "🙂";
  }

  // Один эмодзи на каждую пройденную встречу, по порядку
  function runEmoji(state) {
    return state.log.map(stepEmoji).join("");
  }

  // ---------- Шер-текст ----------

  function bar(value, filled, empty) {
    const n = clamp(Math.round(value / 10), 0, 10);
    return filled.repeat(n) + empty.repeat(10 - n);
  }

  // «А ты кто на афтепати?» — where берётся из ивента, без него просто «А ты кто?»
  function challengeLine(state) {
    const where = state.event && state.event.where;
    return "А ты кто" + (where ? " " + where : "") + "?";
  }

  // «19:00 → 01:30»: от начала ивента до последней сыгранной встречи. Только если ивент задаёт time
  function timeSpan(state) {
    if (!state.event || !Array.isArray(state.event.time)) return "";
    const t = state.time || eventTime(state.event);
    const last = state.log.length ? state.log[state.log.length - 1] : null;
    const end = (last && last.time) || t[0];
    return t[0] + " → " + end;
  }

  function shareText(state, ending, url) {
    const data = state._data;
    const real = state.contacts.filter(c => c.kind === "real").length;
    const chain = runEmoji(state);
    const lines = ["ДАВАЙ НА СВЯЗИ · " + ending.emoji + " " + ending.title];
    if (chain) lines.push(chain);
    lines.push(
      ending.verdict,
      bar(state.energy, "🟩", "⬛") + " 🔋 " + data.stats.energy.label,
      bar(state.cringe, "🟥", "⬛") + " 😬 " + data.stats.cringe.label,
      bar(state.clout, "🟨", "⬛") + " ✨ " + data.stats.clout.label
    );
    const span = timeSpan(state);
    if (span) lines.push(span);
    lines.push(
      data.contactsLine(state.contacts.length, real),
      "",
      challengeLine(state) + (url ? " → " + url : "")
    );
    return lines.join("\n");
  }

  const Engine = {
    mulberry32, makeRng, shuffle, clamp, STATS,
    pickEncounters, findAnchor, createGame, choose, leaveEnglish, finish,
    resolveEnding, resolveAchievements, shareText, bar, buildCtx,
    runEmoji, stepEmoji, challengeLine,
    DEFAULT_TIME, parseHM, fmtHM, eventTime, clockAt, clock, timeSpan
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  if (root) root.Engine = Engine;
})(typeof window !== "undefined" ? window : null);
