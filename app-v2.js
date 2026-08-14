// --- 1. INITIALIZE DEXIE DATABASE ---
const db = new Dexie('PokemonMasterTrackerDB');
db.version(3).stores({
  sets: 'id, name, cardCount',
  cards: 'id, name, number, set.id',
  collection: 'cardId, collectedAt'
});

// Self-contained fallback image
const FALLBACK_CARD_IMAGE = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='210' viewBox='0 0 150 210'%3E%3Crect width='150' height='210' rx='8' fill='%231f2430' stroke='%233b4050' stroke-width='2'/%3E%3Ctext x='50%25' y='50%25' fill='%239ba1b0' font-family='sans-serif' font-size='13' font-weight='bold' text-anchor='middle' dy='.3em'%3ENo Card Image%3C/text%3E%3C/svg%3E";

// --- 2. DOM ELEMENTS ---
const setSelect = document.getElementById('set-select');
const searchInput = document.getElementById('search-input');
const toggleMissing = document.getElementById('toggle-missing');
const btnSync = document.getElementById('btn-sync');
const gallery = document.getElementById('card-gallery');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const statusMsg = document.getElementById('status-msg');

const threeContainer = document.getElementById('three-container');
const btnView2D = document.getElementById('btn-view-2d');
const btnView3D = document.getElementById('btn-view-3d');

// --- 3. GLOBAL APP STATE & 3D VARIABLES ---
let currentViewMode = '2D'; // '2D' or '3D'
let scene, camera, renderer, controls;
let cardMeshes = [];
let carouselGroup = null; // Container group to spin the ring
let currentTargetRotation = 0;
let carouselRadius = 8;
let currentCardsList = [];

// Helper API Fetcher
async function apiFetch(endpoint) {
  const res = await fetch(`https://api.tcgdex.net/v2/en${endpoint}`);
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  return await res.json();
}

