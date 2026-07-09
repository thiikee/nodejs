/**
 * Grok Imagine 閲覧用ローカルWebアプリ サーバー
 * -------------------------------------------
 * 依存パッケージなし(Node.js標準モジュールのみ)。localhostのみでlisten。
 *
 * 想定するディレクトリ構造:
 *   content/
 *     <ユーザー名>/
 *       <投稿ID>/
 *         xxxx.jpg   (投稿本体の画像。サムネイルとして使う)
 *         yyyy.mp4   (派生動画。複数可)
 *         zzzz.mp4
 *
 * 実行:
 *   node server.js
 *   ブラウザで http://localhost:3000 を開く
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const HOST = 'localhost'; // 外部からアクセスできないようlocalhost限定
const CONTENT_DIR = path.join(__dirname, 'content');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function sendJson(res, data) {
  send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8');
}

/**
 * パストラバーサル対策: 結合後のパスが必ずbase配下に収まっていることを確認する。
 * 収まっていなければ null を返す。
 */
function safeJoin(base, ...parts) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, ...parts);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolved;
}

function listDirs(dirPath) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (e) {
    return [];
  }
}

function listFiles(dirPath, exts) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isFile() && exts.includes(path.extname(d.name).toLowerCase()))
      .map((d) => d.name)
      .sort();
  } catch (e) {
    return [];
  }
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * ファイル名からUUID形式のID部分を取り出す。
 * "id.mp4" 形式でも "001_id.mp4" のような連番プレフィックス付きでも対応する。
 * UUIDが見つからない場合は拡張子を除いたファイル名をそのまま返す。
 */
function idFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const m = base.match(UUID_RE);
  return m ? m[0] : base;
}

/**
 * content/<user>/posts.json を読み込み、投稿本体(トップレベルのみ)の
 * id -> createTime のマップを作る。ファイルが無い/壊れている場合は空のMapを返す。
 */
function loadCreateTimeMap(user) {
  const map = new Map();
  const jsonPath = safeJoin(CONTENT_DIR, user, 'posts.json');
  if (!jsonPath) return map;

  let posts;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    posts = JSON.parse(raw);
  } catch (e) {
    return map;
  }
  if (!Array.isArray(posts)) return map;

  for (const p of posts) {
    if (p && p.id && p.createTime) {
      map.set(p.id, p.createTime);
    }
  }
  return map;
}

/**
 * content/<user>/posts.json を読み込み、id -> prompt のマップを作る。
 * 投稿本体とchildPosts(何階層でも)を再帰的にたどる。
 * ファイルが無い/壊れている場合は空のMapを返す。
 */
function loadPromptMap(user) {
  const map = new Map();
  const jsonPath = safeJoin(CONTENT_DIR, user, 'posts.json');
  if (!jsonPath) return map;

  let posts;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    posts = JSON.parse(raw);
  } catch (e) {
    return map; // ファイルが無い、またはJSONとして壊れている
  }
  if (!Array.isArray(posts)) return map;

  function walk(list) {
    for (const p of list) {
      if (p && p.id) {
        const prompt = p.prompt || p.originalPrompt || '';
        if (prompt) map.set(p.id, prompt);
      }
      if (p && Array.isArray(p.childPosts) && p.childPosts.length > 0) {
        walk(p.childPosts);
      }
    }
  }
  walk(posts);
  return map;
}

const TAGS_FILE = path.join(CONTENT_DIR, 'tags.json');

/**
 * content/tags.json を読み込む。 { "投稿id": ["タグ1", "タグ2"] } という形。
 * ファイルが無い/壊れている場合は空オブジェクトを返す。
 */
