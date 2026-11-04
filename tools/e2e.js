#!/usr/bin/env node
// E2E в Playwright: полный забег кликами, скриншоты экранов, 0 ошибок консоли.
// node tools/e2e.js [--shots <dir>] [--suffix -v2] [--role <n>] [--event <n>]
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const SHOTS = argOf("--shots", path.join(require("os").tmpdir(), "dns-shots"));
const SUFFIX = argOf("--suffix", "");
const ROLE_INDEX = parseInt(argOf("--role", "0"), 10);
const EVENT_INDEX = parseInt(argOf("--event", "0"), 10);
const URL = "file://" + path.resolve(__dirname, "..", "index.html");

fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  const shot = async name => {
    await page.waitForTimeout(600); // даём доиграть анимации появления
    const file = path.join(SHOTS, name + SUFFIX + ".png");
    await page.screenshot({ path: file, fullPage: true });
    console.log("скриншот", file);
  };
  const screen = () => page.locator("[data-screen]").getAttribute("data-screen");

  await page.goto(URL);
  await page.waitForSelector(".screen--start");
  await shot("start");

  await page.getByRole("button", { name: "Пойти на ивент" }).click();
  await page.waitForSelector(".screen--role");
  await shot("role");
  await page.locator(".card--role").nth(ROLE_INDEX).click();

  await page.waitForSelector(".screen--event");
  await shot("event");
  await page.locator(".card--event").nth(EVENT_INDEX).click();

  await page.waitForSelector(".screen--intro");
  await shot("intro");
  await page.getByRole("button", { name: "Зайти" }).click();

  // проходим все встречи: вариант по кругу, потом «Дальше»
  let step = 0;
  let shotEncounter = false, shotOutcome = false;
  while (true) {
    const name = await screen();
    if (name === "ending") break;
    if (name !== "encounter") throw new Error("Неожиданный экран: " + name);
    if (!shotEncounter) { await shot("encounter"); shotEncounter = true; }
    const options = page.locator(".btn--option");
    const n = await options.count();
    if (n < 2 || n > 4) errors.push(`вариантов ${n} на шаге ${step}`);
    await options.nth(step % n).click();
    await page.waitForSelector(".screen--outcome");
    if (!shotOutcome) { await shot("outcome"); shotOutcome = true; }
    await page.getByRole("button", { name: "Дальше" }).click();
    step++;
    if (step > 50) throw new Error("Забег не заканчивается");
  }

  await page.waitForSelector(".screen--ending");
  // ждём отрисовку шер-карточки
  await page.evaluate(() => window.UI.app.shareReady);
  await page.waitForTimeout(300);
  await shot("ending");

  const dataUrl = await page.evaluate(() => document.querySelector(".share-canvas").toDataURL());
  const canvasLen = dataUrl.length;
  if (canvasLen <= 10000) errors.push("canvas шер-карточки пустой: " + canvasLen);
  // сохраняем саму карточку как PNG
  const cardFile = path.join(SHOTS, "card" + SUFFIX + ".png");
  fs.writeFileSync(cardFile, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("карточка", cardFile);

  // экран «Все финалы» и возврат
  await page.getByRole("button", { name: "Все финалы" }).click();
  await page.waitForSelector(".screen--endings");
  await shot("endings");
  const cells = await page.locator(".ending-cell").count();
  if (cells !== 11) errors.push("на экране финалов " + cells + " ячеек вместо 11");
  await page.getByRole("button", { name: "Назад" }).click();
  await page.waitForSelector(".screen--ending");
  const title = await page.locator(".ending__title").textContent();
  const progress = await page.evaluate(() => { try { return localStorage.getItem("dns_progress"); } catch (e) { return null; } });

  console.log(`\nвстреч пройдено: ${step}, финал: «${title}», canvas: ${canvasLen} байт, localStorage: ${progress}`);
  console.log("ошибок консоли:", errors.length);
  errors.forEach(e => console.log("  - " + e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
