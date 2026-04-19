const grid = document.getElementById('cards-grid');
const statusText = document.getElementById('status-text');
const countText = document.getElementById('count-text');
const loadingIndicator = document.getElementById('loading-indicator');
const loadingText = document.getElementById('loading-text');
const loadingProgress = document.getElementById('loading-progress');
const loadingProgressBar = document.getElementById('loading-progress-bar');
const emptyState = document.getElementById('empty-state');
const sentinel = document.getElementById('load-sentinel');
const hoverPopup = document.getElementById('card-hover-popup');
const toolbar = document.getElementById('toolbar');
const toolbarHandle = document.getElementById('toolbar-handle');

let activePopupTile = null;
let toolbarHovered = false;

const searchInput = document.getElementById('search-input');
const kindSelect = document.getElementById('kind-select');
const monsterTypeSelect = document.getElementById('monster-type-select');
const attributeSelect = document.getElementById('attribute-select');
const subcategorySelect = document.getElementById('subcategory-select');
const sortSelect = document.getElementById('sort-select');
const orderSelect = document.getElementById('order-select');
const resetButton = document.getElementById('reset-button');

const state = {
  allTotal: 0,
  total: 0,
  loaded: 0,
  batchSize: window.innerWidth >= 1280 ? 96 : window.innerWidth >= 768 ? 72 : 36,
  loading: false,
  ready: false,
  complete: false,
  worker: null,
  activeToken: 0,
};

const LABELS = {
  aqua: 'Aqua',
  beastwarrior: 'Beast-Warrior',
  dark: 'Dark',
  divine: 'Divine',
  divinebeast: 'Divine-Beast',
  earth: 'Earth',
  fire: 'Fire',
  light: 'Light',
  seaserpent: 'Sea Serpent',
  wingedbeast: 'Winged Beast',
  creatorgod: 'Creator-God',
  quickplay: 'Quick-Play',
  specialsummon: 'Special Summon',
};

function formatLabel(value) {
  if (!value) return '';
  return LABELS[value] || value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

function getPrimaryText(card) {
  if (!card?.text) return {};
  return card.text.en || Object.values(card.text)[0] || {};
}

function isYgoProDeckUrl(value) {
  return /^https?:\/\/(?:images\.)?ygoprodeck\.com\//i.test(String(value || ''));
}

function getImageCandidates(card) {
  const images = Array.isArray(card?.images) ? card.images : [];
  const preferred = [];
  const fallback = [];
  const seen = new Set();

  for (const image of images) {
    for (const url of [image?.card, image?.art]) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      (isYgoProDeckUrl(url) ? preferred : fallback).push(url);
    }
  }

  return [...preferred, ...fallback];
}

function getImageUrl(card) {
  return getImageCandidates(card)[0] || '';
}

function buildTypeLine(card) {
  if (!card) return 'Unknown card';

  if (card.cardType === 'monster' || card.cardType === 'token') {
    const parts = [
      formatLabel(card.cardType),
      ...(card.monsterCardTypes || []).map(formatLabel),
      formatLabel(card.type),
      ...(card.classifications || []).map(formatLabel),
      ...(card.abilities || []).map(formatLabel),
    ].filter(Boolean);
    return parts.join(' • ');
  }

  if (card.cardType === 'spell' || card.cardType === 'trap') {
    return [formatLabel(card.cardType), formatLabel(card.subcategory)].filter(Boolean).join(' • ');
  }

  if (card.cardType === 'skill') {
    return [formatLabel(card.cardType), card.skillType, card.character].filter(Boolean).join(' • ');
  }

  return formatLabel(card.cardType);
}

function buildMeta(card) {
  const items = [];

  if (card.attribute) items.push(formatLabel(card.attribute));
  if (card.level != null) items.push(`Level ${card.level}`);
  if (card.rank != null) items.push(`Rank ${card.rank}`);
  if (card.scale != null) items.push(`Scale ${card.scale}`);
  if (card.atk != null) items.push(`ATK ${card.atk}`);
  if (card.def != null) items.push(`DEF ${card.def}`);
  if (card.linkArrows?.length) items.push(`Links ${card.linkArrows.length}`);
  if (card.masterDuel?.rarity) items.push(`MD ${String(card.masterDuel.rarity).toUpperCase()}`);
  if (card.duelLinks?.rarity) items.push(`DL ${String(card.duelLinks.rarity).toUpperCase()}`);

  return items.slice(0, 6);
}

