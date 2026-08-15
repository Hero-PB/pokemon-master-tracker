// --- 1. INITIALIZE DEXIE DATABASE ---
const db = new Dexie('PokemonMasterTrackerDB');
db.version(4).stores({
  sets: 'id, name, cardCount',
  cards: 'id, name, number, set.id',
  collection: 'cardId, collectedAt',
  variantCollection: '[cardId+variant], cardId, variant, collectedAt'
});

const FALLBACK_CARD_IMAGE = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='210' viewBox='0 0 150 210'%3E%3Crect width='150' height='210' rx='8' fill='%231f2430' stroke='%233b4050' stroke-width='2'/%3E%3Ctext x='50%25' y='50%25' fill='%239ba1b0' font-family='sans-serif' font-size='13' font-weight='bold' text-anchor='middle' dy='.3em'%3ENo Card Image%3C/text%3E%3C/svg%3E";

// TCGdex Variant Badge Configuration
const VARIANT_BADGE_MAP = {
  normal: { symbol: 'N', name: 'Normal / Regular', color: '#6b7280' },
  reverse: { symbol: 'R', name: 'Reverse Holo', color: '#8b5cf6' },
  holo: { symbol: 'H', name: 'Holo Rare', color: '#38bdf8' },
  firstEdition: { symbol: '1st', name: '1st Edition', color: '#f59e0b' },
  wPromo: { symbol: 'W', name: 'W Promo', color: '#ec4899' }
};

