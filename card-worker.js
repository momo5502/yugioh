let cards = null;
let view = [];
let loadPromise = null;

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

function sortCards(items, query) {
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
    const response = await fetch('./data/cards.json');
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    cards = await response.json();
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

      view = sortCards(cards.filter((card) => matches(card, data.query || {})), data.query || {});
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
