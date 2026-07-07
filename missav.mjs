//const VIDEO_PAGE = 'https://missav.live/ja/kbkd-851'; // 動画ページ
const VIDEO_PAGE = process.argv[2];
//const m3u8url = 'https://surrit.com/abf0067a-fb26-4a63-816d-035fd594652f/842x480/video.m3u8';
//const jpgurl = 'https://surrit.com/abf0067a-fb26-4a63-816d-035fd594652f/842x480/video0.jpeg';
const OUTPUT_DIR = './download';
const HEADLESS = false; // trueだとダウンロードが進まない

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

// m3u8のURLを取得する
async function getM3u8Url(page) {
    return new Promise((resolve) => {
        page.on('request', (req) => {
            const url = req.url();
            if (url.endsWith('/video.m3u8')) {
                console.log('Found target:', url);
                resolve(url);
            }
        });
    });
}

// ブラウザ内fetchでテキスト取得
async function fetchText(page, url) {
    return await page.evaluate(async (url) => {
        const r = await fetch(url);
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}`);
        }
        return await r.text();
    }, url);
}

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

async function retry(fn, count = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < count; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            console.log(`retry ${i+1}/${count} failed: ${e.message}`);
            if (i < count - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

if (!VIDEO_PAGE) {
    console.error(
        'Usage: node missav.mjs <video_page_url>'
    );
    process.exit(1);
}

(async () => {
    const browser = await chromium.launch({
        headless: HEADLESS
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Opening page...');
    const m3u8Promise = getM3u8Url(page);

    await page.goto(VIDEO_PAGE);

    //console.log('動画を再生してください');
    const m3u8Url = await m3u8Promise;

    console.log('Downloading m3u8...');
    const m3u8 = await fetchText(page, m3u8Url);

    const segmentNames = m3u8
        .split('\n')
        .map(v => v.trim())
        .filter(v => v.startsWith('video') && v.endsWith('.jpeg'));

    console.log(`Found ${segmentNames.length} segments`);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    //const baseUrl =
    //    m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    for (let i = 0; i < segmentNames.length; i++) {
    //for (let i = 0; i < 10; i++) {
        const segment = segmentNames[i];

        try {
	    const segmentUrl = new URL(segment, m3u8Url).href;
            console.log(segmentUrl);

            const base64 = await retry(
		() => fetchBinary(page, segmentUrl)
	    );

            await fs.writeFile(
                path.join(
                    OUTPUT_DIR,
                    `${String(i).padStart(5, '0')}.ts`
                ),
                Buffer.from(base64, 'base64')
            );

            // ちょっと待つ
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        } catch (e) {
            console.error(`Failed: ${segment}`, e);
        }
    }

    await browser.close();

    let list = '';
    for (let i = 0; i < segmentNames.length; i++) {
        list += `file '${String(i).padStart(5, '0')}.ts'\n`;
    }
    await fs.writeFile(path.join(OUTPUT_DIR, 'list.txt'), list);

    console.log('Done');

})();
