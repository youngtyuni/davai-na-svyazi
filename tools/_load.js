// Общий загрузчик для Node-инструментов: исполняет js/data.js и content/events/*.js
// через vm с подставленным window, как это делает браузер.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const EVENTS_DIR = path.join(ROOT, "content", "events");

function runInWindow(file, win) {
  const code = fs.readFileSync(file, "utf8");
  const ctx = vm.createContext({ window: win, console });
  vm.runInContext(code, ctx, { filename: file });
}

// prod=true — пропускаем файлы, начинающиеся с "_" (тестовый контент)
function loadAll(opts) {
  opts = opts || {};
  const win = {};
  runInWindow(path.join(ROOT, "js", "data.js"), win);

  const files = fs.readdirSync(EVENTS_DIR)
    .filter(f => f.endsWith(".js"))
    .filter(f => !(opts.prod && f.startsWith("_")))
    .sort();

  const eventFiles = {}; // id ивента → имя файла
  files.forEach(f => {
    const before = (win.GAME_CONTENT && win.GAME_CONTENT.events.length) || 0;
    runInWindow(path.join(EVENTS_DIR, f), win);
    const after = win.GAME_CONTENT.events.length;
    for (let i = before; i < after; i++) eventFiles[win.GAME_CONTENT.events[i].id] = f;
  });

  return {
    data: win.GAME_DATA,
    content: win.GAME_CONTENT || { events: [] },
    files,
    eventFiles
  };
}

module.exports = { loadAll, ROOT };
