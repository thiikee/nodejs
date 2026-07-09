const appEl = document.getElementById('app');
const titleEl = document.getElementById('page-title');
const breadcrumbEl = document.getElementById('breadcrumb');
const modal = document.getElementById('video-modal');
const modalVideo = document.getElementById('modal-video');
const modalImage = document.getElementById('modal-image');
const modalClose = document.getElementById('modal-close');
const searchInput = document.getElementById('global-search');

const PAGE_SIZE = 50;

let state = { postId: null };
let allPosts = []; // {user, postId, thumbnail, tags} の配列(初回のみ取得)
let allTags = []; // 使われている全タグ(絞り込みチップ用)
let postsLoaded = false;

let activeTagFilters = new Set();
let categoryFilter = null; // null=すべて, '実写', 'アニメ'
let likedOnlyFilter = false;
let sortOrder = 'desc'; // 'desc'=新しい順, 'asc'=古い順
let currentPage = 1;
let selectionMode = false;
let selectedIds = new Set();

let allVideos = []; // {user, postId, url, prompt} の配列(検索用、初回検索時のみ取得)
let videosLoaded = false;

searchInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) {
    showPosts();
    return;
  }
  await ensureVideosLoaded();
  renderSearchResults(q);
});

// 検索ボックスを空にした時だけは、即座に投稿一覧に戻す(こちらは軽い処理なのでリアルタイムでよい)
searchInput.addEventListener('input', (e) => {
  if (!e.target.value.trim()) {
    showPosts();
  }
});

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  modal.classList.add('hidden');
  modalVideo.pause();
  modalVideo.removeAttribute('src');
  modalVideo.load();
  modalVideo.classList.add('hidden');
  modalImage.removeAttribute('src');
  modalImage.classList.add('hidden');
}

function openModal(type, src) {
  if (type === 'video') {
    modalImage.classList.add('hidden');
    modalImage.removeAttribute('src');
    modalVideo.classList.remove('hidden');
    modalVideo.src = src;
  } else {
    modalVideo.classList.add('hidden');
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalImage.classList.remove('hidden');
    modalImage.src = src;
  }
  modal.classList.remove('hidden');
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function renderBreadcrumb() {
  const parts = ['<a href="#" data-nav="posts">投稿一覧</a>'];
  if (state.postId) {
    parts.push(`<span>${escapeHtml(state.postId)}</span>`);
  }
  breadcrumbEl.innerHTML = parts.join(' / ');
  breadcrumbEl.querySelectorAll('a[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showPosts();
    });
  });
}

function renderEmpty(message) {
  appEl.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
}

// ---- 投稿一覧(全ユーザー横断、ページング、タグ絞り込み、一括タグ付け) ----

async function showPosts() {
  state = { postId: null };
  searchInput.value = '';
  titleEl.textContent = '投稿一覧';
  renderBreadcrumb();

  if (!postsLoaded) {
    appEl.innerHTML = '<p class="empty">読み込み中...</p>';
    try {
      const [posts, tags] = await Promise.all([fetchJson('/api/posts'), fetchJson('/api/tags')]);
      allPosts = posts;
      allTags = tags;
      postsLoaded = true;
    } catch (e) {
      renderEmpty(`読み込みに失敗しました: ${e.message}`);
      return;
    }
  }
  renderPostsView();
}

function getFilteredPosts() {
  let list = allPosts;
  if (categoryFilter) {
    list = list.filter((p) => p.category === categoryFilter);
  }
  if (likedOnlyFilter) {
    list = list.filter((p) => p.liked);
  }
  if (activeTagFilters.size > 0) {
    list = list.filter((p) => {
      const tags = p.tags || [];
      for (const t of activeTagFilters) {
        if (!tags.includes(t)) return false;
      }
      return true;
    });
  }

  const sorted = [...list].sort((a, b) => {
    // createTimeが無いものは末尾に回す
    if (!a.createTime && !b.createTime) return 0;
    if (!a.createTime) return 1;
    if (!b.createTime) return -1;
    const diff = new Date(a.createTime) - new Date(b.createTime);
    return sortOrder === 'asc' ? diff : -diff;
  });
  return sorted;
}

