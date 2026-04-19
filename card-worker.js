let cards = null;
let loadPromise = null;

async function loadCards() {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const response = await fetch('./data/cards.json');
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    cards = await response.json();
    postMessage({
      type: 'ready',
      total: Array.isArray(cards) ? cards.length : 0,
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

    if (data.type === 'getBatch') {
      await loadCards();

      if (!Array.isArray(cards)) {
        postMessage({ type: 'batch', cards: [] });
        return;
      }

      const start = Math.max(0, Number(data.start) || 0);
      const size = Math.max(1, Number(data.size) || 1);

      postMessage({
        type: 'batch',
        start,
        cards: cards.slice(start, start + size),
      });
    }
  } catch (error) {
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
