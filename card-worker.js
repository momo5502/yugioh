const CARDS_URL = 'https://raw.githubusercontent.com/iconmaster5326/YGOJSON/v1/aggregate/cards.json';
const SETS_URL = 'https://raw.githubusercontent.com/iconmaster5326/YGOJSON/v1/aggregate/sets.json';

let cards = null;
let view = [];
let loadPromise = null;
let setReleaseDates = null;
let setReleaseDatesPromise = null;
const releaseDateCache = new Map();

function getPrimaryText(card) {
  if (!card || typeof card !== 'object' || !card.text) return {};
  return card.text.en || Object.values(card.text)[0] || {};
}

function textForSearch(card) {
  const text = getPrimaryText(card);
  return [
    text.name,
    text.effect,
    text.pendulumEffect,
    card.id,
    ...(Array.isArray(card.passwords) ? card.passwords : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compareNames(a, b) {
  return (getPrimaryText(a).name || '').localeCompare(getPrimaryText(b).name || '', undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function compareStrings(a, b, getter, order) {
  const direction = order === 'desc' ? -1 : 1;
  const left = String(getter(a) || '');
  const right = String(getter(b) || '');
  return direction * left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true }) || compareNames(a, b);
}

function compareNumbers(a, b, getter, order) {
  const direction = order === 'desc' ? -1 : 1;
  const left = getter(a);
  const right = getter(b);
  const leftMissing = left == null;
  const rightMissing = right == null;

  if (leftMissing && rightMissing) return compareNames(a, b);
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  if (left === right) return compareNames(a, b);
  return direction * (left - right);
}

function compareDates(a, b, getter, order) {
  const direction = order === 'desc' ? -1 : 1;
  const left = getter(a);
  const right = getter(b);
  const leftMissing = !left;
  const rightMissing = !right;

  if (leftMissing && rightMissing) return compareNames(a, b);
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  if (left === right) return compareNames(a, b);
  return direction * left.localeCompare(right);
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pushDate(bucket, value) {
  if (isIsoDate(value)) bucket.push(value);
}

function earliestDateForSet(set) {
  const dates = [];

  pushDate(dates, set?.date);

  if (set?.locales && typeof set.locales === 'object') {
    for (const localeInfo of Object.values(set.locales)) {
      pushDate(dates, localeInfo?.date);
    }
  }

  if (Array.isArray(set?.contents)) {
    for (const content of set.contents) {
      if (Array.isArray(content?.history)) {
        for (const period of content.history) {
          pushDate(dates, period?.startDate);
        }
      }
    }
  }

  if (!dates.length) return null;
  dates.sort();
  return dates[0];
}

async function fetchJsonText(url, progressType) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  if (!response.body) {
    const text = await response.text();
    postMessage({ type: progressType, loadedBytes: text.length, totalBytes: null });
    return text;
  }

  const totalBytesHeader = response.headers.get('content-length');
  const contentEncoding = (response.headers.get('content-encoding') || 'identity').toLowerCase();
  const parsedTotalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
  let totalBytes = Number.isFinite(parsedTotalBytes) && parsedTotalBytes > 0 ? parsedTotalBytes : null;

  if (contentEncoding && contentEncoding !== 'identity') {
    totalBytes = null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let loadedBytes = 0;
  let lastSentAt = 0;
  let lastRatio = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    loadedBytes += value.byteLength;
    parts.push(decoder.decode(value, { stream: true }));

    if (totalBytes && loadedBytes > totalBytes) {
      totalBytes = null;
      lastRatio = -1;
    }

    const now = Date.now();
    const ratio = totalBytes ? Math.floor((loadedBytes / totalBytes) * 100) : -1;
    if (now - lastSentAt > 100 || ratio !== lastRatio) {
      postMessage({ type: progressType, loadedBytes, totalBytes });
      lastSentAt = now;
      lastRatio = ratio;
    }
  }

  parts.push(decoder.decode());
  postMessage({ type: progressType, loadedBytes, totalBytes });
  return parts.join('');
}

async function loadSetReleaseDates() {
  if (setReleaseDatesPromise) return setReleaseDatesPromise;

  setReleaseDatesPromise = (async () => {
    const text = await fetchJsonText(SETS_URL, 'setsDownloadProgress');
    postMessage({ type: 'setsParsing' });

    const sets = JSON.parse(text);
    const dates = {};

    if (Array.isArray(sets)) {
      for (const set of sets) {
        if (!set?.id) continue;
        const earliest = earliestDateForSet(set);
        if (earliest) {
          dates[set.id] = earliest;
        }
      }
    }

    setReleaseDates = dates;
    return setReleaseDates;
  })();

  return setReleaseDatesPromise;
}

function earliestReleaseDate(card) {
  const key = card?.id || card;
  if (releaseDateCache.has(key)) return releaseDateCache.get(key);

  const ids = Array.isArray(card?.sets) ? card.sets : [];
  let earliest = null;

  for (const setId of ids) {
    const date = setReleaseDates?.[setId];
    if (!date) continue;
    if (!earliest || date < earliest) earliest = date;
  }

  releaseDateCache.set(key, earliest);
  return earliest;
}

async function sortCards(items, query) {
  const sortBy = query?.sortBy || 'default';
  const sortOrder = query?.sortOrder || 'asc';

  if (sortBy === 'default') {
    if (sortOrder === 'desc') items.reverse();
    return items;
  }

  if (sortBy === 'name') {
    items.sort((a, b) => compareStrings(a, b, (card) => getPrimaryText(card).name, sortOrder));
    return items;
  }

  if (sortBy === 'id') {
    items.sort((a, b) => compareStrings(a, b, (card) => card.id, sortOrder));
    return items;
  }

  if (sortBy === 'password') {
    items.sort((a, b) => compareStrings(a, b, (card) => card.passwords?.[0], sortOrder));
    return items;
  }

  if (sortBy === 'atk') {
    items.sort((a, b) => compareNumbers(a, b, (card) => numberOrNull(card.atk), sortOrder));
    return items;
  }

  if (sortBy === 'def') {
    items.sort((a, b) => compareNumbers(a, b, (card) => numberOrNull(card.def), sortOrder));
    return items;
  }

  if (sortBy === 'level') {
    items.sort((a, b) => compareNumbers(a, b, (card) => numberOrNull(card.level), sortOrder));
    return items;
  }

  if (sortBy === 'rank') {
    items.sort((a, b) => compareNumbers(a, b, (card) => numberOrNull(card.rank), sortOrder));
    return items;
  }

  if (sortBy === 'scale') {
    items.sort((a, b) => compareNumbers(a, b, (card) => numberOrNull(card.scale), sortOrder));
    return items;
  }

  if (sortBy === 'releaseDate') {
    await loadSetReleaseDates();
    releaseDateCache.clear();
    items.sort((a, b) => compareDates(a, b, earliestReleaseDate, sortOrder));
    return items;
  }

  return items;
}

function matches(card, query) {
  if (!card || typeof card !== 'object') return false;

  if (query?.cardType && query.cardType !== 'all' && card.cardType !== query.cardType) return false;
  if (query?.monsterType && query.monsterType !== 'all' && card.type !== query.monsterType) return false;
  if (query?.attribute && query.attribute !== 'all' && card.attribute !== query.attribute) return false;
  if (query?.subcategory && query.subcategory !== 'all' && card.subcategory !== query.subcategory) return false;

  if (query?.search) {
    const needle = String(query.search).trim().toLowerCase();
    if (needle && !textForSearch(card).includes(needle)) return false;
  }

  return true;
}

async function loadCards() {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const text = await fetchJsonText(CARDS_URL, 'downloadProgress');
    postMessage({ type: 'parsing' });

    cards = JSON.parse(text);
    if (!Array.isArray(cards)) cards = [];

    postMessage({
      type: 'ready',
      total: cards.length,
    });
  })();

  return loadPromise;
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'init') {
      await loadCards();
      return;
    }

    if (data.type === 'setView') {
      await loadCards();

      view = await sortCards(cards.filter((card) => matches(card, data.query || {})), data.query || {});
      postMessage({
        type: 'viewReady',
        token: data.token,
        total: view.length,
      });
      return;
    }

    if (data.type === 'getBatch') {
      await loadCards();

      const start = Math.max(0, Number(data.start) || 0);
      const size = Math.max(1, Number(data.size) || 1);

      postMessage({
        type: 'batch',
        token: data.token,
        start,
        cards: view.slice(start, start + size),
      });
    }
  } catch (error) {
    postMessage({
      type: 'error',
      token: data?.token,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
