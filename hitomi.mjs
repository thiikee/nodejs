const OUTPUT_DIR = './download';

import { chromium } from 'playwright';
import { load } from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';

// ブラウザ内fetchでバイナリ取得(Base64化)
async function fetchBinary(page, url) {
    return await page.evaluate(async (url) => {
        const r = await fetch(url);
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}`);
        }

        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);

        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }

        return btoa(binary);
    }, url);
}

const browser = await chromium.launch({
  headless: true
});

await fs.mkdir(OUTPUT_DIR, { recursive: true });

for (let i = 1; i <= 45; i++) {

  let url = `https://hitomi.la/reader/3013698.html#${i}`;
  console.log(`Processing: ${url}`);
  const page = await browser.newPage();

  await page.goto(url);
  await page.waitForLoadState('networkidle');

  const html = await page.content();
  const $ = load(html);

  const targetUrl = $('div#comicImages picture source').attr('srcset');

  if (!targetUrl) {
    await page.close();
    continue;
  }

  console.log(`Downloading: ${targetUrl}`);
  const base64 =
    await fetchBinary(page, targetUrl);

  const no = String(i).padStart(4, '0');
  const pathname =
    new URL(targetUrl).pathname;
  const ext =
    pathname.split('.').pop();
  const filename =
    `image${no}.${ext}`;

  await fs.writeFile(
    path.join(OUTPUT_DIR, filename),
    Buffer.from(base64, 'base64')
  );

  await page.close();
}

await browser.close();
