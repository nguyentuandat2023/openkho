#!/usr/bin/env node
// Chụp ảnh màn hình để xem nhanh giao diện: node scripts/e2e/shot.mjs <url> <file.png> [--w 1366] [--h 900] [--theme dark|light] [--full]
import { chromium } from 'playwright-core';
import { argv } from '../lib/config.mjs';
import { findBrowser } from './browser.mjs';

const [url, out] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a) && !['dark', 'light'].includes(a));
const w = Number(argv('w', 1366));
const h = Number(argv('h', 900));
const theme = argv('theme', 'dark');
const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme === 'light' ? 'light' : 'dark', locale: 'vi-VN' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: Boolean(argv('full')) });
await browser.close();
console.log('saved', out);
