/**
 * Grok Imagine 一括ダウンローダー (UIクリック方式 / 既存Chrome接続版)
 * ---------------------------------------------------------------
 * mediaUrlへの直接アクセスやDOM要素の注入では、CDN側が「正規のダウンロード
 * 操作ではない」と判断してサンプル/ダミーのコンテンツを返してしまうため、
 * 実際に画面上の「ダウンロード」ボタンをクリックして、ブラウザの正規の
 * ダウンロード処理をそのまま捕まえる方式にしています。
 *
 * また、Cookieのエクスポート/インポート方式ではセッションが正しく認識されない
 * 問題が起きたため、普段使いのChromeにPlaywrightが直接接続する方式にしています。
 *
 * 事前準備:
 *   npm init -y
 *   npm install playwright
 *
 *   1. Chromeを完全に終了する(全ウィンドウを閉じる)
 *   2. リモートデバッグポートを指定してChromeを起動する
 *        Windows: "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
 *        Mac:     /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *        Linux:   google-chrome --remote-debugging-port=9222 &
 *   3. そのChromeで https://grok.com/imagine/saved を開き、手動でログインして
 *      サムネイルが正しく表示されることを確認する
 *
 * 実行:
 *   node grok-imagine-downloader.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CDP_ENDPOINT = 'http://localhost:9222';
const OUTPUT_DIR = path.join(__dirname, 'downloads');
const STATE_FILE = (id) => path.join(OUTPUT_DIR, `state_contents_${id}.json`); // 進捗保存（再開用）
const STATE_FILE_POST = (id) => path.join(OUTPUT_DIR, `state_posts_${id}.json`); // 進捗保存（再開用）
const DOWNLOAD_BUTTON_TEXTS = ['Download', 'ダウンロード'];

// ---- ユーティリティ ----

function loadState(id) {
  if (fs.existsSync(STATE_FILE(id))) {
    return JSON.parse(fs.readFileSync(STATE_FILE(id), 'utf-8'));
  }
  return { done: {} };
}

function saveState(state, id) {
  fs.writeFileSync(STATE_FILE(id), JSON.stringify(state, null, 2));
}

function loadStatePost(id) {
  if (fs.existsSync(STATE_FILE_POST(id))) {
    return JSON.parse(fs.readFileSync(STATE_FILE_POST(id), 'utf-8'));
  }
  return { done: {} };
}

function saveStatePost(state, id) {
  fs.writeFileSync(STATE_FILE_POST(id), JSON.stringify(state, null, 2));
}

function extFromMime(mimeType, fallback) {
  if (!mimeType) return fallback;
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
  };
  return map[mimeType] || fallback;
}

/**
 * サムネイル画像のsrc属性に指定IDが含まれる要素を探してクリックする。
 * 見つからない場合は「既にそのメディアが表示されている」とみなして
 * 何もせず false を返す（呼び出し側は無視して進めてよい）。
 */
async function trySelectMediaByIdPosts(page, id) {
  return trySelectMediaById(page, id, `img[src*="${id}"]`);
}

async function trySelectMediaByIdPost(page, id) {
  return trySelectMediaById(page, id, `img[src*="${id}"][alt^="Thumbnail"]`);
}

async function trySelectMediaById(page, id, locator) {
  const locatorAll = page.locator(locator);
  //const count = await locatorAll.count();
  //if (count > 1) {
  //  console.log(`    [debug] id=${id} に一致する要素が${count}件あります`);
  //  for (let i = 0; i < count; i++) {
  //    const html = await locatorAll.nth(i).evaluate((el) => el.outerHTML);
  //    console.log(`    [debug] [${i}] ${html}`);
  //  }
  //}

  try {
    await locatorAll.first().waitFor({
      state: 'attached',
      timeout: 15000,
    });
    await locatorAll.first().waitFor({
      state: 'visible',
      timeout: 15000,
    });
    await locatorAll.first().click();
    await page.waitForTimeout(1800);
    return true;
  } catch (e) {
    //console.error(`サムネイルが見つかりませんでした。${e}`);
    //process.exit(1);
  }
}

/**
 * 画面上の「ダウンロード」ボタンをクリックし、OUTPUT_DIR に新しいファイルが
 * 出現するのを直接監視して、指定した名前にリネームする。
 *
 * (CDP接続の既存ブラウザではPlaywrightの'download'イベントが発火しない
 * ことがあるため、Page.setDownloadBehaviorでダウンロード先をOUTPUT_DIRに
 * 固定した上で、ファイルシステムを直接監視する方式にしている)
 */
async function findDownloadButton(page) {
  for (const text of DOWNLOAD_BUTTON_TEXTS) {
    const loc = page.getByText(text, { exact: true });
    try {
      await loc.first().waitFor({
        state: 'visible',
        timeout: 10000
      });
      return { locator: loc.first(), matchedText: text, count: loc.count() };
    } catch (e) {
      //console.error(`ダウンロードボタンが見つかりませんでした。${e}`);
      //process.exit(1);
    }
  }
  return null;
}