function getEffect(card) {
  const text = getPrimaryText(card);
  const raw = text.effect || text.pendulumEffect || 'No effect text available.';
  return raw.length > 260 ? `${raw.slice(0, 257)}…` : raw;
}

function renderCards(cards) {
  const fragment = document.createDocumentFragment();

  for (const card of cards) {
    const text = getPrimaryText(card);
    const article = document.createElement('article');
    const name = text.name || 'Unnamed card';
    const imageCandidates = getImageCandidates(card);
    const imageUrl = imageCandidates[0] || '';

    article.className = 'card-tile';
    article.tabIndex = 0;
    article.setAttribute('aria-label', `${name} — ${buildTypeLine(card)}`);

    article.innerHTML = `
      <div class="card-image-wrap">
        ${imageUrl
          ? `<img class="card-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(name)}" loading="lazy" decoding="async" data-fallback-index="0" data-fallback-urls="${escapeAttribute(JSON.stringify(imageCandidates))}" />`
          : `<div class="card-image" aria-hidden="true"></div>`}
      </div>
    `;

    article.addEventListener('click', (event) => {
      event.preventDefault();
      activePopupTile = article;
      showPopup(card, event.clientX, event.clientY);
    });
    article.addEventListener('mousemove', (event) => {
      if (activePopupTile === article) {
        positionPopup(event.clientX, event.clientY);
      }
    });
    article.addEventListener('mouseleave', () => {
      if (activePopupTile === article) {
        hidePopup();
      }
    });
    article.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activePopupTile = article;
      const rect = article.getBoundingClientRect();
      showPopup(card, rect.right + 12, rect.top + 12);
    });
    article.addEventListener('blur', () => {
      if (activePopupTile === article) {
        hidePopup();
      }
    });

    const image = article.querySelector('img');
    if (image) {
      const markLoaded = () => {
        requestAnimationFrame(() => {
          image.classList.add('is-loaded');
        });
      };

      image.addEventListener('load', markLoaded);
      image.addEventListener('error', () => {
        const urls = JSON.parse(image.dataset.fallbackUrls || '[]');
        const nextIndex = (Number(image.dataset.fallbackIndex) || 0) + 1;
        const nextUrl = urls[nextIndex];

        if (nextUrl) {
          image.classList.remove('is-loaded');
          image.dataset.fallbackIndex = String(nextIndex);
          image.src = nextUrl;
          return;
        }

        image.replaceWith(
          Object.assign(document.createElement('div'), {
            className: 'card-image',
            ariaHidden: 'true',
          }),
        );
      });

      if (image.complete && image.naturalWidth > 0) {
        markLoaded();
      }
    }

    fragment.appendChild(article);
  }

  grid.appendChild(fragment);
}

