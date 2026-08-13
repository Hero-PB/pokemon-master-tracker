// 1. Initialize Dexie.js Database
const db = new Dexie('PokemonMasterTrackerDB');

db.version(1).stores({
  sets: 'id, name',
  cards: 'id, set.id, name',
  collection: 'cardId, collectedAt'
});

// TCGdex Base API Endpoint (English cards)
const API_BASE = 'https://api.tcgdex.net/v2/en';

// DOM Element References
const setSelect = document.getElementById('set-select');
const searchInput = document.getElementById('search-input');
const toggleMissing = document.getElementById('toggle-missing');
const btnSync = document.getElementById('btn-sync');
const gallery = document.getElementById('card-gallery');
const statusMsg = document.getElementById('status-msg');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// 2. Fetch Helper Function
async function apiFetch(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return await response.json();
}

// 3. Load Sets from TCGdex
async function loadSets() {
  statusMsg.textContent = 'Checking local sets database...';
  let localSets = await db.sets.toArray();

  if (localSets.length === 0) {
    statusMsg.textContent = 'Fetching sets from TCGdex...';
    try {
      const sets = await apiFetch('/sets');
      
      // Store basic set metadata locally
      localSets = sets.map(s => ({
        id: s.id,
        name: s.name,
        cardCount: s.cardCount?.official || s.cardCount?.total || 0
      }));

      await db.sets.bulkPut(localSets);
      statusMsg.textContent = 'Sets database updated!';
    } catch (err) {
      console.error(err);
      statusMsg.textContent = 'Failed to fetch sets. Working offline.';
    }
  } else {
    statusMsg.textContent = 'Sets loaded from local storage.';
  }

  // Populate Set Dropdown
  setSelect.innerHTML = '<option value="">-- Select a Set --</option>';
  localSets.forEach(set => {
    const opt = document.createElement('option');
    opt.value = set.id;
    opt.textContent = `${set.name} (${set.cardCount} cards)`;
    setSelect.appendChild(opt);
  });
}

// 4. Sync Set Cards from TCGdex
btnSync.addEventListener('click', async () => {
  const setId = setSelect.value;
  if (!setId) return alert('Please select a set first!');

  statusMsg.textContent = `Syncing set: ${setId}...`;

  try {
    // Fetch full set details (includes all cards in set)
    const setDetails = await apiFetch(`/sets/${setId}`);
    const rawCards = setDetails.cards;

    // Map card fields to fit our application schema
    const formattedCards = rawCards.map(c => ({
      id: c.id,
      name: c.name,
      number: c.localId,
      image: c.image ? `${c.image}/low.webp` : 'https://via.placeholder.com/150',
      set: { id: setId, name: setDetails.name }
    }));

    await db.cards.bulkPut(formattedCards);
    statusMsg.textContent = `Saved ${formattedCards.length} cards locally!`;

    renderGallery();
  } catch (err) {
    console.error(err);
    statusMsg.textContent = 'Sync failed. Check your internet connection.';
  }
});

// 5. Render Card Gallery Grid
async function renderGallery() {
  const setId = setSelect.value;
  const searchQuery = searchInput.value.toLowerCase().trim();
  const showMissing = toggleMissing.checked;

  gallery.innerHTML = '';
  if (!setId && !searchQuery) return;

  let cards = [];
  if (setId) {
    cards = await db.cards.where('set.id').equals(setId).toArray();
  } else {
    cards = await db.cards.toArray();
  }

    cards.sort((a, b) => {
  // Extract just the left side of any slash (e.g., "10/102" -> "10")
  const numA = String(a.number).split('/')[0].trim();
  const numB = String(b.number).split('/')[0].trim();

  // --- NATURAL SORTING ADDED HERE ---
  // Sorts numbers logically (1, 2, 3 ... 10, 100) instead of alphabetically (1, 10, 100, 2)
  cards.sort((a, b) => {
    return String(a.number).localeCompare(String(b.number), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });



  return numA.localeCompare(numB, undefined, {
    numeric: true,
    sensitivity: 'base'
  });
});

  if (searchQuery) {
    cards = cards.filter(c => c.name.toLowerCase().includes(searchQuery));
  }

  const ownedCollection = await db.collection.toArray();
  const ownedMap = new Map(ownedCollection.map(i => [i.cardId, i]));

  let ownedCount = 0;

  cards.forEach(card => {
    const isOwned = ownedMap.has(card.id);
    if (isOwned) ownedCount++;

    if (!isOwned && !showMissing) return;

    const cardEl = document.createElement('div');
    cardEl.className = `card-item ${isOwned ? 'owned' : 'missing'}`;

    cardEl.innerHTML = `
      <img src="${card.image}" alt="${card.name}" loading="lazy">
      <div style="margin-top:6px; font-weight:bold; font-size:0.8rem;">${card.name} (#${card.number})</div>
    `;

    cardEl.addEventListener('click', async () => {
      if (isOwned) {
        await db.collection.delete(card.id);
      } else {
        await db.collection.put({ cardId: card.id, collectedAt: new Date().toISOString() });
      }
      renderGallery();
    });

    gallery.appendChild(cardEl);
  });

  const total = cards.length;
  const pct = total > 0 ? Math.round((ownedCount / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${ownedCount} / ${total} Cards Collected (${pct}%)`;
}

// Event Listeners
setSelect.addEventListener('change', renderGallery);
searchInput.addEventListener('input', renderGallery);
toggleMissing.addEventListener('change', renderGallery);

// Initialize
loadSets();