async function clickDownloadAndSave(page, outPath, debugLabel) {
  const found = await findDownloadButton(page);

  // ---- 診断情報 ----
  //if (found) {
    //console.log(`    [debug] ダウンロードボタン発見: "${found.matchedText}"`);
    //const visible = await found.locator.isVisible().catch(() => 'N/A');
    //const enabled = await found.locator.isEnabled().catch(() => 'N/A');
    //const box = await found.locator.boundingBox().catch(() => null);
    //console.log(`    [debug] visible=${visible}, enabled=${enabled}, box=${JSON.stringify(box)}`);
  //} else {
    //console.log(`    [debug] ダウンロードボタンが見つかりませんでした`);
  //}
  //const debugShotPath = path.join(__dirname, `debug-${debugLabel}.png`);
  //await page.screenshot({ path: debugShotPath }).catch((e) => {
  //  console.log(`    [debug] スクリーンショット失敗: ${e.message}`);
  //});
  //console.log(`    [debug] スクリーンショット保存: ${debugShotPath}`);
  // ---- 診断情報ここまで ----

  if (!found) {
    //throw new Error('ダウンロードボタンが見つかりませんでした');
    console.log(`    [debug] ダウンロードボタンが見つかりませんでした`);
    process.exit(1);
  }

  const before = new Set(fs.readdirSync(OUTPUT_DIR));

  await found.locator.click();

  const deadline = Date.now() + 15000;
  let newFileName = null;
  while (Date.now() < deadline) {
    const current = fs.readdirSync(OUTPUT_DIR);
    const diff = current.filter((f) => !before.has(f) && !f.endsWith('.crdownload'));
    if (diff.length > 0) {
      newFileName = diff[0];
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!newFileName) {
    throw new Error('ダウンロードされたファイルが見つかりませんでした(タイムアウト)');
  }

  const newFilePath = path.join(OUTPUT_DIR, newFileName);

  let lastSize = -1;
  for (let i = 0; i < 20; i++) {
    const stat = fs.statSync(newFilePath);
    if (stat.size > 0 && stat.size === lastSize) break;
    lastSize = stat.size;
    await new Promise((r) => setTimeout(r, 300));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.renameSync(newFilePath, outPath);
}

async function waitForThumbnail(page, id, alt) {
    const altloc = alt ? '[alt^="Thumbnail"]' : '';
    const locator = page.locator(`img[src*="${id}"]${altloc}`);

    await locator.first().waitFor({
        state: 'attached',
        timeout: 15000,
    });

    await locator.first().waitFor({
        state: 'visible',
        timeout: 15000,
    });

    return locator.first();
}

// ---- メイン処理 ----

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  } catch (e) {
    console.error(
      `${CDP_ENDPOINT} に接続できませんでした。\n` +
        'Chromeを完全に終了してから、--remote-debugging-port=9222 を付けて起動し、\n' +
        'grok.com にログインした状態にしてから再実行してください。'
    );
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('接続はできましたが、開いているブラウザウィンドウがありません。');
    process.exit(1);
  }
  const context = contexts[0];

  // grok.com が開いているタブを探す。なければ新しいタブを開く。
  let page = context.pages().find((p) => p.url().includes('grok.com'));
  if (!page) {
    page = await context.newPage();
  }
  page.setDefaultTimeout(20000);

  // Playwrightが自分で起動したブラウザではないため、ダウンロードの自動検知が
  // 効かないことがある。CDPで明示的にダウンロード先を指定しておく。
  const cdpClient = await context.newCDPSession(page);
  await cdpClient.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: OUTPUT_DIR,
  });

  await page.goto('https://grok.com/imagine/saved', { waitUntil: 'domcontentloaded' });

  const blocked = await page.locator('text=Sorry you have been blocked').count();
  if (blocked > 0) {
    console.error('Cloudflareにブロックされました。手動でログイン状態を確認してください。');
    process.exit(1);
  }

  // ---- STEP 1: 自分の投稿一覧を取得 ----
  // 自前でfetchを組み立てると、実際のアプリのリクエストと何かが異なるらしく
  // 別セッション(誤ったuserId)として扱われてしまう問題が起きたため、
  // アプリ自身が発行する /rest/media/post/list への通信を横取りする方式にする。
  console.log('投稿一覧を取得中...');

  const collectedPosts = new Map(); // id -> post object
  let myUserId = null;

  const onResponse = async (response) => {
    if (response.request().method() !== 'POST') return;
    if (!response.url().includes('/rest/media/post/list')) return;
    try {
      const json = await response.json();
      if (json && Array.isArray(json.posts)) {
        for (const p of json.posts) {
          collectedPosts.set(p.id, p);
          if (!myUserId) myUserId = p.userId;
        }
        console.log(`  受信: +${json.posts.length}件 (累計${collectedPosts.size}件)`);
      }
    } catch (e) {
      console.error(e);
      // JSONでない/読み取れないレスポンスは無視
    }
  };

  page.on('response', onResponse);

  // ページを開き直して最初のリクエストを発生させる
  await page.goto('https://grok.com/imagine/saved', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 無限スクロールで追加ページがある場合に備えて、少しスクロールしてみる
  await page.mouse.move(640, 400);
  let stableCount = 0;
  let lastSize = collectedPosts.size;
  for (let i = 0; i < 40 && stableCount < 4; i++) {
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(1000);
    if (collectedPosts.size === lastSize) {
      stableCount++;
    } else {
      stableCount = 0;
      lastSize = collectedPosts.size;
    }
  }

  page.off('response', onResponse);

  if (myUserId) {
    console.log(`自分のuserId: ${myUserId}`);
  }

  const state = loadState(myUserId);
  const statePost = loadStatePost(myUserId);

  const topPosts = Array.from(collectedPosts.values()).filter(
    (p) => !myUserId || p.userId === myUserId
  );
  
  if (topPosts.length === 0) {
    console.error('投稿が見つかりませんでした。再実行してください。');
    process.exit(1);
  } else {
    console.log(`合計 ${topPosts.length} 件の投稿が見つかりました。`);
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `posts_${myUserId}.json`),
    JSON.stringify(topPosts, null, 2),
    'utf8'
  );

  // ---- STEP 2: 各投稿をUIクリックでダウンロード ----
  for (const [index, topPost] of topPosts.entries()) {
    if (statePost.done[topPost.id]) {
      console.log(`  スキップ(投稿取得済み): ${topPost.id}`);
      continue;
    }

    console.log(`\n[${index + 1}/${topPosts.length}] 投稿を開く: ${topPost.id}`);

    // 毎回 /imagine/saved に戻ってから開く(状態をリセットして確実にする)
    /*
    await page.goto('https://grok.com/imagine/saved', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let openedId = null;
    const candidateIds = [topPost.id, ...(topPost.videos || []).map((v) => v.id)];
    for (const cid of candidateIds) {
      if (await trySelectMediaByIdPosts(page, cid)) {
        openedId = cid;
        break;
      }
    }
    if (!openedId) {
      console.error(`  サムネイルが見つからずスキップしました: ${topPost.id}`);
      continue;
    }*/
    await page.goto(`https://grok.com/imagine/post/${topPost.id}`, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForTimeout(1000);

    // ダウンロード対象: 派生動画すべて → 元の画像は最後
    // (投稿を開いた直後、画面には自動的にchildPosts=videos配列の先頭が
    // 表示されるため、それに合わせた順番にする)
    const imageExt = extFromMime(topPost.mimeType, 'jpg');
    const subItems = [];
    for (const v of topPost.videos || []) {
      subItems.push({ id: v.id, ext: extFromMime(v.mimeType, 'mp4') });
    }
    subItems.push({ id: topPost.id, ext: imageExt });

    // 開いた直後のデフォルト表示は、グリッドでどのサムネイルをクリックしたかに
    // 関わらず、videos配列の先頭(childPostsの一番上)になっている
    let currentDisplayedId =
      topPost.videos && topPost.videos.length > 0 ? topPost.videos[0].id : topPost.id;

    let seqno = subItems.length - 1;
    for (const sub of subItems) {
      if (state.done[sub.id]) {
        console.log(`  スキップ(動画・画像取得済み): ${sub.id}`);
        continue;
      }

      // 「今実際に表示されているID」と違う場合だけ切り替える。
      //console.log(`  sub.id: ${sub.id}`);
      //console.log(`  currentDisplayedId: ${currentDisplayedId}`);
      //if (sub.id !== currentDisplayedId) {
      if (topPost.childPosts.length > 0) {
        await trySelectMediaByIdPost(page, sub.id);
        await page.waitForFunction(
          (id) =>
            document.querySelector(`img[src*="${id}"]`) !== null,
          sub.id,
          { timeout: 10000 }
        );
        currentDisplayedId = sub.id;
      }

      const outPath = path.join(OUTPUT_DIR, myUserId, topPost.id, `${String(seqno).padStart(3, '0')}_${sub.id}.${sub.ext}`);
      try {
        await clickDownloadAndSave(page, outPath, sub.id);
        state.done[sub.id] = true;
        saveState(state, myUserId);
        console.log(`  保存しました: ${outPath}`);
        seqno--;
      } catch (e) {
        console.error(`  失敗 ${sub.id}: ${e.message}`);
        process.exit(1);
      }

      await page.waitForTimeout(1000); // サーバー/UI負荷軽減
    }
    
    statePost.done[topPost.id] = true;
    saveStatePost(statePost, myUserId);
  }

  console.log('\n完了しました。');
  process.exit(0);
  // 実際に使っているChromeなので閉じない（browser.close()すると
  // ブラウザ自体が終了してしまうため呼ばない）
})();
