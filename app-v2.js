// --- 1. INITIALIZE DEXIE DATABASE ---
const db = new Dexie('PokemonMasterTrackerDB');
db.version(3).stores({
  sets: 'id, name, cardCount',
  cards: 'id, name, number, set.id',
  collection: 'cardId, collectedAt'
});

const FALLBACK_CARD_IMAGE = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='210' viewBox='0 0 150 210'%3E%3Crect width='150' height='210' rx='8' fill='%231f2430' stroke='%233b4050' stroke-width='2'/%3E%3Ctext x='50%25' y='50%25' fill='%239ba1b0' font-family='sans-serif' font-size='13' font-weight='bold' text-anchor='middle' dy='.3em'%3ENo Card Image%3C/text%3E%3C/svg%3E";

// Top 10 Popular Pokémon List for Center Pokéball Showcase
const POPULAR_POKEMON_LIST = [
  { name: 'Pikachu', id: 25, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png', scale: 3.2 },
  { name: 'Charizard', id: 6, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png', scale: 4.5 },
  { name: 'Mewtwo', id: 150, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png', scale: 4.4 },
  { name: 'Gengar', id: 94, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png', scale: 3.8 },
  { name: 'Lucario', id: 448, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png', scale: 4.0 },
  { name: 'Eevee', id: 133, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png', scale: 3.0 },
  { name: 'Rayquaza', id: 384, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/384.png', scale: 5.2 },
  { name: 'Greninja', id: 658, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png', scale: 4.2 },
  { name: 'Garchomp', id: 445, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png', scale: 4.6 },
  { name: 'Snorlax', id: 143, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png', scale: 4.6 }
];

// --- 2. DOM ELEMENTS ---
const setSelect = document.getElementById('set-select');
const searchInput = document.getElementById('search-input');
const toggleMissing = document.getElementById('toggle-missing');
const btnSync = document.getElementById('btn-sync');
const gallery = document.getElementById('card-gallery');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const statusMsg = document.getElementById('status-msg');

const threeWrapper = document.getElementById('three-wrapper');
const threeContainer = document.getElementById('three-container');
const btnView2D = document.getElementById('btn-view-2d');
const btnView3D = document.getElementById('btn-view-3d');
const btnShowcaseMode = document.getElementById('btn-showcase-mode');
const btnResetView = document.getElementById('btn-reset-view');

const hudCardBadge = document.getElementById('hud-card-badge');
const hudCardInput = document.getElementById('hud-card-input');

// Modal Elements
const cardDetailModal = document.getElementById('card-detail-modal');
const btnModalClose = document.getElementById('btn-modal-close');
const modalCardName = document.getElementById('modal-card-name');
const modalCardImg = document.getElementById('modal-card-img');
const modalSetName = document.getElementById('modal-set-name');
const modalCardNumber = document.getElementById('modal-card-number');
const modalCardId = document.getElementById('modal-card-id');
const modalStatus = document.getElementById('modal-status');
const btnModalToggleOwn = document.getElementById('btn-modal-toggle-own');

let activeModalCard = null;

// --- 3. GLOBAL APP STATE & 3D VARIABLES ---
let currentViewMode = '2D';
let scene, camera, renderer, controls;
let cardMeshes = [];
let carouselGroup = null;
let currentTargetRotation = 0;
let carouselRadius = 8;
let currentCardsList = [];
let isShowcaseAutoMode = false; // Auto-scrolls and zooms out to show full set & arena
let currentFocusedIndex = 0;

// Arena Environment Elements
let arenaFloorMesh = null;
let particlesMesh = null;

// 3D Pokéball Spawner Group & State
let spawnerGroup = null;
let pokeballTopHalf = null;
let pokeballBottomHalf = null;
let pokeballBand = null;
let pokeballButton = null;
let energyBeamMesh = null;
let currentPokemonMesh = null;

let spawnPhase = 'ENTER_BALL'; // 'ENTER_BALL', 'SHAKE', 'OPEN_BALL', 'POKEMON_OUT', 'RETURN_BALL'
let spawnTimer = 0;
let currentPokemonIndex = 0;

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

// Helper: Progress Stats
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

  updateProgressStats(cards.length, displayableCards.length);

  // --- 3D MODE ---
  if (currentViewMode === '3D') {
    render3DCarousel(displayableCards, ownedMap);
    statusMsg.textContent = `Displaying ${displayableCards.length} cards in 3D (Toggle Auto-Showcase for automatic tour).`;
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

// --- POKÉBALL STADIUM PROCEDURAL TEXTURE GENERATOR ---
function createPokeballTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const cx = 512;
  const cy = 512;
  const r = 500;

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx, cy, 512, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.fill();

  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(cx - r, cy - 35, r * 2, 70);

  ctx.beginPath();
  ctx.arc(cx, cy, 140, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0f19';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 85, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

// --- 7. THREE.JS 3D CIRCULAR CAROUSEL ENGINE ---
function init3DScene() {
  if (scene) return;

  scene = new THREE.Scene();
  scene.background = null;

  carouselGroup = new THREE.Group();
  scene.add(carouselGroup);

  const aspect = threeContainer.clientWidth / threeContainer.clientHeight || 1;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  camera.position.set(0, 0, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  threeContainer.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.1);
  scene.add(ambientLight);

  const stadiumLight1 = new THREE.DirectionalLight(0xfff0b3, 1.2);
  stadiumLight1.position.set(10, 18, 15);
  scene.add(stadiumLight1);

  const stadiumLight2 = new THREE.DirectionalLight(0x38bdf8, 0.8);
  stadiumLight2.position.set(-10, -10, -10);
  scene.add(stadiumLight2);

  // 1. Procedural Pokéball Floor
  const pokeballTex = createPokeballTexture();
  const floorGeo = new THREE.CircleGeometry(1, 64);
  const floorMat = new THREE.MeshStandardMaterial({
    map: pokeballTex,
    roughness: 0.4,
    metalness: 0.2,
    side: THREE.DoubleSide
  });
  arenaFloorMesh = new THREE.Mesh(floorGeo, floorMat);
  arenaFloorMesh.rotation.x = -Math.PI / 2;
  arenaFloorMesh.position.y = -2.2;
  scene.add(arenaFloorMesh);

  // 2. Floating Energy Particles
  const particleCount = 180;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount * 3; i += 3) {
    particlePositions[i] = (Math.random() - 0.5) * 50;
    particlePositions[i + 1] = (Math.random() - 0.5) * 20;
    particlePositions[i + 2] = (Math.random() - 0.5) * 50;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.15,
    transparent: true,
    opacity: 0.75
  });
  particlesMesh = new THREE.Points(particleGeo, particleMat);
  scene.add(particlesMesh);

  // 3. Construct 3D Animated Center Pokéball
  initCenterPokeballSpawner();

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 3;
  controls.maxDistance = 80;

  updateCameraPosition();

  // Master Animation Loop
  function animate() {
    requestAnimationFrame(animate);
    if (currentViewMode === '3D' && renderer) {

      // Sparkles Drift
      if (particlesMesh) {
        const positions = particlesMesh.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] += 0.015;
          if (positions[i] > 12) positions[i] = -8;
        }
        particlesMesh.geometry.attributes.position.needsUpdate = true;
        particlesMesh.rotation.y += 0.0005;
      }

      // Auto-Showcase continuous slow rotation
      if (isShowcaseAutoMode && carouselGroup) {
        currentTargetRotation -= 0.0025; // Gentle cinematic speed
      }

      // Update Center Pokémon Spawner Cycle
      animatePokeballSpawner();

      // Card Carousel Rotation & Active Card Detection
      if (carouselGroup && cardMeshes.length > 0) {
        carouselGroup.rotation.y += (currentTargetRotation - carouselGroup.rotation.y) * 0.12;

        const twoPi = Math.PI * 2;
        let minAngleDiff = Infinity;
        let activeIdx = 0;

        cardMeshes.forEach((mesh, index) => {
          let currentWorldAngle = (mesh.userData.baseAngle + carouselGroup.rotation.y) % twoPi;
          if (currentWorldAngle > Math.PI) currentWorldAngle -= twoPi;
          if (currentWorldAngle < -Math.PI) currentWorldAngle += twoPi;

          const angleDist = Math.abs(currentWorldAngle);
          if (angleDist < minAngleDiff) {
            minAngleDiff = angleDist;
            activeIdx = index;
          }
        });

        currentFocusedIndex = activeIdx;

        if (cardMeshes[activeIdx] && cardMeshes[activeIdx].userData.cardData) {
          const focusedCard = cardMeshes[activeIdx].userData.cardData;
          if (hudCardBadge && hudCardBadge.style.display !== 'none') {
            hudCardBadge.textContent = `#${focusedCard.number}`;
          }
        }

        // Pull forward when focused (toned down in showcase mode so full arena is visible)
        cardMeshes.forEach((mesh, index) => {
          const isTheFocusedCard = (index === activeIdx);

          const targetScale = isShowcaseAutoMode ? 1.05 : (isTheFocusedCard ? 1.25 : 1.0);
          const pullDistance = isShowcaseAutoMode ? 0.4 : (isTheFocusedCard ? 1.6 : 0.0);

          mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.15);

          const currentRadius = carouselRadius + pullDistance;
          const baseAngle = mesh.userData.baseAngle;

          const targetX = Math.sin(baseAngle) * currentRadius;
          const targetZ = Math.cos(baseAngle) * currentRadius;

          mesh.position.x += (targetX - mesh.position.x) * 0.15;
          mesh.position.z += (targetZ - mesh.position.z) * 0.15;
        });
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

// --- 3D POKÉBALL SPAWNER SYSTEM ---
function initCenterPokeballSpawner() {
  spawnerGroup = new THREE.Group();
  scene.add(spawnerGroup);
  spawnerGroup.position.set(0, -1.2, 0);

  const ballRadius = 0.9;
  
  // Top Red Half
  const topGeo = new THREE.SphereGeometry(ballRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.2 });
  pokeballTopHalf = new THREE.Mesh(topGeo, redMat);
  spawnerGroup.add(pokeballTopHalf);

  // Bottom White Half
  const botGeo = new THREE.SphereGeometry(ballRadius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 });
  pokeballBottomHalf = new THREE.Mesh(botGeo, whiteMat);
  spawnerGroup.add(pokeballBottomHalf);

  // Black Dividing Ring
  const bandGeo = new THREE.CylinderGeometry(ballRadius * 1.01, ballRadius * 1.01, 0.08, 32);
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  pokeballBand = new THREE.Mesh(bandGeo, blackMat);
  spawnerGroup.add(pokeballBand);

  // Center Button
  const btnGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.1, 24);
  btnGeo.rotateX(Math.PI / 2);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  pokeballButton = new THREE.Mesh(btnGeo, btnMat);
  pokeballButton.position.set(0, 0, ballRadius * 0.96);
  spawnerGroup.add(pokeballButton);

  // Cyan Energy Beam
  const beamGeo = new THREE.CylinderGeometry(0.1, 1.2, 3.5, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
  energyBeamMesh = new THREE.Mesh(beamGeo, beamMat);
  energyBeamMesh.position.set(0, 1.6, 0);
  spawnerGroup.add(energyBeamMesh);

  // Load Initial Pokémon Sprite Plane
  loadPokemonShowcaseSprite(POPULAR_POKEMON_LIST[currentPokemonIndex]);
}

function loadPokemonShowcaseSprite(pokemon) {
  if (currentPokemonMesh) {
    spawnerGroup.remove(currentPokemonMesh);
  }

  const textureLoader = new THREE.TextureLoader();
  const spriteTexture = textureLoader.load(pokemon.sprite);
  
  const planeGeo = new THREE.PlaneGeometry(pokemon.scale, pokemon.scale);
  const planeMat = new THREE.MeshBasicMaterial({
    map: spriteTexture,
    transparent: true,
    side: THREE.DoubleSide
  });

  currentPokemonMesh = new THREE.Mesh(planeGeo, planeMat);
  currentPokemonMesh.position.set(0, 1.8, 0);
  currentPokemonMesh.scale.set(0, 0, 0);
  spawnerGroup.add(currentPokemonMesh);
}

function animatePokeballSpawner() {
  if (!spawnerGroup) return;

  spawnTimer += 0.016; // ~60fps delta

  // Always face the active Pokémon plane toward the camera
  if (currentPokemonMesh && camera) {
    currentPokemonMesh.quaternion.copy(camera.quaternion);
  }

  // State Machine for Pokéball Spawn Cycle
  switch (spawnPhase) {
    case 'ENTER_BALL':
      // Pokéball floats in and lands
      spawnerGroup.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      pokeballTopHalf.position.set(0, 0, 0);
      pokeballTopHalf.rotation.x = 0;
      if (spawnTimer > 1.2) {
        spawnPhase = 'SHAKE';
        spawnTimer = 0;
      }
      break;

    case 'SHAKE':
      // Pokéball wiggles left and right
      spawnerGroup.rotation.z = Math.sin(spawnTimer * 18) * 0.25;
      if (spawnTimer > 1.5) {
        spawnerGroup.rotation.z = 0;
        spawnPhase = 'OPEN_BALL';
        spawnTimer = 0;
      }
      break;

    case 'OPEN_BALL':
      // Top half flips open, energy beam erupts
      pokeballTopHalf.position.y = Math.min(0.8, pokeballTopHalf.position.y + 0.05);
      pokeballTopHalf.rotation.x = -Math.min(0.9, pokeballTopHalf.position.y * 1.2);
      energyBeamMesh.material.opacity = Math.min(0.8, energyBeamMesh.material.opacity + 0.08);

      // Scale Pokémon out of the energy beam
      if (currentPokemonMesh) {
        currentPokemonMesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.08);
      }

      if (spawnTimer > 1.2) {
        spawnPhase = 'POKEMON_OUT';
        spawnTimer = 0;
      }
      break;

    case 'POKEMON_OUT':
      // Energy beam fades, Pokémon stands gently floating
      energyBeamMesh.material.opacity = Math.max(0, energyBeamMesh.material.opacity - 0.05);
      pokeballTopHalf.position.y = Math.max(0, pokeballTopHalf.position.y - 0.04);
      pokeballTopHalf.rotation.x = Math.max(0, pokeballTopHalf.rotation.x - 0.05);

      if (currentPokemonMesh) {
        currentPokemonMesh.position.y = 1.8 + Math.sin(spawnTimer * 2.5) * 0.15;
      }

      // Display Pokémon for ~5 seconds
      if (spawnTimer > 5.0) {
        spawnPhase = 'RETURN_BALL';
        spawnTimer = 0;
      }
      break;

    case 'RETURN_BALL':
      // Beam lights up and pulls Pokémon back into Pokéball
      pokeballTopHalf.position.y = Math.min(0.8, pokeballTopHalf.position.y + 0.05);
      energyBeamMesh.material.opacity = Math.min(0.8, energyBeamMesh.material.opacity + 0.08);

      if (currentPokemonMesh) {
        currentPokemonMesh.scale.lerp(new THREE.Vector3(0, 0, 0), 0.12);
      }

      if (spawnTimer > 1.2) {
        // Close ball & switch to next Pokémon
        spawnerGroup.scale.set(0, 0, 0);
        energyBeamMesh.material.opacity = 0;
        pokeballTopHalf.position.set(0, 0, 0);
        pokeballTopHalf.rotation.x = 0;

        currentPokemonIndex = (currentPokemonIndex + 1) % POPULAR_POKEMON_LIST.length;
        loadPokemonShowcaseSprite(POPULAR_POKEMON_LIST[currentPokemonIndex]);

        spawnPhase = 'ENTER_BALL';
        spawnTimer = 0;
      }
      break;
  }
}

function updateCameraPosition() {
  if (!controls || !camera) return;

  if (isShowcaseAutoMode) {
    // Zoomed out elevated stadium view showing full collection ring & arena floor
    controls.enabled = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    
    const showcaseDist = carouselRadius * 2.1 + 10;
    camera.position.set(0, carouselRadius * 0.85 + 4, showcaseDist);
    camera.lookAt(0, 0.5, 0);
    controls.target.set(0, 0.5, 0);
  } else {
    // Normal Focused View
    controls.enabled = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    
    camera.position.set(0, 0, carouselRadius + 11.5);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
  }
}

function render3DCarousel(cards, ownedMap = new Map()) {
  init3DScene();

  cardMeshes.forEach(mesh => carouselGroup.remove(mesh));
  cardMeshes = [];
  currentTargetRotation = 0;
  carouselGroup.rotation.y = 0;
  currentFocusedIndex = 0;

  if (!cards || cards.length === 0) return;

  const textureLoader = new THREE.TextureLoader();
  const cardGeometry = new THREE.PlaneGeometry(2.5, 3.5);

  const count = cards.length;
  const cardWidthWithGap = 3.3;
  carouselRadius = Math.max(5.5, (count * cardWidthWithGap) / (2 * Math.PI));
  const angleStep = (2 * Math.PI) / count;

  if (arenaFloorMesh) {
    const floorScale = carouselRadius * 1.55;
    arenaFloorMesh.scale.set(floorScale, floorScale, 1);
  }

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
    const angle = index * angleStep;

    mesh.userData = { 
      index: index, 
      id: card.id, 
      baseAngle: angle,
      cardData: card
    };

    mesh.position.x = Math.sin(angle) * carouselRadius;
    mesh.position.z = Math.cos(angle) * carouselRadius;
    mesh.position.y = 0;

    mesh.rotation.y = angle;

    carouselGroup.add(mesh);
    cardMeshes.push(mesh);
  });

  updateCameraPosition();
}

// Mouse Wheel: Roll through cards (Shift + Wheel to zoom distance)
threeContainer.addEventListener('wheel', (e) => {
  if (currentViewMode !== '3D' || cardMeshes.length === 0) return;
  e.preventDefault();

  if (e.shiftKey) {
    camera.position.z += e.deltaY * 0.01;
    camera.position.z = Math.max(carouselRadius + 3, Math.min(carouselRadius + 50, camera.position.z));
    return;
  }

  const angleStep = (2 * Math.PI) / cardMeshes.length;
  if (e.deltaY > 0) {
    currentTargetRotation -= angleStep;
  } else {
    currentTargetRotation += angleStep;
  }
}, { passive: false });

// Mobile Touch Handlers (Smooth 50% Slower Swipe)
let touchStartX = 0;
let touchStartY = 0;
let touchLastX = 0;
let isTouching = false;
let touchMoved = false;

threeContainer.addEventListener('touchstart', (e) => {
  if (currentViewMode !== '3D' || cardMeshes.length === 0) return;
  if (e.touches.length > 1) {
    isTouching = false; // Allow OrbitControls pinch-to-zoom
    return;
  }
  if (e.touches.length === 1) {
    isTouching = true;
    touchMoved = false;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchLastX = touchStartX;
  }
}, { passive: true });

threeContainer.addEventListener('touchmove', (e) => {
  if (!isTouching || currentViewMode !== '3D' || cardMeshes.length === 0) return;
  if (e.touches.length === 1) {
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - touchLastX;
    touchLastX = currentX;

    if (Math.abs(currentX - touchStartX) > 6 || Math.abs(e.touches[0].clientY - touchStartY) > 6) {
      touchMoved = true;
    }

    const rotationSensitivity = 0.0028;
    currentTargetRotation += deltaX * rotationSensitivity;
  }
}, { passive: true });

threeContainer.addEventListener('touchend', (e) => {
  if (!isTouching) return;
  isTouching = false;

  if (touchMoved && cardMeshes.length > 0 && !isShowcaseAutoMode) {
    const angleStep = (2 * Math.PI) / cardMeshes.length;
    currentTargetRotation = Math.round(currentTargetRotation / angleStep) * angleStep;
  }
}, { passive: true });

// Raycaster: Click focused card -> Open Details | Click side card -> Spin to front
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

threeContainer.addEventListener('click', async (e) => {
  if (currentViewMode !== '3D' || cardMeshes.length === 0) return;
  
  if (touchMoved) {
    touchMoved = false;
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(cardMeshes);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;
    const clickedIndex = clickedMesh.userData.index;

    if (clickedIndex === currentFocusedIndex) {
      openCardDetailsModal(clickedMesh.userData.cardData, clickedMesh);
    } else {
      const targetAngle = -clickedMesh.userData.baseAngle;
      const currentRot = carouselGroup.rotation.y;
      const diff = Math.atan2(Math.sin(targetAngle - currentRot), Math.cos(targetAngle - currentRot));
      currentTargetRotation = currentRot + diff;
    }
  }
});

// --- 8. JUMP TO CARD VIA HUD BADGE ---
hudCardBadge.addEventListener('click', () => {
  hudCardBadge.style.display = 'none';
  hudCardInput.style.display = 'block';
  hudCardInput.value = '';
  hudCardInput.focus();
});

function jumpToCardNumber(inputVal) {
  const query = inputVal.trim().toLowerCase().replace(/^#/, '');
  if (!query || cardMeshes.length === 0) return;

  let matchIndex = cardMeshes.findIndex(m => {
    const num = String(m.userData.cardData.number).toLowerCase().trim();
    return num === query || num.split('/')[0].trim() === query;
  });

  if (matchIndex === -1 && !isNaN(parseInt(query, 10))) {
    const idx = parseInt(query, 10) - 1;
    if (idx >= 0 && idx < cardMeshes.length) {
      matchIndex = idx;
    }
  }

  if (matchIndex !== -1) {
    const targetMesh = cardMeshes[matchIndex];
    const targetAngle = -targetMesh.userData.baseAngle;
    const currentRot = carouselGroup.rotation.y;
    const diff = Math.atan2(Math.sin(targetAngle - currentRot), Math.cos(targetAngle - currentRot));
    currentTargetRotation = currentRot + diff;
  }
}

hudCardInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    jumpToCardNumber(hudCardInput.value);
    hudCardInput.style.display = 'none';
    hudCardBadge.style.display = 'block';
  } else if (e.key === 'Escape') {
    hudCardInput.style.display = 'none';
    hudCardBadge.style.display = 'block';
  }
});

hudCardInput.addEventListener('blur', () => {
  if (hudCardInput.value.trim() !== '') {
    jumpToCardNumber(hudCardInput.value);
  }
  hudCardInput.style.display = 'none';
  hudCardBadge.style.display = 'block';
});

// --- 9. CARD DETAIL MODAL / INFORMATION LEGEND ---
async function openCardDetailsModal(card, meshRef) {
  activeModalCard = card;
  const isOwned = await db.collection.get(card.id);

  modalCardName.textContent = card.name;
  modalCardImg.src = card.image;
  modalSetName.textContent = card.set?.name || 'Unknown Set';
  modalCardNumber.textContent = `#${card.number}`;
  modalCardId.textContent = card.id;

  updateModalOwnershipUI(Boolean(isOwned));

  btnModalToggleOwn.onclick = async () => {
    const currentlyOwned = Boolean(await db.collection.get(card.id));
    if (currentlyOwned) {
      await db.collection.delete(card.id);
      if (meshRef) meshRef.material.color.setHex(0x282828);
      updateModalOwnershipUI(false);
    } else {
      await db.collection.put({ cardId: card.id, collectedAt: new Date().toISOString() });
      if (meshRef) meshRef.material.color.setHex(0xffffff);
      updateModalOwnershipUI(true);
    }
    updateProgressStats();
  };

  cardDetailModal.style.display = 'flex';
}

function updateModalOwnershipUI(isOwned) {
  if (isOwned) {
    modalStatus.textContent = 'Collected (In Master Set)';
    modalStatus.style.color = '#10b981';
    btnModalToggleOwn.textContent = 'Mark as Missing';
    btnModalToggleOwn.style.backgroundColor = '#ef4444';
  } else {
    modalStatus.textContent = 'Missing';
    modalStatus.style.color = '#9ba1b0';
    btnModalToggleOwn.textContent = 'Mark as Collected';
    btnModalToggleOwn.style.backgroundColor = '#10b981';
  }
}

btnModalClose.addEventListener('click', () => {
  cardDetailModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === cardDetailModal) {
    cardDetailModal.style.display = 'none';
  }
});

// --- 10. UI LISTENERS & TOOLBAR ---
btnShowcaseMode.addEventListener('click', () => {
  isShowcaseAutoMode = !isShowcaseAutoMode;
  if (isShowcaseAutoMode) {
    btnShowcaseMode.classList.add('active');
    btnShowcaseMode.textContent = '⏸ Auto-Showcase: On';
  } else {
    btnShowcaseMode.classList.remove('active');
    btnShowcaseMode.textContent = '▶ Auto-Showcase: Off';
  }
  updateCameraPosition();
});

btnResetView.addEventListener('click', () => {
  isShowcaseAutoMode = false;
  btnShowcaseMode.classList.remove('active');
  btnShowcaseMode.textContent = '▶ Auto-Showcase: Off';
  updateCameraPosition();
});

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
  threeWrapper.style.display = 'none';
  renderGallery();
});

btnView3D.addEventListener('click', () => {
  currentViewMode = '3D';
  btnView3D.classList.add('active');
  btnView2D.classList.remove('active');
  gallery.style.display = 'none';
  threeWrapper.style.display = 'block';
  renderGallery();
});

// App Boot Sequence
loadSets();