// Top 10 Popular Pokémon List for Showcase
const POPULAR_POKEMON_LIST = [
  { name: 'Pikachu', id: 25, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png', scaleMultiplier: 0.50 },
  { name: 'Charizard', id: 6, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png', scaleMultiplier: 0.70 },
  { name: 'Mewtwo', id: 150, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png', scaleMultiplier: 0.65 },
  { name: 'Gengar', id: 94, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png', scaleMultiplier: 0.55 },
  { name: 'Lucario', id: 448, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png', scaleMultiplier: 0.60 },
  { name: 'Eevee', id: 133, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png', scaleMultiplier: 0.45 },
  { name: 'Rayquaza', id: 384, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/384.png', scaleMultiplier: 0.78 },
  { name: 'Greninja', id: 658, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png', scaleMultiplier: 0.60 },
  { name: 'Garchomp', id: 445, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png', scaleMultiplier: 0.68 },
  { name: 'Snorlax', id: 143, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png', scaleMultiplier: 0.65 }
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
const btnLockCamera = document.getElementById('btn-lock-camera');
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
const modalVariantsList = document.getElementById('modal-variants-list');

let activeModalCard = null;

// --- 3. GLOBAL APP STATE & 3D VARIABLES ---
let currentViewMode = '2D';
let scene, camera, renderer, controls;
let cardMeshes = [];
let carouselGroup = null;
let currentTargetRotation = 0;
let carouselRadius = 8;
let currentCardsList = [];
let isCameraLocked = true;
let isShowcaseAutoMode = false;
let currentFocusedIndex = 0;

// Arena Environment
let arenaFloorMesh = null;
let ambientParticlesMesh = null;

// 3D Pokéball Spawner
let spawnerGroup = null;
let pokeballTopHalf = null;
let pokeballBottomHalf = null;
let pokeballBand = null;
let pokeballButton = null;
let currentPokemonMesh = null;
let summonParticlesMesh = null;
let summonParticleVelocities = [];

let spawnPhase = 'ENTER_BALL';
let spawnTimer = 0;
let currentPokemonIndex = 0;

// Helper API Fetcher
async function apiFetch(endpoint) {
  const res = await fetch(`https://api.tcgdex.net/v2/en${endpoint}`);
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  return await res.json();
}

// Helper: Extract valid printable variants
function getCardAvailableVariants(card) {
  if (!card || !card.variants) {
    return ['normal'];
  }
  const keys = Object.keys(card.variants).filter(k => card.variants[k] === true);
  return keys.length > 0 ? keys : ['normal'];
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

// --- 5. BATCH SYNC SET DATA WITH VARIANTS ---
btnSync.addEventListener('click', async () => {
  const setId = setSelect.value;
  if (!setId) return alert('Please select a set first!');

  btnSync.disabled = true;
  statusMsg.textContent = `Fetching card list for ${setId}...`;

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
        set: { id: setId, name: setDetails.name },
        variants: c.variants || null
      };
    });

    await db.cards.bulkPut(formattedCards);
    renderGallery();

    const BATCH_SIZE = 8;
    let completedCount = 0;

    for (let i = 0; i < formattedCards.length; i += BATCH_SIZE) {
      const batch = formattedCards.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (card) => {
        try {
          let details = null;
          try {
            details = await apiFetch(`/cards/${card.id}`);
          } catch (e) {
            if (card.set?.id && card.number) {
              details = await apiFetch(`/sets/${card.set.id}/${card.number}`);
            }
          }

          if (details && details.variants) {
            card.variants = details.variants;
            await db.cards.put(card);
          }
        } catch (err) {
          console.warn(`Could not sync variant for ${card.id}:`, err);
        }
        completedCount++;
      }));

      statusMsg.textContent = `Syncing variants: ${completedCount} / ${formattedCards.length} cards...`;
    }

    statusMsg.textContent = `Successfully synced all ${formattedCards.length} cards with full variants!`;
    renderGallery();
  } catch (err) {
    console.error('SYNC ERROR:', err);
    statusMsg.textContent = 'Sync failed. Please check your internet connection.';
  } finally {
    btnSync.disabled = false;
  }
});

// Helper: Progress Stats (Variant-Aware)
async function updateProgressStats() {
  const userVariants = await db.variantCollection.toArray();
  const ownedVariantKeys = new Set(userVariants.map(v => `${v.cardId}::${v.variant}`));

  const legacyOwned = await db.collection.toArray();
  legacyOwned.forEach(lo => {
    ownedVariantKeys.add(`${lo.cardId}::normal`);
  });

  let totalAvailableVariantsCount = 0;
  let collectedVariantsCount = 0;

  currentCardsList.forEach(c => {
    const availVariants = getCardAvailableVariants(c);
    totalAvailableVariantsCount += availVariants.length;
    availVariants.forEach(vName => {
      if (ownedVariantKeys.has(`${c.id}::${vName}`)) {
        collectedVariantsCount++;
      }
    });
  });

  const pct = totalAvailableVariantsCount > 0 ? Math.round((collectedVariantsCount / totalAvailableVariantsCount) * 100) : 0;

  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${collectedVariantsCount} / ${totalAvailableVariantsCount} Variants Collected (${pct}%)`;
}

// --- 6. RENDER CARD GALLERY (WITH NAME-SEARCH VARIANT AUTO-FETCH) ---
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

  // GLOBAL POKÉMON SEARCH MODE
  if (searchQuery && !setId) {
    statusMsg.textContent = `Searching TCGdex for "${searchQuery}"...`;
    
    try {
      const apiResults = await apiFetch(`/cards?name=${encodeURIComponent(searchQuery)}`);
      
      const matchedCards = apiResults.filter(c => 
        c && c.name && c.name.toLowerCase().includes(searchQuery)
      );

      // 1. Fetch locally cached records to preserve already downloaded variants
      const existingLocalCards = await db.cards.where('id').anyOf(matchedCards.map(c => c.id)).toArray();
      const localCardMap = new Map(existingLocalCards.map(c => [c.id, c]));

      cards = matchedCards.map(c => {
        const cached = localCardMap.get(c.id);
        const idParts = c.id ? c.id.split('-') : ['unknown', '0'];
        const setCode = idParts[0].toUpperCase();
        const cardNumber = idParts.length > 1 ? idParts.slice(1).join('-') : (c.localId || '0');

        return {
          id: c.id,
          name: c.name,
          number: String(cardNumber).trim(),
          image: c.image ? `${c.image}/low.webp` : FALLBACK_CARD_IMAGE,
          set: { id: idParts[0], name: setCode },
          variants: (cached && cached.variants) ? cached.variants : null
        };
      });

      // 2. Identify cards that still need variant details
      const missingVariantCards = cards.filter(c => !c.variants);

      if (missingVariantCards.length > 0) {
        statusMsg.textContent = `Found ${cards.length} cards. Fetching variants (${missingVariantCards.length} to load)...`;

        const BATCH_SIZE = 8;
        for (let i = 0; i < missingVariantCards.length; i += BATCH_SIZE) {
          const batch = missingVariantCards.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (c) => {
            try {
              let details = null;
              try {
                details = await apiFetch(`/cards/${c.id}`);
              } catch (err1) {
                if (c.set?.id && c.number) {
                  details = await apiFetch(`/sets/${c.set.id}/${c.number}`);
                }
              }
              if (details && details.variants) {
                c.variants = details.variants;
              }
            } catch (err) {
              console.warn(`Could not load variant for ${c.id}`, err);
            }
          }));
        }
      }

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

  // Build Collection Map
  const userVariants = await db.variantCollection.toArray();
  const ownedVariantKeys = new Set(userVariants.map(v => `${v.cardId}::${v.variant}`));

  const legacyOwned = await db.collection.toArray();
  legacyOwned.forEach(lo => {
    ownedVariantKeys.add(`${lo.cardId}::normal`);
  });

  const cardStatusMap = new Map();
  cards.forEach(c => {
    const availVariants = getCardAvailableVariants(c);
    let ownedCount = 0;
    availVariants.forEach(vName => {
      if (ownedVariantKeys.has(`${c.id}::${vName}`)) ownedCount++;
    });

    if (ownedCount === 0) {
      cardStatusMap.set(c.id, { status: 'none', ownedCount, total: availVariants.length });
    } else if (ownedCount === availVariants.length) {
      cardStatusMap.set(c.id, { status: 'completed', ownedCount, total: availVariants.length });
    } else {
      cardStatusMap.set(c.id, { status: 'partial', ownedCount, total: availVariants.length });
    }
  });

  const displayableCards = cards.filter(card => {
    const statusObj = cardStatusMap.get(card.id);
    const hasAny = statusObj && statusObj.status !== 'none';
    return hasAny || showMissing;
  });

  updateProgressStats();

  if (currentViewMode === '3D') {
    render3DCarousel(displayableCards, cardStatusMap);
    statusMsg.textContent = `Displaying ${displayableCards.length} cards in 3D.`;
    return;
  }

  // 2D Grid Render
  displayableCards.forEach(card => {
    const statusObj = cardStatusMap.get(card.id) || { status: 'none', ownedCount: 0, total: 1 };
    const availVariants = getCardAvailableVariants(card);

    const cardEl = document.createElement('div');
    
    if (statusObj.status === 'completed') {
      cardEl.className = 'card-item completed';
    } else if (statusObj.status === 'partial') {
      cardEl.className = 'card-item owned';
    } else {
      cardEl.className = 'card-item missing';
    }
    cardEl.dataset.cardId = card.id;

    const setLabel = !setId && card.set?.name ? `[${card.set.name}] ` : '';

    let badgesHTML = '<div class="card-variants-badges">';
    availVariants.forEach(v => {
      const isOwned = ownedVariantKeys.has(`${card.id}::${v}`);
      const badgeInfo = VARIANT_BADGE_MAP[v] || { symbol: v.slice(0, 3), name: v };
      badgesHTML += `<span class="badge-variant ${isOwned ? 'owned' : 'missing'}" data-variant="${v}" title="${badgeInfo.name}">${badgeInfo.symbol}</span>`;
    });
    badgesHTML += '</div>';

    cardEl.innerHTML = `
      ${badgesHTML}
      <img src="${card.image}" alt="${card.name}" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_CARD_IMAGE}';">
      <div style="margin-top:6px; font-weight:bold; font-size:0.8rem;">
        ${card.name} (${setLabel}#${card.number})
      </div>
    `;

    cardEl.addEventListener('click', () => {
      openCardDetailsModal(card, null);
    });

    gallery.appendChild(cardEl);
  });

  statusMsg.textContent = `Displaying ${displayableCards.length} cards.`;
}

// --- POKÉBALL STADIUM TEXTURE GENERATOR ---
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
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1500);
  camera.position.set(0, 0, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  threeContainer.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.25);
  scene.add(ambientLight);

  const stadiumLight1 = new THREE.DirectionalLight(0xfff0b3, 1.3);
  stadiumLight1.position.set(10, 30, 25);
  scene.add(stadiumLight1);

  const stadiumLight2 = new THREE.DirectionalLight(0x38bdf8, 0.9);
  stadiumLight2.position.set(-20, -10, -20);
  scene.add(stadiumLight2);

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

  const ambientCount = 200;
  const ambientGeo = new THREE.BufferGeometry();
  const ambientPos = new Float32Array(ambientCount * 3);

  for (let i = 0; i < ambientCount * 3; i += 3) {
    ambientPos[i] = (Math.random() - 0.5) * 120;
    ambientPos[i + 1] = (Math.random() - 0.5) * 45;
    ambientPos[i + 2] = (Math.random() - 0.5) * 120;
  }

  ambientGeo.setAttribute('position', new THREE.BufferAttribute(ambientPos, 3));
  const ambientMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.25,
    transparent: true,
    opacity: 0.75
  });
  ambientParticlesMesh = new THREE.Points(ambientGeo, ambientMat);
  scene.add(ambientParticlesMesh);

  initCenterPokeballSpawner();

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 3;
  controls.maxDistance = 600;

  applyViewMode();

  function animate() {
    requestAnimationFrame(animate);
    if (currentViewMode === '3D' && renderer) {

      if (ambientParticlesMesh) {
        const positions = ambientParticlesMesh.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] += 0.02;
          if (positions[i] > 25) positions[i] = -10;
        }
        ambientParticlesMesh.geometry.attributes.position.needsUpdate = true;
        ambientParticlesMesh.rotation.y += 0.0005;
      }

      if (isShowcaseAutoMode && carouselGroup) {
        currentTargetRotation -= 0.0022;
      }

      if (isShowcaseAutoMode) {
        animatePokeballSpawner();
      }

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

        cardMeshes.forEach((mesh, index) => {
          const isTheFocusedCard = (index === activeIdx);

          const targetScale = isShowcaseAutoMode ? 1.0 : (isTheFocusedCard ? 1.25 : 1.0);
          const pullDistance = isShowcaseAutoMode ? 0.0 : (isTheFocusedCard ? 1.6 : 0.0);

          mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.15);

          const currentRadius = carouselRadius + pullDistance;
          const baseAngle = mesh.userData.baseAngle;

          const targetX = Math.sin(baseAngle) * currentRadius;
          const targetZ = Math.cos(baseAngle) * currentRadius;

          mesh.position.x += (targetX - mesh.position.x) * 0.15;
          mesh.position.z += (targetZ - mesh.position.z) * 0.15;
        });
      }

      if (!isCameraLocked || isShowcaseAutoMode) {
        controls.update();
      }
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

function initCenterPokeballSpawner() {
  spawnerGroup = new THREE.Group();
  scene.add(spawnerGroup);
  spawnerGroup.position.set(0, -1.8, 0);
  spawnerGroup.visible = false;

  const ballRadius = Math.max(1.0, carouselRadius * 0.045);
  
  const topGeo = new THREE.SphereGeometry(ballRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.25, metalness: 0.2 });
  pokeballTopHalf = new THREE.Mesh(topGeo, redMat);
  spawnerGroup.add(pokeballTopHalf);

  const botGeo = new THREE.SphereGeometry(ballRadius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.2 });
  pokeballBottomHalf = new THREE.Mesh(botGeo, whiteMat);
  spawnerGroup.add(pokeballBottomHalf);

  const bandGeo = new THREE.CylinderGeometry(ballRadius * 1.01, ballRadius * 1.01, 0.1, 32);
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  pokeballBand = new THREE.Mesh(bandGeo, blackMat);
  spawnerGroup.add(pokeballBand);

  const btnGeo = new THREE.CylinderGeometry(ballRadius * 0.32, ballRadius * 0.32, 0.12, 24);
  btnGeo.rotateX(Math.PI / 2);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  pokeballButton = new THREE.Mesh(btnGeo, btnMat);
  pokeballButton.position.set(0, 0, ballRadius * 0.96);
  spawnerGroup.add(pokeballButton);

  const pCount = 140;
  const summonGeo = new THREE.BufferGeometry();
  const summonPos = new Float32Array(pCount * 3);
  summonParticleVelocities = [];

  for (let i = 0; i < pCount; i++) {
    summonPos[i * 3] = 0;
    summonPos[i * 3 + 1] = 0;
    summonPos[i * 3 + 2] = 0;
    summonParticleVelocities.push({
      vx: (Math.random() - 0.5) * (carouselRadius * 0.03),
      vy: Math.random() * (carouselRadius * 0.04) + 0.15,
      vz: (Math.random() - 0.5) * (carouselRadius * 0.03)
    });
  }

  summonGeo.setAttribute('position', new THREE.BufferAttribute(summonPos, 3));
  const summonMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.45,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
  });
  summonParticlesMesh = new THREE.Points(summonGeo, summonMat);
  summonParticlesMesh.position.set(0, 0.4, 0);
  spawnerGroup.add(summonParticlesMesh);

  loadPokemonShowcaseSprite(POPULAR_POKEMON_LIST[currentPokemonIndex]);
}

function loadPokemonShowcaseSprite(pokemon) {
  if (currentPokemonMesh) {
    spawnerGroup.remove(currentPokemonMesh);
  }

  const textureLoader = new THREE.TextureLoader();
  const spriteTexture = textureLoader.load(pokemon.sprite);
  
  const dynamicSize = carouselRadius * (pokemon.scaleMultiplier || 0.60);

  const planeGeo = new THREE.PlaneGeometry(dynamicSize, dynamicSize);
  const planeMat = new THREE.MeshBasicMaterial({
    map: spriteTexture,
    transparent: true,
    side: THREE.DoubleSide
  });

  currentPokemonMesh = new THREE.Mesh(planeGeo, planeMat);
  currentPokemonMesh.position.set(0, dynamicSize * 0.55 + (carouselRadius * 0.12), 0);
  currentPokemonMesh.scale.set(0, 0, 0);
  spawnerGroup.add(currentPokemonMesh);
}

function animatePokeballSpawner() {
  if (!spawnerGroup || !spawnerGroup.visible) return;

  spawnTimer += 0.016;

  if (currentPokemonMesh && camera) {
    currentPokemonMesh.quaternion.copy(camera.quaternion);
  }

  if (summonParticlesMesh && summonParticlesMesh.material.opacity > 0) {
    const pos = summonParticlesMesh.geometry.attributes.position.array;
    for (let i = 0; i < summonParticleVelocities.length; i++) {
      const v = summonParticleVelocities[i];
      pos[i * 3] += v.vx;
      pos[i * 3 + 1] += v.vy;
      pos[i * 3 + 2] += v.vz;

      v.vx += (Math.random() - 0.5) * 0.015;
      v.vz += (Math.random() - 0.5) * 0.015;
    }
    summonParticlesMesh.geometry.attributes.position.needsUpdate = true;
  }

  const liftHeight = Math.max(1.0, carouselRadius * 0.08);

  switch (spawnPhase) {
    case 'ENTER_BALL':
      spawnerGroup.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      pokeballTopHalf.position.set(0, 0, 0);
      pokeballTopHalf.rotation.x = 0;
      if (spawnTimer > 1.0) {
        spawnPhase = 'SHAKE';
        spawnTimer = 0;
      }
      break;

    case 'SHAKE':
      spawnerGroup.rotation.z = Math.sin(spawnTimer * 20) * 0.2;
      if (spawnTimer > 1.4) {
        spawnerGroup.rotation.z = 0;
        spawnPhase = 'OPEN_BALL';
        spawnTimer = 0;

        summonParticlesMesh.material.opacity = 1.0;
        const pos = summonParticlesMesh.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i++) pos[i] = 0;
      }
      break;

    case 'OPEN_BALL':
      pokeballTopHalf.position.y = Math.min(liftHeight, pokeballTopHalf.position.y + 0.06);
      pokeballTopHalf.rotation.x = -Math.min(1.2, pokeballTopHalf.position.y * 1.2);

      if (currentPokemonMesh) {
        currentPokemonMesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.07);
      }

      if (spawnTimer > 1.5) {
        spawnPhase = 'POKEMON_OUT';
        spawnTimer = 0;
      }
      break;

    case 'POKEMON_OUT':
      summonParticlesMesh.material.opacity = Math.max(0, summonParticlesMesh.material.opacity - 0.04);
      pokeballTopHalf.position.y = Math.max(0, pokeballTopHalf.position.y - 0.04);
      pokeballTopHalf.rotation.x = Math.max(0, pokeballTopHalf.rotation.x - 0.04);

      if (currentPokemonMesh) {
        const dynamicSize = carouselRadius * (POPULAR_POKEMON_LIST[currentPokemonIndex].scaleMultiplier || 0.60);
        const baseH = dynamicSize * 0.55 + (carouselRadius * 0.12);
        currentPokemonMesh.position.y = baseH + Math.sin(spawnTimer * 2.2) * (carouselRadius * 0.015);
      }

      if (spawnTimer > 6.0) {
        spawnPhase = 'RETURN_BALL';
        spawnTimer = 0;
        summonParticlesMesh.material.opacity = 1.0;
      }
      break;

    case 'RETURN_BALL':
      pokeballTopHalf.position.y = Math.min(liftHeight, pokeballTopHalf.position.y + 0.06);

      if (currentPokemonMesh) {
        currentPokemonMesh.scale.lerp(new THREE.Vector3(0, 0, 0), 0.12);
      }

      if (spawnTimer > 1.3) {
        spawnerGroup.scale.set(0, 0, 0);
        summonParticlesMesh.material.opacity = 0;
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

function applyViewMode() {
  if (!controls || !camera) return;

  if (isShowcaseAutoMode) {
    controls.enabled = true;
    controls.enableRotate = true;
    controls.enableZoom = true;

    if (spawnerGroup) spawnerGroup.visible = true;

    const camY = carouselRadius * 0.78 + 4;
    const camZ = carouselRadius * 1.82 + 10;
    
    const targetY = carouselRadius * 0.08;
    const targetZ = 0;

    camera.position.set(0, camY, camZ);
    camera.lookAt(0, targetY, targetZ);
    controls.target.set(0, targetY, targetZ);

  } else {
    if (spawnerGroup) {
      spawnerGroup.visible = false;
      if (currentPokemonMesh) currentPokemonMesh.scale.set(0, 0, 0);
    }

    if (isCameraLocked) {
      controls.enabled = false;
      camera.position.set(0, 0, carouselRadius + 11.5);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
    } else {
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enableZoom = true;
    }
  }
}

function render3DCarousel(cards, cardStatusMap = new Map()) {
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
  carouselRadius = Math.max(6.5, (count * cardWidthWithGap) / (2 * Math.PI));
  const angleStep = (2 * Math.PI) / count;

  if (arenaFloorMesh) {
    const floorScale = carouselRadius * 1.65;
    arenaFloorMesh.scale.set(floorScale, floorScale, 1);
  }

  if (spawnerGroup) {
    loadPokemonShowcaseSprite(POPULAR_POKEMON_LIST[currentPokemonIndex]);
  }

  cards.forEach((card, index) => {
    const statusObj = cardStatusMap.get(card.id) || { status: 'none' };
    const texture = textureLoader.load(card.image);

    let baseColor = 0x282828;
    let emissiveColor = 0x000000;

    if (statusObj.status === 'completed') {
      baseColor = 0xffffff;
      emissiveColor = 0x443300;
    } else if (statusObj.status === 'partial') {
      baseColor = 0xffffff;
      emissiveColor = 0x002211;
    }

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.1,
      color: new THREE.Color(baseColor),
      emissive: new THREE.Color(emissiveColor)
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

  applyViewMode();
}

// Mouse Wheel
threeContainer.addEventListener('wheel', (e) => {
  if (currentViewMode !== '3D' || cardMeshes.length === 0) return;
  e.preventDefault();

  if (e.shiftKey) {
    camera.position.z += e.deltaY * 0.01;
    camera.position.z = Math.max(carouselRadius + 3, Math.min(carouselRadius + 300, camera.position.z));
    return;
  }

  const angleStep = (2 * Math.PI) / cardMeshes.length;
  if (e.deltaY > 0) {
    currentTargetRotation -= angleStep;
  } else {
    currentTargetRotation += angleStep;
  }
}, { passive: false });

// Mobile Touch Handlers
let touchStartX = 0;
let touchStartY = 0;
let touchLastX = 0;
let isTouching = false;
let touchMoved = false;

threeContainer.addEventListener('touchstart', (e) => {
  if (currentViewMode !== '3D' || cardMeshes.length === 0) return;
  if (e.touches.length > 1) {
    isTouching = false;
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

// --- 9. CARD DETAIL MODAL / DYNAMIC VARIANT LEGEND ---
async function openCardDetailsModal(card, meshRef) {
  activeModalCard = card;

  modalCardName.textContent = card.name;
  modalCardImg.src = card.image;
  modalSetName.textContent = card.set?.name || 'Unknown Set';
  modalCardNumber.textContent = `#${card.number}`;
  modalCardId.textContent = card.id;
  modalStatus.textContent = 'Loading variants...';
  modalVariantsList.innerHTML = '<div style="color:#9ba1b0; font-size:0.85rem; padding:8px;">Fetching official variants...</div>';

  cardDetailModal.style.display = 'flex';

  let currentCardData = await db.cards.get(card.id);
  
  if (!currentCardData || !currentCardData.variants) {
    try {
      let fullCardDetails = null;
      try {
        fullCardDetails = await apiFetch(`/cards/${card.id}`);
      } catch (e1) {
        if (card.set?.id && card.number) {
          fullCardDetails = await apiFetch(`/sets/${card.set.id}/${card.number}`);
        }
      }

      if (fullCardDetails && fullCardDetails.variants) {
        currentCardData = {
          ...card,
          variants: fullCardDetails.variants
        };
        await db.cards.put(currentCardData);

        const memoryCard = currentCardsList.find(c => c.id === card.id);
        if (memoryCard) memoryCard.variants = fullCardDetails.variants;
      }
    } catch (err) {
      console.warn('Could not fetch variants for card:', err);
    }
  }

  const availVariants = getCardAvailableVariants(currentCardData || card);

  const collectedRecords = await db.variantCollection.where('cardId').equals(card.id).toArray();
  const collectedVariants = new Set(collectedRecords.map(r => r.variant));

  if (collectedVariants.size === 0) {
    const isLegacyOwned = await db.collection.get(card.id);
    if (isLegacyOwned) {
      collectedVariants.add('normal');
      await db.variantCollection.put({
        cardId: card.id,
        variant: 'normal',
        collectedAt: new Date().toISOString()
      });
    }
  }

  modalVariantsList.innerHTML = '';

  availVariants.forEach(variantKey => {
    const isOwned = collectedVariants.has(variantKey);
    const badgeInfo = VARIANT_BADGE_MAP[variantKey] || { symbol: variantKey.slice(0, 3), name: variantKey };

    const btn = document.createElement('button');
    btn.className = `btn-variant-toggle ${isOwned ? 'active' : ''}`;
    btn.innerHTML = `
      <span>[${badgeInfo.symbol}] ${badgeInfo.name}</span>
      <span>${isOwned ? '✓' : '+'}</span>
    `;

    btn.addEventListener('click', async () => {
      const nowActive = btn.classList.contains('active');
      if (nowActive) {
        await db.variantCollection.where('[cardId+variant]').equals([card.id, variantKey]).delete();
        btn.classList.remove('active');
        btn.querySelector('span:last-child').textContent = '+';
        collectedVariants.delete(variantKey);
      } else {
        await db.variantCollection.put({
          cardId: card.id,
          variant: variantKey,
          collectedAt: new Date().toISOString()
        });
        btn.classList.add('active');
        btn.querySelector('span:last-child').textContent = '✓';
        collectedVariants.add(variantKey);
      }

      updateModalStatusLabel(collectedVariants.size, availVariants.length);
      updateCardMeshStatus(card.id, collectedVariants, availVariants, meshRef);
      updateProgressStats();
    });

    modalVariantsList.appendChild(btn);
  });

  updateModalStatusLabel(collectedVariants.size, availVariants.length);
  updateCardMeshStatus(card.id, collectedVariants, availVariants, meshRef);
  updateProgressStats();
}

function updateModalStatusLabel(ownedCount, totalCount) {
  if (ownedCount === totalCount && totalCount > 0) {
    modalStatus.textContent = `⭐ Master Set Complete (${ownedCount}/${totalCount})`;
    modalStatus.style.color = '#ffcb05';
  } else if (ownedCount > 0) {
    modalStatus.textContent = `Partial (${ownedCount}/${totalCount} Variants)`;
    modalStatus.style.color = '#10b981';
  } else {
    modalStatus.textContent = `Missing (0/${totalCount})`;
    modalStatus.style.color = '#9ba1b0';
  }
}

function updateCardMeshStatus(cardId, collectedVariantsSet, availVariants, meshRef) {
  const ownedCount = collectedVariantsSet.size;
  const totalCount = availVariants.length;

  if (meshRef) {
    if (ownedCount === totalCount && totalCount > 0) {
      meshRef.material.color.setHex(0xffffff);
      meshRef.material.emissive.setHex(0x443300);
    } else if (ownedCount > 0) {
      meshRef.material.color.setHex(0xffffff);
      meshRef.material.emissive.setHex(0x002211);
    } else {
      meshRef.material.color.setHex(0x282828);
      meshRef.material.emissive.setHex(0x000000);
    }
  }

  const cardEl = document.querySelector(`.card-item[data-card-id="${cardId}"]`);
  if (cardEl) {
    cardEl.classList.remove('missing', 'owned', 'completed');
    if (ownedCount === totalCount && totalCount > 0) {
      cardEl.classList.add('completed');
    } else if (ownedCount > 0) {
      cardEl.classList.add('owned');
    } else {
      cardEl.classList.add('missing');
    }

    let badgesContainer = cardEl.querySelector('.card-variants-badges');
    if (!badgesContainer) {
      badgesContainer = document.createElement('div');
      badgesContainer.className = 'card-variants-badges';
      cardEl.prepend(badgesContainer);
    }

    let badgesHTML = '';
    availVariants.forEach(v => {
      const isOwned = collectedVariantsSet.has(v);
      const badgeInfo = VARIANT_BADGE_MAP[v] || { symbol: v.slice(0, 3), name: v };
      badgesHTML += `<span class="badge-variant ${isOwned ? 'owned' : 'missing'}" data-variant="${v}" title="${badgeInfo.name}">${badgeInfo.symbol}</span>`;
    });
    badgesContainer.innerHTML = badgesHTML;
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
btnLockCamera.addEventListener('click', () => {
  isCameraLocked = !isCameraLocked;
  if (isCameraLocked) {
    btnLockCamera.classList.add('active');
    btnLockCamera.textContent = '🔒 Locked View: On';
  } else {
    btnLockCamera.classList.remove('active');
    btnLockCamera.textContent = '🔓 Locked View: Off';
  }
  applyViewMode();
});

btnShowcaseMode.addEventListener('click', () => {
  isShowcaseAutoMode = !isShowcaseAutoMode;
  if (isShowcaseAutoMode) {
    btnShowcaseMode.classList.add('active');
    btnShowcaseMode.textContent = '⏸ Auto-Showcase: On';
  } else {
    btnShowcaseMode.classList.remove('active');
    btnShowcaseMode.textContent = '▶ Auto-Showcase: Off';
  }
  applyViewMode();
});

btnResetView.addEventListener('click', () => {
  isShowcaseAutoMode = false;
  btnShowcaseMode.classList.remove('active');
  btnShowcaseMode.textContent = '▶ Auto-Showcase: Off';
  applyViewMode();
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