function renderPostsView() {
  const filtered = getFilteredPosts();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pagePosts = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  appEl.innerHTML = '';

  // ---- 種別(実写/アニメ)切り替え ----
  const categoryBar = document.createElement('div');
  categoryBar.className = 'category-bar';
  const categoryOptions = [
    { value: null, label: 'すべて' },
    { value: '実写', label: '実写' },
    { value: 'アニメ', label: 'アニメ' },
  ];
  categoryBar.innerHTML =
    categoryOptions
      .map(
        (opt) =>
          `<button class="category-btn ${categoryFilter === opt.value ? 'active' : ''}" data-value="${escapeHtml(
            opt.value || ''
          )}">${escapeHtml(opt.label)}</button>`
      )
      .join('') +
    `<span class="bar-spacer"></span>` +
    `<button id="liked-only-toggle" class="category-btn like-toggle ${likedOnlyFilter ? 'active' : ''}">${
      likedOnlyFilter ? '♥' : '♡'
    } いいねのみ</button>`;
  appEl.appendChild(categoryBar);
  categoryBar.querySelectorAll('.category-btn[data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryFilter = btn.dataset.value || null;
      currentPage = 1;
      renderPostsView();
    });
  });
  categoryBar.querySelector('#liked-only-toggle').addEventListener('click', () => {
    likedOnlyFilter = !likedOnlyFilter;
    currentPage = 1;
    renderPostsView();
  });

  // ---- フィルターバー ----
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.innerHTML = `
    <div class="tag-chips">
      ${allTags
        .map(
          (t) =>
            `<button class="tag-chip ${activeTagFilters.has(t) ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
        )
        .join('')}
      ${activeTagFilters.size > 0 ? '<button class="tag-chip clear-chip" data-clear="1">✕ 絞り込み解除</button>' : ''}
    </div>
    <div class="right-controls">
      <button id="sort-toggle" class="mode-toggle">作成日: ${sortOrder === 'desc' ? '新しい順' : '古い順'}</button>
      <button id="selection-toggle" class="mode-toggle">${
        selectionMode ? '選択モードを終了' : '選択モードで一括タグ付け'
      }</button>
    </div>
  `;
  appEl.appendChild(filterBar);

  filterBar.querySelectorAll('.tag-chip[data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tag;
      if (activeTagFilters.has(t)) {
        activeTagFilters.delete(t);
      } else {
        activeTagFilters.add(t);
      }
      currentPage = 1;
      renderPostsView();
    });
  });
  const clearBtn = filterBar.querySelector('[data-clear]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      activeTagFilters.clear();
      currentPage = 1;
      renderPostsView();
    });
  }
  filterBar.querySelector('#sort-toggle').addEventListener('click', () => {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    currentPage = 1;
    renderPostsView();
  });
  filterBar.querySelector('#selection-toggle').addEventListener('click', () => {
    selectionMode = !selectionMode;
    if (!selectionMode) selectedIds.clear();
    renderPostsView();
  });

  // ---- グリッド ----
  if (pagePosts.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty';
    emptyMsg.textContent = '該当する投稿がありません。';
    appEl.appendChild(emptyMsg);
  } else {
    const grid = document.createElement('div');
    grid.className = 'grid';
    pagePosts.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'card post-card';
      const checked = selectedIds.has(p.postId) ? 'checked' : '';
      card.innerHTML = `
        ${selectionMode ? `<div class="select-overlay"><input type="checkbox" ${checked} tabindex="-1" /></div>` : ''}
        ${
          !selectionMode
            ? `<button class="like-btn ${p.liked ? 'liked' : ''}" data-post="${escapeHtml(p.postId)}" title="いいね">${
                p.liked ? '♥' : '♡'
              }</button>`
            : ''
        }
        ${
          p.thumbnail
            ? `<img src="${p.thumbnail}" loading="lazy" alt="${escapeHtml(p.postId)}" />`
            : '<div class="no-thumb">画像なし</div>'
        }
        ${
          p.category
            ? `<div class="category-badge ${p.category === 'アニメ' ? 'anime' : 'live'}">${escapeHtml(p.category)}</div>`
            : ''
        }
        ${
          p.tags && p.tags.length > 0
            ? `<div class="tag-badges">${p.tags
                .map(
                  (t) =>
                    `<span class="tag-badge">${escapeHtml(t)}<button class="tag-remove" data-remove-tag="${escapeHtml(
                      t
                    )}" data-post="${escapeHtml(p.postId)}" title="このタグを外す">×</button></span>`
                )
                .join('')}</div>`
            : ''
        }
      `;
      if (selectionMode) {
        card.classList.toggle('selected', selectedIds.has(p.postId));
        card.addEventListener('click', () => {
          if (selectedIds.has(p.postId)) {
            selectedIds.delete(p.postId);
          } else {
            selectedIds.add(p.postId);
          }
          renderPostsView();
        });
      } else {
        card.addEventListener('click', () => showMedia(p.user, p.postId));
      }
      grid.appendChild(card);
    });
    appEl.appendChild(grid);

    grid.querySelectorAll('.tag-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTagFromPost(btn.dataset.post, btn.dataset.removeTag);
      });
    });
    grid.querySelectorAll('.like-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(btn.dataset.post);
      });
    });
  }

  // ---- ページング ----
  const pager = document.createElement('div');
  pager.className = 'pager';
  pager.innerHTML = `
    <button id="prev-page" ${currentPage <= 1 ? 'disabled' : ''}>← 前へ</button>
    <span>${currentPage} / ${totalPages} ページ(${filtered.length}件)</span>
    <button id="next-page" ${currentPage >= totalPages ? 'disabled' : ''}>次へ →</button>
  `;
  pager.querySelector('#prev-page').addEventListener('click', () => {
    currentPage--;
    renderPostsView();
  });
  pager.querySelector('#next-page').addEventListener('click', () => {
    currentPage++;
    renderPostsView();
  });
  appEl.appendChild(pager);

  // ---- 選択中の一括タグ付け・種別設定バー ----
  if (selectionMode) {
    const bar = document.createElement('div');
    bar.className = 'bulk-tag-bar';
    bar.innerHTML = `
      <span>${selectedIds.size}件選択中</span>
      <input id="bulk-tag-input" list="existing-tags" placeholder="タグ名を入力してEnter(追加)" ${
        selectedIds.size === 0 ? 'disabled' : ''
      } />
      <datalist id="existing-tags">${allTags.map((t) => `<option value="${escapeHtml(t)}">`).join('')}</datalist>
      <button id="bulk-tag-apply" ${selectedIds.size === 0 ? 'disabled' : ''}>タグを追加</button>
      <button id="bulk-tag-remove" class="danger" ${selectedIds.size === 0 ? 'disabled' : ''}>タグを外す</button>
      <span class="bulk-divider"></span>
      <button id="bulk-cat-live" ${selectedIds.size === 0 ? 'disabled' : ''}>実写にする</button>
      <button id="bulk-cat-anime" ${selectedIds.size === 0 ? 'disabled' : ''}>アニメにする</button>
      <button id="bulk-cat-clear" class="danger" ${selectedIds.size === 0 ? 'disabled' : ''}>種別解除</button>
      <span class="bulk-divider"></span>
      <button id="bulk-selection-clear" ${selectedIds.size === 0 ? 'disabled' : ''}>選択解除</button>
    `;
    appEl.appendChild(bar);
    const input = bar.querySelector('#bulk-tag-input');
    bar.querySelector('#bulk-tag-apply').addEventListener('click', () => applyBulkTag(input.value, 'add'));
    bar.querySelector('#bulk-tag-remove').addEventListener('click', () => applyBulkTag(input.value, 'remove'));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyBulkTag(input.value, 'add');
    });
    bar.querySelector('#bulk-cat-live').addEventListener('click', () => applyBulkCategory('実写'));
    bar.querySelector('#bulk-cat-anime').addEventListener('click', () => applyBulkCategory('アニメ'));
    bar.querySelector('#bulk-cat-clear').addEventListener('click', () => applyBulkCategory(null));
    bar.querySelector('#bulk-selection-clear').addEventListener('click', () => {
      selectedIds.clear();
      renderPostsView();
    });
  }
}