function showPopup(card, x, y) {
  if (!hoverPopup || window.innerWidth <= 680) return;

  const text = getPrimaryText(card);
  const name = text.name || 'Unnamed card';
  const metaItems = buildMeta(card)
    .map((item) => `<span class="meta-chip">${escapeHtml(item)}</span>`)
    .join('');

  hoverPopup.innerHTML = `
    <p class="card-hover-type">${escapeHtml(buildTypeLine(card))}</p>
    <h2 class="card-hover-title">${escapeHtml(name)}</h2>
    ${metaItems ? `<div class="card-hover-meta">${metaItems}</div>` : ''}
    <p class="card-hover-effect">${escapeHtml(getEffect(card))}</p>
    <div class="card-hover-footer">
      <span>${escapeHtml(card.id || 'No ID')}</span>
      <span>${escapeHtml(card.passwords?.[0] ? `#${card.passwords[0]}` : 'No password')}</span>
    </div>
  `;

  hoverPopup.classList.remove('hidden');
  hoverPopup.setAttribute('aria-hidden', 'false');
  positionPopup(x, y);
}

function positionPopup(x, y) {
  if (!hoverPopup || hoverPopup.classList.contains('hidden')) return;

  const gap = 16;
  const rect = hoverPopup.getBoundingClientRect();
  let left = x + gap;
  let top = y + gap;

  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - gap;
  if (left < 8) left = 8;
  if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
  if (top < 8) top = 8;

  hoverPopup.style.left = `${left}px`;
  hoverPopup.style.top = `${top}px`;
}

function hidePopup() {
  activePopupTile = null;
  if (!hoverPopup) return;
  hoverPopup.classList.add('hidden');
  hoverPopup.setAttribute('aria-hidden', 'true');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function setToolbarCollapsed(collapsed) {
  if (!toolbar) return;
  toolbar.classList.toggle('is-collapsed', collapsed);
  if (toolbarHandle) {
    toolbarHandle.setAttribute('aria-expanded', String(!collapsed));
  }
}

function syncToolbarCollapse() {
  if (!toolbar) return;
  const shouldCollapse = window.scrollY > 12 && !toolbarHovered && !toolbar.matches(':focus-within');
  setToolbarCollapsed(shouldCollapse);
}

function updateStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

function updateCount() {
  if (!countText) return;

  if (!state.ready) {
    countText.textContent = '0 cards loaded';
    return;
  }

  const loaded = state.loaded.toLocaleString();
  const total = state.total.toLocaleString();
  const allTotal = state.allTotal.toLocaleString();

  if (!state.total) {
    countText.textContent = `0 matches • ${allTotal} total cards`;
    return;
  }

  countText.textContent = `${loaded} of ${total} shown • ${allTotal} total cards`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 100 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function setLoadingProgress(value = null) {
  if (!loadingProgress || !loadingProgressBar) return;

  const isIndeterminate = value === 'indeterminate';
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const isVisible = isIndeterminate || hasValue;

  loadingProgress.classList.toggle('hidden', !isVisible);
  loadingProgress.classList.toggle('is-indeterminate', isIndeterminate);
  loadingProgress.setAttribute('aria-hidden', String(!isVisible));
  loadingProgressBar.style.width = hasValue ? `${Math.max(0, Math.min(100, value * 100))}%` : '0%';
  loadingProgressBar.style.animation = isIndeterminate ? '' : 'none';
}

function setLoading(loading, message = 'Loading more cards…', progress = null) {
  state.loading = loading;
  if (loadingText) {
    loadingText.textContent = message;
  }
  setLoadingProgress(progress);
  loadingIndicator.classList.toggle('hidden', !loading);
}

function currentQuery() {
  return {
    search: searchInput.value.trim(),
    cardType: kindSelect.value,
    monsterType: monsterTypeSelect.value,
    attribute: attributeSelect.value,
    subcategory: subcategorySelect.value,
    sortBy: sortSelect.value,
    sortOrder: orderSelect.value,
  };
}

function hasActiveFilters(query) {
  return Boolean(
    query.search ||
      query.cardType !== 'all' ||
      query.monsterType !== 'all' ||
      query.attribute !== 'all' ||
      query.subcategory !== 'all' ||
      query.sortBy !== 'default' ||
      query.sortOrder !== 'asc',
  );
}

function applyView() {
  if (!state.ready) return;

  const query = currentQuery();
  state.activeToken += 1;
  state.loaded = 0;
  state.total = 0;
  state.complete = false;

  hidePopup();
  grid.replaceChildren();
  emptyState.classList.add('hidden');
  updateCount();
  updateStatus(hasActiveFilters(query) ? 'Applying filters…' : 'Preparing card view…');
  setLoading(true, 'Preparing cards…');

  state.worker.postMessage({
    type: 'setView',
    token: state.activeToken,
    query,
  });
}

function requestNextBatch() {
  if (!state.ready || state.loading || state.complete) return;

  setLoading(true, state.loaded ? 'Loading more cards…' : 'Loading cards…');
  state.worker.postMessage({
    type: 'getBatch',
    token: state.activeToken,
    start: state.loaded,
    size: state.batchSize,
  });
}

function showError(message) {
  updateStatus('Unable to load the card archive');
  hidePopup();
  loadingIndicator.classList.add('hidden');
  emptyState.textContent = `${message} If you opened this page directly from the file system, serve the folder over HTTP instead.`;
  emptyState.classList.remove('hidden');
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) requestNextBatch();
    }
  },
  { rootMargin: '1200px 0px' },
);

observer.observe(sentinel);
updateCount();
setLoading(true, 'Loading card archive…');
updateStatus('Loading card archive in a background worker…');

window.addEventListener('scroll', () => {
  hidePopup();
  syncToolbarCollapse();
}, { passive: true });
window.addEventListener('resize', () => {
  hidePopup();
  syncToolbarCollapse();
});
document.addEventListener('click', (event) => {
  if (activePopupTile && !activePopupTile.contains(event.target)) {
    hidePopup();
  }
});

if (toolbar) {
  toolbar.addEventListener('mouseenter', () => {
    toolbarHovered = true;
    setToolbarCollapsed(false);
  });

  toolbar.addEventListener('mouseleave', () => {
    toolbarHovered = false;
    syncToolbarCollapse();
  });

  toolbar.addEventListener('focusin', () => {
    setToolbarCollapsed(false);
  });

  toolbar.addEventListener('focusout', () => {
    requestAnimationFrame(syncToolbarCollapse);
  });
}

if (toolbarHandle) {
  toolbarHandle.addEventListener('click', () => {
    const collapsed = toolbar?.classList.contains('is-collapsed');
    if (collapsed) {
      setToolbarCollapsed(false);
    } else if (window.scrollY > 12) {
      setToolbarCollapsed(true);
    }
  });
}

syncToolbarCollapse();

let searchTimer = 0;
searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(applyView, 180);
});

for (const control of [kindSelect, monsterTypeSelect, attributeSelect, subcategorySelect, sortSelect, orderSelect]) {
  control.addEventListener('change', applyView);
}

resetButton.addEventListener('click', () => {
  searchInput.value = '';
  kindSelect.value = 'all';
  monsterTypeSelect.value = 'all';
  attributeSelect.value = 'all';
  subcategorySelect.value = 'all';
  sortSelect.value = 'default';
  orderSelect.value = 'asc';
  applyView();
});

state.worker = new Worker('./card-worker.js');
state.worker.postMessage({ type: 'init' });

state.worker.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;

  if (data.type === 'downloadProgress') {
    const hasReliableTotal = typeof data.totalBytes === 'number' && Number.isFinite(data.totalBytes) && data.totalBytes > 0;
    const message = hasReliableTotal
      ? `Downloading card archive… ${Math.round((data.loadedBytes / data.totalBytes) * 100)}% (${formatBytes(data.loadedBytes)} / ${formatBytes(data.totalBytes)})`
      : `Downloading card archive… ${formatBytes(data.loadedBytes)}`;
    setLoading(true, message, hasReliableTotal ? data.loadedBytes / data.totalBytes : 'indeterminate');
    return;
  }

  if (data.type === 'parsing') {
    setLoading(true, 'Parsing card archive…', 1);
    return;
  }

  if (data.type === 'ready') {
    state.ready = true;
    state.allTotal = data.total || 0;
    updateStatus('Archive ready.');
    updateCount();

    if (!state.allTotal) {
      state.complete = true;
      setLoading(false);
      emptyState.textContent = 'No cards were found in the remote archive.';
      emptyState.classList.remove('hidden');
      return;
    }

    applyView();
    return;
  }

  if (data.type === 'error') {
    showError(data.message || 'An unknown error occurred.');
    return;
  }

  if (data.token !== state.activeToken) return;

  if (data.type === 'viewReady') {
    state.total = data.total || 0;
    state.loaded = 0;
    state.complete = !state.total;
    updateStatus(state.total ? 'Archive ready — scroll to load more cards.' : 'No cards match the current filters.');
    updateCount();

    if (!state.total) {
      setLoading(false);
      emptyState.textContent = 'No cards match the current filters.';
      emptyState.classList.remove('hidden');
      return;
    }

    setLoading(false);
    requestNextBatch();
    return;
  }

  if (data.type === 'batch') {
    const cards = Array.isArray(data.cards) ? data.cards : [];
    renderCards(cards);
    state.loaded += cards.length;
    state.complete = state.loaded >= state.total || cards.length === 0;
    updateCount();

    if (state.complete) {
      updateStatus('All matching cards loaded.');
      setLoading(false);
    } else {
      updateStatus('Archive ready — scroll to load more cards.');
      setLoading(false);
    }
  }
});

state.worker.addEventListener('error', (event) => {
  showError(event.message || 'The background worker failed to start.');
});
