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

  if (!setId && !searchQuery) {
    statusMsg.textContent = 'Select a set or type a Pokémon name to search across all sets.';
    progressBar.style.width = '0%';
    progressText.textContent = '0 / 0 Cards Collected (0%)';
    return;
  }

  let cards = [];

  // 1. GLOBAL SEARCH MODE
  if (searchQuery && !setId) {
    statusMsg.textContent = `Searching TCGdex for "${searchQuery}"...`;
    
    try {
      const apiResults = await apiFetch(`/cards?name=${encodeURIComponent(searchQuery)}`);
      
      // Filter out non-matching names and ensure valid card objects
      const matchedCards = apiResults.filter(c => 
        c && c.name && c.name.toLowerCase().includes(searchQuery)
      );

      cards = matchedCards.map(c => {
        const idParts = c.id ? c.id.split('-') : ['unknown', '0'];
        const setCode = idParts[0].toUpperCase();
        // Extract card number cleanly
        const cardNumber = idParts.length > 1 ? idParts.slice(1).join('-') : (c.localId || '0');

        return {
          id: c.id,
          name: c.name,
          number: String(cardNumber).trim(),
          image: c.image ? `${c.image}/low.webp` : 'https://via.placeholder.com/150',
          set: { id: idParts[0], name: setCode }
        };
      });

      if (cards.length > 0) {
        await db.cards.bulkPut(cards);
      }
    } catch (err) {
      console.error('API Search Error:', err);
      cards = await db.cards.where('name').startsWithIgnoreCase(searchQuery).toArray();
    }
  } 
  // 2. SINGLE SET MODE
  else if (setId) {
    cards = await db.cards.where('set.id').equals(setId).toArray();
    if (searchQuery) {
      cards = cards.filter(c => c.name.toLowerCase().includes(searchQuery));
    }
  }

  // --- NATURAL SORTING ---
  cards.sort((a, b) => {
    if (!setId && a.set?.id !== b.set?.id) {
      return String(a.set?.id).localeCompare(String(b.set?.id));
    }

    const numA = String(a.number).split('/')[0].trim();
    const numB = String(b.number).split('/')[0].trim();

    const intA = parseInt(numA, 10);
    const intB = parseInt(numB, 10);

    if (!isNaN(intA) && !isNaN(intB) && /^\d+$/.test(numA) && /^\d+$/.test(numB)) {
      return intA - intB;
    }

    return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // --- NATURAL SORTING ---
  cards.sort((a, b) => { ... });

  // IF IN 3D MODE: Render 3D Carousel and stop early
  if (currentViewMode === '3D') {
    render3DCarousel(cards);
    return;
  }

  // Pull collection data
  const ownedCollection = await db.collection.toArray();
  const ownedMap = new Map(ownedCollection.map(i => [i.cardId, i]));

  // --- FILTER DISPLAY CARDS ---
  // Only process cards that pass the "Show Missing" criteria
  const displayableCards = cards.filter(card => {
    const isOwned = ownedMap.has(card.id);
    return isOwned || showMissing;
  });

  let ownedCount = 0;

  // Render cards to the screen
  displayableCards.forEach(card => {
    const isOwned = ownedMap.has(card.id);
    if (isOwned) ownedCount++;

    const cardEl = document.createElement('div');
    cardEl.className = `card-item ${isOwned ? 'owned' : 'missing'}`;

    const setLabel = !setId && card.set?.name ? `[${card.set.name}] ` : '';

    cardEl.innerHTML = `
      <img src="${card.image}" alt="${card.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/150';">
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

  // --- GUARANTEED MATCH COUNTER ---
  // If "Show Missing" is checked, total equals all Slowbro cards.
  // If unchecked, total equals owned Slowbro cards.
  const totalCardsInSearch = cards.length;
  const renderedCount = displayableCards.length;
  const pct = totalCardsInSearch > 0 ? Math.round((ownedCount / totalCardsInSearch) * 100) : 0;

  progressBar.style.width = `${pct}%`;
  
  if (showMissing) {
    progressText.textContent = `${ownedCount} / ${renderedCount} Cards Collected (${pct}%)`;
    statusMsg.textContent = `Showing all ${renderedCount} matching cards.`;
  } else {
    progressText.textContent = `${ownedCount} / ${totalCardsInSearch} Cards Collected (${pct}%)`;
    statusMsg.textContent = `Showing ${renderedCount} owned cards (hiding missing).`;
  }
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


// --- 3D THREE.JS CAROUSEL ENGINE ---
let scene, camera, renderer, controls;
let cardMeshes = [];
let currentViewMode = '2D'; // '2D' or '3D'

const threeContainer = document.getElementById('three-container');
const btnView2D = document.getElementById('btn-view-2d');
const btnView3D = document.getElementById('btn-view-3d');

// Initialize 3D Environment
function init3DScene() {
  if (scene) return; // Only initialize once

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1015);

  const aspect = threeContainer.clientWidth / threeContainer.clientHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  camera.position.set(0, 0, 12);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  threeContainer.appendChild(renderer.domElement);

  // Add Ambient & Directional Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  // Orbit Controls (Drag to rotate, scroll to zoom)
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2; // Prevent flipping under ground

  // Render Loop
  function animate() {
    requestAnimationFrame(animate);
    if (currentViewMode === '3D') {
      controls.update();
      renderer.render(scene, camera);
    }
  }
  animate();

  // Handle Window Resize
  window.addEventListener('resize', () => {
    if (!renderer) return;
    camera.aspect = threeContainer.clientWidth / threeContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  });
}

// Render Cards in 3D Carousel Arc
function render3DCarousel(cards) {
  init3DScene();

  // Clear existing card meshes
  cardMeshes.forEach(mesh => scene.remove(mesh));
  cardMeshes = [];

  const textureLoader = new THREE.TextureLoader();
  const cardGeometry = new THREE.PlaneGeometry(2.5, 3.5); // Card Aspect Ratio

  const radius = Math.max(8, cards.length * 0.35); // Radius scales with card count
  const angleStep = (Math.PI * 1.2) / Math.max(cards.length, 1);
  const startAngle = -((cards.length - 1) * angleStep) / 2;

  cards.forEach((card, index) => {
    // Load texture dynamically
    const texture = textureLoader.load(card.image);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(cardGeometry, material);

    // Calculate position along carousel arc
    const angle = startAngle + index * angleStep;
    mesh.position.x = Math.sin(angle) * radius;
    mesh.position.z = Math.cos(angle) * radius - radius;
    mesh.position.y = 0;

    // Face toward camera focus
    mesh.rotation.y = angle;

    scene.add(mesh);
    cardMeshes.push(mesh);
  });

  // Reset Camera View
  camera.position.set(0, 0, 12);
  controls.target.set(0, 0, 0);
}

// View Toggle Event Listeners
btnView2D.addEventListener('click', () => {
  currentViewMode = '2D';
  gallery.style.display = 'grid';
  threeContainer.style.display = 'none';
  btnView2D.style.background = '#2b303c';
  btnView3D.style.background = '#1a1d24';
});

btnView3D.addEventListener('click', () => {
  currentViewMode = '3D';
  gallery.style.display = 'none';
  threeContainer.style.display = 'block';
  btnView2D.style.background = '#1a1d24';
  btnView3D.style.background = '#2b303c';

  // Trigger 3D render using current set/search cards
  renderGallery();
});

// Event Listeners
setSelect.addEventListener('change', renderGallery);
searchInput.addEventListener('input', renderGallery);
toggleMissing.addEventListener('change', renderGallery);

// Initialize
loadSets();