async function toggleLike(postId) {
  let newState;
  try {
    const res = await fetchJson('/api/likes/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    });
    newState = res.liked;
  } catch (e) {
    alert(`いいねの更新に失敗しました: ${e.message}`);
    return;
  }
  const post = allPosts.find((p) => p.postId === postId);
  if (post) post.liked = newState;
  renderPostsView();
}

async function applyBulkCategory(category) {
  if (selectedIds.size === 0) return;
  const postIds = Array.from(selectedIds);

  try {
    await fetchJson('/api/categories/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIds, category }),
    });
  } catch (e) {
    alert(`種別の設定に失敗しました: ${e.message}`);
    return;
  }

  postIds.forEach((id) => {
    const post = allPosts.find((p) => p.postId === id);
    if (post) post.category = category;
  });

  selectedIds.clear();
  renderPostsView();
}

async function removeTagFromPost(postId, tag) {
  try {
    await fetchJson('/api/tags/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIds: [postId], tag, action: 'remove' }),
    });
  } catch (e) {
    alert(`タグの削除に失敗しました: ${e.message}`);
    return;
  }

  const post = allPosts.find((p) => p.postId === postId);
  if (post && post.tags) {
    post.tags = post.tags.filter((t) => t !== tag);
  }
  // 他のどの投稿にも使われていなければ、絞り込みチップからも消す
  const stillUsed = allPosts.some((p) => p.tags && p.tags.includes(tag));
  if (!stillUsed) {
    allTags = allTags.filter((t) => t !== tag);
    activeTagFilters.delete(tag);
  }
  renderPostsView();
}

