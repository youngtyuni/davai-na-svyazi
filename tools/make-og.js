#!/usr/bin/env node
// Рендерит tools/og.html в assets/og.png (1200×630) через Playwright: node tools/make-og.js
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const SRC = "file://" + path.resolve(__dirname, "og.html");
const OUT = path.resolve(__dirname, "..", "assets", "og.png");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(SRC);
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => null);
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log("записано", OUT);
})().catch(e => { console.error(e); process.exit(1); });
