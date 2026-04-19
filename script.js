const grid = document.getElementById('cards-grid');
const statusText = document.getElementById('status-text');
const countText = document.getElementById('count-text');
const loadingIndicator = document.getElementById('loading-indicator');
const emptyState = document.getElementById('empty-state');
const sentinel = document.getElementById('load-sentinel');
const hoverPopup = document.getElementById('card-hover-popup');

const state = {
  total: 0,
  loaded: 0,
  batchSize: window.innerWidth >= 1280 ? 84 : window.innerWidth >= 768 ? 60 : 30,
  loading: false,
  ready: false,
  complete: false,
  worker: null,
};

const LABELS = {
  beastwarrior: 'Beast-Warrior',
  wingedbeast: 'Winged Beast',
  seaserpent: 'Sea Serpent',
  divinebeast: 'Divine-Beast',
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

function getImageUrl(card) {
  return card?.images?.[0]?.card || card?.images?.[0]?.art || '';
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
    const imageUrl = getImageUrl(card);

    article.className = 'card-tile';
    article.tabIndex = 0;
    article.setAttribute('aria-label', `${name} — ${buildTypeLine(card)}`);

    article.innerHTML = `
      <div class="card-image-wrap">
        ${imageUrl
          ? `<img class="card-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(name)}" loading="lazy" decoding="async" />`
          : `<div class="card-image" aria-hidden="true"></div>`}
      </div>
    `;

    const movePopup = (event) => positionPopup(event.clientX, event.clientY);
    article.addEventListener('mouseenter', (event) => {
      showPopup(card, event.clientX, event.clientY);
    });
    article.addEventListener('mousemove', movePopup);
    article.addEventListener('mouseleave', hidePopup);
    article.addEventListener('focus', () => {
      const rect = article.getBoundingClientRect();
      showPopup(card, rect.right + 12, rect.top + 12);
    });
    article.addEventListener('blur', hidePopup);

    const image = article.querySelector('img');
    if (image) {
      image.addEventListener(
        'error',
        () => {
          image.replaceWith(
            Object.assign(document.createElement('div'), {
              className: 'card-image',
              ariaHidden: 'true',
            }),
          );
        },
        { once: true },
      );
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

  if (left + rect.width > window.innerWidth - 8) {
    left = x - rect.width - gap;
  }

  if (left < 8) {
    left = 8;
  }

  if (top + rect.height > window.innerHeight - 8) {
    top = window.innerHeight - rect.height - 8;
  }

  if (top < 8) {
    top = 8;
  }

  hoverPopup.style.left = `${left}px`;
  hoverPopup.style.top = `${top}px`;
}

function hidePopup() {
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

function updateStatus(message) {
  statusText.textContent = message;
}

function updateCount() {
  if (!state.total) {
    countText.textContent = `${state.loaded.toLocaleString()} cards loaded`;
    return;
  }

  countText.textContent = `${state.loaded.toLocaleString()} of ${state.total.toLocaleString()} cards loaded`;
}

function setLoading(loading, message = 'Loading more cards…') {
  state.loading = loading;
  loadingIndicator.textContent = message;
  loadingIndicator.classList.toggle('hidden', !loading);
}

function requestNextBatch() {
  if (!state.ready || state.loading || state.complete) return;
  setLoading(true);
  state.worker.postMessage({
    type: 'getBatch',
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
      if (entry.isIntersecting) {
        requestNextBatch();
      }
    }
  },
  { rootMargin: '1200px 0px' },
);

observer.observe(sentinel);
updateCount();
setLoading(true, 'Loading card archive…');
updateStatus('Loading card archive in a background worker…');

window.addEventListener('scroll', hidePopup, { passive: true });
window.addEventListener('resize', hidePopup);

afterStart();

function afterStart() {
  state.worker = new Worker('./card-worker.js');
  state.worker.postMessage({ type: 'init' });

  state.worker.addEventListener('message', ({ data }) => {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'ready') {
      state.ready = true;
      state.total = data.total || 0;
      updateStatus('Archive ready — more cards load automatically as you scroll.');
      updateCount();

      if (!state.total) {
        state.complete = true;
        setLoading(false);
        emptyState.textContent = 'No cards were found in data/cards.json.';
        emptyState.classList.remove('hidden');
        return;
      }

      emptyState.classList.add('hidden');
      setLoading(false);
      requestNextBatch();
      return;
    }

    if (data.type === 'batch') {
      const cards = Array.isArray(data.cards) ? data.cards : [];
      renderCards(cards);
      state.loaded += cards.length;
      updateCount();

      state.complete = state.loaded >= state.total || cards.length === 0;

      if (state.complete) {
        updateStatus('All cards loaded.');
        setLoading(false);
      } else {
        setLoading(false, 'Loading more cards…');
      }

      return;
    }

    if (data.type === 'error') {
      showError(data.message || 'An unknown error occurred.');
    }
  });

  state.worker.addEventListener('error', (event) => {
    showError(event.message || 'The background worker failed to start.');
  });
}