function loadTags() {
  try {
    const raw = fs.readFileSync(TAGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveTags(tags) {
  fs.writeFileSync(TAGS_FILE, JSON.stringify(tags, null, 2), 'utf-8');
}

const CATEGORIES_FILE = path.join(CONTENT_DIR, 'categories.json');
const VALID_CATEGORIES = ['実写', 'アニメ'];

/**
 * content/categories.json を読み込む。 { "投稿id": "実写" | "アニメ" } という形。
 * ファイルが無い/壊れている場合は空オブジェクトを返す。
 */
function loadCategories() {
  try {
    const raw = fs.readFileSync(CATEGORIES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveCategories(categories) {
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf-8');
}

/**
 * 既存のtags.jsonに「実写」「アニメ」というタグが付いている投稿があれば、
 * categories.jsonへ移行し、タグ側からは取り除く。
 * categories.jsonがまだ存在しない場合のみ、起動時に一度だけ実行する。
 */
function migrateCategoryTagsIfNeeded() {
  if (fs.existsSync(CATEGORIES_FILE)) return; // 既に移行済み(または運用中)

  const tags = loadTags();
  const categories = {};
  let tagsChanged = false;

  for (const [postId, tagList] of Object.entries(tags)) {
    if (!Array.isArray(tagList)) continue;
    const found = tagList.find((t) => VALID_CATEGORIES.includes(t));
    if (found) {
      categories[postId] = found;
      tags[postId] = tagList.filter((t) => !VALID_CATEGORIES.includes(t));
      if (tags[postId].length === 0) delete tags[postId];
      tagsChanged = true;
    }
  }

  if (tagsChanged) {
    saveTags(tags);
    console.log('タグ「実写」「アニメ」を種別(category)へ移行しました。');
  }
  saveCategories(categories); // 空でも作成しておく(以後、この移行処理を再実行しないため)
}

const LIKES_FILE = path.join(CONTENT_DIR, 'likes.json');

/**
 * content/likes.json を読み込む。 { "投稿id": true } という形。
 * ファイルが無い/壊れている場合は空オブジェクトを返す。
 */
function loadLikes() {
  try {
    const raw = fs.readFileSync(LIKES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveLikes(likes) {
  fs.writeFileSync(LIKES_FILE, JSON.stringify(likes, null, 2), 'utf-8');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request');
  }

  // ---- API: ユーザー一覧 ----
  if (pathname === '/api/users') {
    return sendJson(res, listDirs(CONTENT_DIR));
  }

  // ---- API: 全ユーザー・全投稿の動画をフラットに(プロンプト検索用) ----
  if (pathname === '/api/videos' && req.method === 'GET') {
    const users = listDirs(CONTENT_DIR);
    const results = [];
    for (const user of users) {
      const userDir = path.join(CONTENT_DIR, user);
      const promptMap = loadPromptMap(user);
      const postIds = listDirs(userDir);
      for (const postId of postIds) {
        const postDir = path.join(userDir, postId);
        const videoFiles = listFiles(postDir, ['.mp4']);
        const base = `/content/${encodeURIComponent(user)}/${encodeURIComponent(postId)}/`;
        for (const f of videoFiles) {
          results.push({
            user,
            postId,
            url: base + encodeURIComponent(f),
            prompt: promptMap.get(idFromFilename(f)) || '',
          });
        }
      }
    }
    return sendJson(res, results);
  }

  // ---- API: 全ユーザー横断の投稿一覧(タグ・種別・いいね付き) ----
  if (pathname === '/api/posts' && req.method === 'GET') {
    const tags = loadTags();
    const categories = loadCategories();
    const likes = loadLikes();
    const users = listDirs(CONTENT_DIR);
    const allPosts = [];
    for (const user of users) {
      const userDir = path.join(CONTENT_DIR, user);
      const postIds = listDirs(userDir);
      const createTimeMap = loadCreateTimeMap(user);
      for (const postId of postIds) {
        const postDir = path.join(userDir, postId);
        const jpgs = listFiles(postDir, ['.jpg', '.jpeg', '.png']);
        const thumbnail =
          jpgs.length > 0
            ? `/content/${encodeURIComponent(user)}/${encodeURIComponent(postId)}/${encodeURIComponent(jpgs[0])}`
            : null;
        allPosts.push({
          user,
          postId,
          thumbnail,
          tags: tags[postId] || [],
          category: categories[postId] || null,
          liked: likes[postId] === true,
          createTime: createTimeMap.get(postId) || null,
        });
      }
    }
    return sendJson(res, allPosts);
  }

  // ---- API: いいねのトグル ----
  if (pathname === '/api/likes/toggle' && req.method === 'POST') {
    readRequestBody(req)
      .then((body) => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          return send(res, 400, 'Invalid JSON');
        }
        const { postId } = parsed || {};
        if (!postId) return send(res, 400, 'Invalid params');

        const likes = loadLikes();
        const newState = !likes[postId];
        if (newState) {
          likes[postId] = true;
        } else {
          delete likes[postId];
        }
        saveLikes(likes);
        return sendJson(res, { liked: newState });
      })
      .catch((e) => send(res, 400, `Error: ${e.message}`));
    return;
  }

  // ---- API: 複数投稿への種別(実写/アニメ)一括設定 ----
  if (pathname === '/api/categories/bulk' && req.method === 'POST') {
    readRequestBody(req)
      .then((body) => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          return send(res, 400, 'Invalid JSON');
        }
        const { postIds, category } = parsed || {};
        if (!Array.isArray(postIds) || postIds.length === 0) {
          return send(res, 400, 'Invalid params');
        }
        if (category !== null && !VALID_CATEGORIES.includes(category)) {
          return send(res, 400, 'Invalid category');
        }
        const categories = loadCategories();
        for (const id of postIds) {
          if (category === null) {
            delete categories[id];
          } else {
            categories[id] = category;
          }
        }
        saveCategories(categories);
        return sendJson(res, { ok: true });
      })
      .catch((e) => send(res, 400, `Error: ${e.message}`));
    return;
  }

  // ---- API: 使われている全タグ(絞り込みチップ用) ----
  if (pathname === '/api/tags' && req.method === 'GET') {
    const tags = loadTags();
    const set = new Set();
    Object.values(tags).forEach((arr) => {
      if (Array.isArray(arr)) arr.forEach((t) => set.add(t));
    });
    return sendJson(res, Array.from(set).sort());
  }

  // ---- API: 複数投稿へのタグ一括追加/削除 ----
  if (pathname === '/api/tags/bulk' && req.method === 'POST') {
    readRequestBody(req)
      .then((body) => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          return send(res, 400, 'Invalid JSON');
        }
        const { postIds, tag, action } = parsed || {};
        if (!Array.isArray(postIds) || postIds.length === 0 || !tag || !['add', 'remove'].includes(action)) {
          return send(res, 400, 'Invalid params');
        }
        const tags = loadTags();
        for (const id of postIds) {
          if (action === 'add') {
            if (!tags[id]) tags[id] = [];
            if (!tags[id].includes(tag)) tags[id].push(tag);
          } else {
            if (tags[id]) {
              tags[id] = tags[id].filter((t) => t !== tag);
              if (tags[id].length === 0) delete tags[id];
            }
          }
        }
        saveTags(tags);
        return sendJson(res, { ok: true });
      })
      .catch((e) => send(res, 400, `Error: ${e.message}`));
    return;
  }

  // ---- API: 指定ユーザーの投稿一覧(各投稿のサムネイル付き) ----
  let m = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (m) {
    const user = m[1];
    const userDir = safeJoin(CONTENT_DIR, user);
    if (!userDir) return send(res, 400, 'Invalid user');

    const postIds = listDirs(userDir);
    const posts = postIds.map((postId) => {
      const postDir = path.join(userDir, postId);
      const jpgs = listFiles(postDir, ['.jpg', '.jpeg', '.png']);
      const thumbnail =
        jpgs.length > 0
          ? `/content/${encodeURIComponent(user)}/${encodeURIComponent(postId)}/${encodeURIComponent(jpgs[0])}`
          : null;
      return { postId, thumbnail };
    });
    return sendJson(res, posts);
  }

  // ---- API: 指定投稿内のメディア一覧(画像・動画をまとめて、ファイル名順) ----
  m = pathname.match(/^\/api\/media\/([^/]+)\/([^/]+)$/);
  if (m) {
    const user = m[1];
    const postId = m[2];
    const postDir = safeJoin(CONTENT_DIR, user, postId);
    if (!postDir) return send(res, 400, 'Invalid path');

    const files = listFiles(postDir, ['.mp4', '.jpg', '.jpeg', '.png']);
    const base = `/content/${encodeURIComponent(user)}/${encodeURIComponent(postId)}/`;
    const promptMap = loadPromptMap(user);

    const items = files.map((f) => {
      const ext = path.extname(f).toLowerCase();
      const type = ext === '.mp4' ? 'video' : 'image';
      return {
        type,
        url: base + encodeURIComponent(f),
        prompt: promptMap.get(idFromFilename(f)) || '',
      };
    });

    return sendJson(res, { items });
  }

  // ---- 実ファイル配信 (content配下) ----
  if (pathname.startsWith('/content/')) {
    const rel = pathname.slice('/content/'.length);
    const filePath = safeJoin(CONTENT_DIR, ...rel.split('/'));
    if (!filePath) return send(res, 400, 'Invalid path');
    return serveStaticFile(res, filePath);
  }

  // ---- 静的ファイル配信 (public配下、フロントエンド本体) ----
  const reqPath = pathname === '/' ? '/index.html' : pathname;
  const staticPath = safeJoin(PUBLIC_DIR, ...reqPath.split('/'));
  if (!staticPath) return send(res, 400, 'Invalid path');
  serveStaticFile(res, staticPath);
});

migrateCategoryTagsIfNeeded();

server.listen(PORT, HOST, () => {
  console.log(`http://${HOST}:${PORT} で起動しました`);
  console.log(`コンテンツフォルダ: ${CONTENT_DIR}`);
});
