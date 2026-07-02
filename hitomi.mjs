import { chromium } from 'playwright';
import { load } from 'cheerio';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

//const browser = await chromium.launch();
const browser = await chromium.launch({
  headless: true
});

for (let i = 1; i <= 10; i++) {
  const url = `https://hitomi.la/reader/3464737.html#${i}`;

  //console.log(`Processing: ${url}`);
  const page = await browser.newPage();

  await page.goto(url);
  await page.waitForLoadState('networkidle');

  const html = await page.content();
  const $ = load(html);

  const targetUrl = $('div#comicImages picture source').attr('srcset');

  if (!targetUrl) {
    //console.log(`No targetUrl found for #${i}`);
    await page.close();
    continue;
  }

  console.log(`Downloading: ${targetUrl}`);

  //await execFileAsync('yt-dlp', [
  //    targetUrl
  //]);

  await page.close();
}

await browser.close();