// --- 4. LOAD SETS DROPDOWN ---
async function loadSets() {
  statusMsg.textContent = 'Checking local sets database...';
  let localSets = await db.sets.toArray();

  if (localSets.length === 0) {
    statusMsg.textContent = 'Fetching sets from TCGdex...';
    try {
      const sets = await apiFetch('/sets');
      
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

  localSets.sort((a, b) => a.name.localeCompare(b.name));

  const currentSelection = setSelect.value;
  setSelect.innerHTML = '<option value="">-- Select a Set --</option>';
  
  localSets.forEach(set => {
    const opt = document.createElement('option');
    opt.value = set.id;
    opt.textContent = `${set.name} (${set.cardCount} cards)`;
    setSelect.appendChild(opt);
  });

  if (currentSelection) {
    setSelect.value = currentSelection;
  }
}

// --- 5. SYNC SET DATA FROM TCGDEX ---
btnSync.addEventListener('click', async () => {
  const setId = setSelect.value;
  if (!setId) return alert('Please select a set first!');

  statusMsg.textContent = `Syncing set: ${setId}...`;

  try {
    const setDetails = await apiFetch(`/sets/${setId}`);
    const rawCards = setDetails.cards || [];

    const formattedCards = rawCards.map(c => {
      const extractedNumber = c.localId || (c.id ? c.id.split('-').pop() : '0');

      return {
        id: c.id,
        name: c.name,
        number: String(extractedNumber).trim(),
        image: c.image ? `${c.image}/low.webp` : FALLBACK_CARD_IMAGE,
        set: { id: setId, name: setDetails.name }
      };
    });

    await db.cards.bulkPut(formattedCards);
    statusMsg.textContent = `Saved ${formattedCards.length} cards locally!`;

    renderGallery();
  } catch (err) {
    console.error('SYNC ERROR:', err);
    statusMsg.textContent = 'Sync failed. Check connection.';
  }
});

// Helper to update progress bar without re-rendering the whole page
async function updateProgressStats(totalCardsInSearch, displayableCount) {
  const ownedCollection = await db.collection.toArray();
  const ownedSet = new Set(ownedCollection.map(i => i.cardId));

  let ownedCount = 0;
  currentCardsList.forEach(c => {
    if (ownedSet.has(c.id)) ownedCount++;
  });

  const total = totalCardsInSearch || currentCardsList.length;
  const pct = total > 0 ? Math.round((ownedCount / total) * 100) : 0;

  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${ownedCount} / ${total} Cards Collected (${pct}%)`;
}

// --- 6. RENDER CARD GALLERY (2D / 3D SWITCH) ---
async function renderGallery() {
  const setId = setSelect.value;
  const searchQuery = searchInput.value.toLowerCase().trim();
  const showMissing = toggleMissing.checked;

  gallery.innerHTML = '';

  if (!setId && !searchQuery) {
    statusMsg.textContent = 'Select a set or type a Pokémon name to search across all sets.';
    progressBar.style.width = '0%';
    progressText.textContent = '0 / 0 Cards Collected (0%)';
    if (currentViewMode === '3D') render3DCarousel([], new Map());
    return;
  }

  let cards = [];

  // GLOBAL SEARCH MODE
  if (searchQuery && !setId) {
    statusMsg.textContent = `Searching TCGdex for "${searchQuery}"...`;
    
    try {
      const apiResults = await apiFetch(`/cards?name=${encodeURIComponent(searchQuery)}`);
      
      const matchedCards = apiResults.filter(c => 
        c && c.name && c.name.toLowerCase().includes(searchQuery)
      );

      cards = matchedCards.map(c => {
        const idParts = c.id ? c.id.split('-') : ['unknown', '0'];
        const setCode = idParts[0].toUpperCase();
        const cardNumber = idParts.length > 1 ? idParts.slice(1).join('-') : (c.localId || '0');

        return {
          id: c.id,
          name: c.name,
          number: String(cardNumber).trim(),
          image: c.image ? `${c.image}/low.webp` : FALLBACK_CARD_IMAGE,
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
  // SINGLE SET MODE
  else if (setId) {
    cards = await db.cards.where('set.id').equals(setId).toArray();
    if (searchQuery) {
      cards = cards.filter(c => c.name.toLowerCase().includes(searchQuery));
    }
  }

  // NATURAL SORTING
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

  currentCardsList = cards;

  const ownedCollection = await db.collection.toArray();
  const ownedMap = new Map(ownedCollection.map(i => [i.cardId, i]));

  const displayableCards = cards.filter(card => {
    const isOwned = ownedMap.has(card.id);
    return isOwned || showMissing;
  });

  // Update initial progress stats
  updateProgressStats(cards.length, displayableCards.length);

  // --- 3D MODE ---
  if (currentViewMode === '3D') {
    render3DCarousel(displayableCards, ownedMap);
    statusMsg.textContent = `Displaying ${displayableCards.length} cards in 3D Carousel (Use mouse wheel to spin).`;
    return;
  }

  // --- 2D MODE ---
  displayableCards.forEach(card => {
    const isOwned = ownedMap.has(card.id);

    const cardEl = document.createElement('div');
    cardEl.className = `card-item ${isOwned ? 'owned' : 'missing'}`;
    cardEl.dataset.cardId = card.id;

    const setLabel = !setId && card.set?.name ? `[${card.set.name}] ` : '';

    cardEl.innerHTML = `
      <img src="${card.image}" alt="${card.name}" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_CARD_IMAGE}';">
      <div style="margin-top:6px; font-weight:bold; font-size:0.8rem;">
        ${card.name} (${setLabel}#${card.number})
      </div>
    `;

    // IN-PLACE TOGGLE (No page jumping!)
    cardEl.addEventListener('click', async () => {
      const nowOwned = cardEl.classList.contains('owned');
      if (nowOwned) {
        await db.collection.delete(card.id);
        cardEl.classList.remove('owned');
        cardEl.classList.add('missing');
        if (!showMissing) cardEl.remove();
      } else {
        await db.collection.put({ cardId: card.id, collectedAt: new Date().toISOString() });
        cardEl.classList.remove('missing');
        cardEl.classList.add('owned');
      }
      updateProgressStats(cards.length, displayableCards.length);
    });

    gallery.appendChild(cardEl);
  });

  statusMsg.textContent = `Displaying ${displayableCards.length} cards.`;
}

// --- 7. THREE.JS 3D CIRCULAR CAROUSEL ENGINE ---
function init3DScene() {
  if (scene) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1015);

  carouselGroup = new THREE.Group();
  scene.add(carouselGroup);

  const aspect = threeContainer.clientWidth / threeContainer.clientHeight || 1;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  camera.position.set(0, 0, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  threeContainer.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(5, 12, 10);
  scene.add(dirLight);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Smooth rotation animation loop
  function animate() {
    requestAnimationFrame(animate);
    if (currentViewMode === '3D' && renderer) {
      if (carouselGroup) {
        carouselGroup.rotation.y += (currentTargetRotation - carouselGroup.rotation.y) * 0.1;
      }
      controls.update();
      renderer.render(scene, camera);
    }
  }
  animate();

  window.addEventListener('resize', () => {
    if (!renderer) return;
    camera.aspect = threeContainer.clientWidth / threeContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  });
}

function render3DCarousel(cards, ownedMap = new Map()) {
  init3DScene();

  // Clear existing meshes
  cardMeshes.forEach(mesh => carouselGroup.remove(mesh));
  cardMeshes = [];
  currentTargetRotation = 0;
  carouselGroup.rotation.y = 0;

  if (!cards || cards.length === 0) return;

  const textureLoader = new THREE.TextureLoader();
  const cardGeometry = new THREE.PlaneGeometry(2.5, 3.5);

  const count = cards.length;
  // Calculate dynamic radius based on card count so spacing is always even
  const cardWidthWithGap = 3.2;
  carouselRadius = Math.max(5.5, (count * cardWidthWithGap) / (2 * Math.PI));
  const angleStep = (2 * Math.PI) / count;

  cards.forEach((card, index) => {
    const isOwned = ownedMap.has(card.id);
    const texture = textureLoader.load(card.image);

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.1,
      color: isOwned ? new THREE.Color(0xffffff) : new THREE.Color(0x282828)
    });

    const mesh = new THREE.Mesh(cardGeometry, material);
    mesh.userData = { index: index, id: card.id, angle: index * angleStep };

    const angle = index * angleStep;
    mesh.position.x = Math.sin(angle) * carouselRadius;
    mesh.position.z = Math.cos(angle) * carouselRadius;
    mesh.position.y = 0;

    // Face outward from center
    mesh.rotation.y = angle;

    carouselGroup.add(mesh);
    cardMeshes.push(mesh);
  });

  // Position camera just outside the ring looking at the front card
  camera.position.set(0, 0, carouselRadius + 7.5);
  controls.target.set(0, 0, 0);
}

// Wheel listener to roll the circular carousel
threeContainer.addEventListener('wheel', (e) => {
  if (currentViewMode !== '3D' || cardMeshes.length === 0) return;
  e.preventDefault();

  const angleStep = (2 * Math.PI) / cardMeshes.length;
  if (e.deltaY > 0) {
    currentTargetRotation -= angleStep;
  } else {
    currentTargetRotation += angleStep;
  }
}, { passive: false });

// Click on 3D card to toggle collection status in 3D
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

threeContainer.addEventListener('click', async (e) => {
  if (currentViewMode !== '3D' || cardMeshes.length === 0) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(cardMeshes);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;
    const cardId = clickedMesh.userData.id;
    
    // Rotate clicked card to the front
    const targetAngle = -clickedMesh.userData.angle;
    // Find closest rotation offset
    const currentRot = carouselGroup.rotation.y;
    const diff = (targetAngle - currentRot) % (2 * Math.PI);
    currentTargetRotation = currentRot + diff;

    // Toggle ownership in IndexedDB
    const isOwned = await db.collection.get(cardId);
    if (isOwned) {
      await db.collection.delete(cardId);
      clickedMesh.material.color.setHex(0x282828);
    } else {
      await db.collection.put({ cardId: cardId, collectedAt: new Date().toISOString() });
      clickedMesh.material.color.setHex(0xffffff);
    }
    updateProgressStats();
  }
});

// --- 8. UI LISTENERS & SWITCHERS ---
setSelect.addEventListener('change', renderGallery);

searchInput.addEventListener('input', () => {
  if (searchInput.value.trim() === '' && !setSelect.value) {
    gallery.innerHTML = '';
    progressBar.style.width = '0%';
    progressText.textContent = '0 / 0 Cards Collected (0%)';
    statusMsg.textContent = 'Select a set or type a Pokémon name.';
    if (currentViewMode === '3D') render3DCarousel([], new Map());
  } else {
    renderGallery();
  }
});

toggleMissing.addEventListener('change', renderGallery);

btnView2D.addEventListener('click', () => {
  currentViewMode = '2D';
  btnView2D.classList.add('active');
  btnView3D.classList.remove('active');
  gallery.style.display = 'grid';
  threeContainer.style.display = 'none';
  renderGallery();
});

btnView3D.addEventListener('click', () => {
  currentViewMode = '3D';
  btnView3D.classList.add('active');
  btnView2D.classList.remove('active');
  gallery.style.display = 'none';
  threeContainer.style.display = 'block';
  renderGallery();
});

// App Boot Sequence
loadSets();