async function applyBulkTag(rawTag, action) {
  const tag = (rawTag || '').trim();
  if (!tag || selectedIds.size === 0) return;
  const postIds = Array.from(selectedIds);

  try {
    await fetchJson('/api/tags/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIds, tag, action }),
    });
  } catch (e) {
    alert(`タグの${action === 'remove' ? '削除' : '追加'}に失敗しました: ${e.message}`);
    return;
  }

  // ローカルのデータにも反映(再取得せず即座に画面へ反映するため)
  postIds.forEach((id) => {
    const post = allPosts.find((p) => p.postId === id);
    if (!post) return;
    if (action === 'remove') {
      if (post.tags) post.tags = post.tags.filter((t) => t !== tag);
    } else {
      if (!post.tags) post.tags = [];
      if (!post.tags.includes(tag)) post.tags.push(tag);
    }
  });

  if (action === 'add') {
    if (!allTags.includes(tag)) {
      allTags.push(tag);
      allTags.sort();
    }
  } else {
    const stillUsed = allPosts.some((p) => p.tags && p.tags.includes(tag));
    if (!stillUsed) {
      allTags = allTags.filter((t) => t !== tag);
      activeTagFilters.delete(tag);
    }
  }

  selectedIds.clear();
  renderPostsView();
}

// ---- 投稿内メディア一覧 ----

