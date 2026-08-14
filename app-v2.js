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

  // --- ENSURE CONSISTENT DROPDOWN ORDER HERE ---
  // Sort sets alphabetically by Name so they never jump around
  localSets.sort((a, b) => a.name.localeCompare(b.name));

  // Preserve currently selected set ID so the user's choice isn't wiped out
  const currentSelection = setSelect.value;

  // Populate Set Dropdown
  setSelect.innerHTML = '<option value="">-- Select a Set --</option>';
  localSets.forEach(set => {
    const opt = document.createElement('option');
    opt.value = set.id;
    opt.textContent = `${set.name} (${set.cardCount} cards)`;
    setSelect.appendChild(opt);
  });

  // Restore previous selection if it existed
  if (currentSelection) {
    setSelect.value = currentSelection;
  }
}

// 4. Sync Set Cards from TCGdex
btnSync.addEventListener('click', async () => {
  console.log('--- 1. SYNC BUTTON CLICKED ---');
  const setId = setSelect.value;
  console.log('Selected Set ID:', setId);

  if (!setId) return alert('Please select a set first!');

  statusMsg.textContent = `Syncing set: ${setId}...`;

  try {
    const setDetails = await apiFetch(`/sets/${setId}`);
    console.log('--- 2. API DATA RECEIVED ---', setDetails);
    const rawCards = setDetails.cards;

    const formattedCards = rawCards.map(c => {
      const extractedNumber = c.localId || (c.id ? c.id.split('-').pop() : '0');

      return {
        id: c.id,
        name: c.name,
        number: String(extractedNumber).trim(),
        image: c.image ? `${c.image}/low.webp` : 'https://via.placeholder.com/150',
        set: { id: setId, name: setDetails.name }
      };
    });

    await db.cards.bulkPut(formattedCards);
    console.log('--- 3. CARDS SAVED TO DEXIE ---');
    statusMsg.textContent = `Saved ${formattedCards.length} cards locally!`;

    renderGallery();
  } catch (err) {
    console.error('SYNC ERROR:', err);
    statusMsg.textContent = 'Sync failed. Check your internet connection.';
  }
});

// 5. Render Card Gallery Grid
async function renderGallery() {
  const setId = setSelect.value;
  const searchQuery = searchInput.value.toLowerCase().trim();
  const showMissing = toggleMissing.checked;

  gallery.innerHTML = '';

  // 1. If neither set nor search query exists, show prompt and exit
  if (!setId && !searchQuery) {
    statusMsg.textContent = 'Select a set or type a Pokémon name to search across all sets.';
    return;
  }

  let cards = [];

  // 2. SEARCH MODE: Searching for a specific Pokémon across all sets
  if (searchQuery && !setId) {
    statusMsg.textContent = `Searching for "${searchQuery}" across local database...`;
    
    // First, search cards stored in local Dexie database
    cards = await db.cards.where('name').startsWithIgnoreCase(searchQuery).toArray();

    // OPTIONAL: If local database yields few/no results, fetch from TCGdex API directly!
    if (cards.length === 0 && searchQuery.length >= 3) {
      statusMsg.textContent = `Searching TCGdex for "${searchQuery}"...`;
      try {
        const apiResults = await apiFetch(`/cards?name=${encodeURIComponent(searchQuery)}`);
        
        // Map API results to fit our card schema
        cards = apiResults.map(c => {
          const extractedNumber = c.localId || (c.id ? c.id.split('-').pop() : '0');
          return {
            id: c.id,
            name: c.name,
            number: String(extractedNumber).trim(),
            image: c.image ? `${c.image}/low.webp` : 'https://via.placeholder.com/150',
            set: { id: c.id.split('-')[0], name: c.id.split('-')[0].toUpperCase() }
          };
        });

        // Save fetched cards to Dexie so future searches are instant
        if (cards.length > 0) {
          await db.cards.bulkPut(cards);
        }
      } catch (err) {
        console.error('API Search Error:', err);
      }
    }
  } 
  // 3. SET MODE: Selected a specific set (with or without sub-filtering)
  else if (setId) {
    cards = await db.cards.where('set.id').equals(setId).toArray();
    if (searchQuery) {
      cards = cards.filter(c => c.name.toLowerCase().includes(searchQuery));
    }
  }

  statusMsg.textContent = `Displaying ${cards.length} cards.`;

  // --- NATURAL SORTING ---
  cards.sort((a, b) => {
    // If viewing a single Pokémon across sets, sort by Set ID first, then card number
    if (!setId && a.set?.id !== b.set?.id) {
      return String(a.set?.id).localeCompare(String(b.set?.id));
    }

    const numA = String(a.number).split('/')[0].trim();
    const numB = String(b.number).split('/')[0].trim();

    const intA = parseInt(numA, 10);
    const intB = parseInt(numB, 10);

    const isPureNumA = !isNaN(intA) && /^\d+$/.test(numA);
    const isPureNumB = !isNaN(intB) && /^\d+$/.test(numB);

    if (isPureNumA && isPureNumB) return intA - intB;
    return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Render cards to gallery
  const ownedCollection = await db.collection.toArray();
  const ownedMap = new Map(ownedCollection.map(i => [i.cardId, i]));

  let ownedCount = 0;

  cards.forEach(card => {
    const isOwned = ownedMap.has(card.id);
    if (isOwned) ownedCount++;

    if (!isOwned && !showMissing) return;

    const cardEl = document.createElement('div');
    cardEl.className = `card-item ${isOwned ? 'owned' : 'missing'}`;

    // Display Set Name alongside Card Number for cross-set searching!
    const setLabel = !setId && card.set?.name ? `[${card.set.name}] ` : '';

    cardEl.innerHTML = `
      <img src="${card.image}" alt="${card.name}" loading="lazy">
      <div style="margin-top:6px; font-weight:bold; font-size:0.8rem;">
        ${card.name} (${setLabel}#${card.number})
      </div>
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

  // Progress Bar update
  const total = cards.length;
  const pct = total > 0 ? Math.round((ownedCount / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${ownedCount} / ${total} Cards Collected (${pct}%)`;
}

// Automatically clear gallery if search query is emptied while no set is selected
searchInput.addEventListener('input', () => {
  if (searchInput.value.trim() === '' && !setSelect.value) {
    gallery.innerHTML = '';
    progressBar.style.width = '0%';
    progressText.textContent = '0 / 0 Cards Collected (0%)';
    statusMsg.textContent = 'Select a set or type a Pokémon name.';
  } else {
    renderGallery();
  }
});

// Event Listeners
setSelect.addEventListener('change', renderGallery);
searchInput.addEventListener('input', renderGallery);
toggleMissing.addEventListener('change', renderGallery);

// Initialize
loadSets();