async function showMedia(user, postId) {
  state = { postId };
  searchInput.value = '';
  titleEl.textContent = `投稿: ${postId}`;
  renderBreadcrumb();
  try {
    const data = await fetchJson(`/api/media/${encodeURIComponent(user)}/${encodeURIComponent(postId)}`);
    if (!data.items || data.items.length === 0) {
      renderEmpty('メディアが見つかりません。');
      return;
    }
    appEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid';
    data.items.forEach((it) => {
      const card = document.createElement('div');
      card.className = 'card';
      const thumbHtml =
        it.type === 'video'
          ? `<video src="${it.url}" muted preload="metadata"></video>`
          : `<img src="${it.url}" loading="lazy" alt="${escapeHtml(it.prompt)}" />`;
      card.innerHTML = `
        <div class="media-card">
          ${thumbHtml}
          <div class="caption" title="${escapeHtml(it.prompt)}">${
        escapeHtml(it.prompt) || '<span class="no-prompt">(プロンプトなし)</span>'
      }</div>
        </div>
      `;
      card.addEventListener('click', () => openModal(it.type, it.url));
      grid.appendChild(card);
    });
    appEl.appendChild(grid);
  } catch (e) {
    renderEmpty(`読み込みに失敗しました: ${e.message}`);
  }
}

// ---- プロンプト検索(投稿の階層を横断してフラットに検索) ----

async function ensureVideosLoaded() {
  if (videosLoaded) return;
  await fetchJson('/api/videos').then((data) => {
    allVideos = data;
    videosLoaded = true;
  });
}

let currentSearchQuery = '';
let searchPage = 1;

function renderSearchResults(query) {
  state = { postId: null };
  if (query !== currentSearchQuery) {
    currentSearchQuery = query;
    searchPage = 1;
  }
  titleEl.textContent = `動画検索: "${query}"`;
  breadcrumbEl.innerHTML = '<a href="#" data-nav="posts">投稿一覧</a> / <span>検索結果</span>';
  breadcrumbEl.querySelector('a[data-nav]').addEventListener('click', (e) => {
    e.preventDefault();
    showPosts();
  });

  const q = query.toLowerCase();
  const results = allVideos.filter((v) => v.prompt && v.prompt.toLowerCase().includes(q));

  appEl.innerHTML = '';
  if (results.length === 0) {
    renderEmpty(`「${query}」に一致する動画が見つかりません。`);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  if (searchPage > totalPages) searchPage = totalPages;
  if (searchPage < 1) searchPage = 1;
  const startIdx = (searchPage - 1) * PAGE_SIZE;
  const pageResults = results.slice(startIdx, startIdx + PAGE_SIZE);

  const countMsg = document.createElement('p');
  countMsg.className = 'search-count';
  countMsg.textContent = `${results.length}件ヒット(${searchPage}/${totalPages}ページ)`;
  appEl.appendChild(countMsg);

  const grid = document.createElement('div');
  grid.className = 'grid';
  pageResults.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="media-card">
        <video src="${v.url}" muted preload="metadata"></video>
        <div class="caption" title="${escapeHtml(v.prompt)}">${escapeHtml(v.prompt)}</div>
        <button class="goto-post-btn" type="button">この投稿を開く</button>
      </div>
    `;
    card.querySelector('video').addEventListener('click', (e) => {
      e.stopPropagation();
      openModal('video', v.url);
    });
    card.querySelector('.goto-post-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showMedia(v.user, v.postId);
    });
    grid.appendChild(card);
  });
  appEl.appendChild(grid);

  const pager = document.createElement('div');
  pager.className = 'pager';
  pager.innerHTML = `
    <button id="search-prev-page" ${searchPage <= 1 ? 'disabled' : ''}>← 前へ</button>
    <span>${searchPage} / ${totalPages} ページ</span>
    <button id="search-next-page" ${searchPage >= totalPages ? 'disabled' : ''}>次へ →</button>
  `;
  pager.querySelector('#search-prev-page').addEventListener('click', () => {
    searchPage--;
    renderSearchResults(currentSearchQuery);
  });
  pager.querySelector('#search-next-page').addEventListener('click', () => {
    searchPage++;
    renderSearchResults(currentSearchQuery);
  });
  appEl.appendChild(pager);
}

showPosts();
