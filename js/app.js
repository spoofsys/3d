/**
 * Human Atlas 3D - Main Application Orchestrator
 * DBCLS BodyParts3D 4.0 | 2,234 Authentic Modeled Pieces
 * High-performance GPU Vertex Displacement Dissection
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BodyParts3DLoader, EXCLUDED_PARTS } from './bodyparts3d-loader.js';
import { ExplosionEngine } from './explosion-engine.js';
import { ANATOMICAL_SYSTEMS, getSystemInfo, getPartDossier } from './anatomy-data.js';
import { sound } from './audio.js';

class HumanAtlasApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.loader = null;
    this.engine = null;
    this.materialsMap = new Map();

    // Textures for GPU vertex displacement
    this.textureWidth = 4096;
    this.displacementData = new Float32Array(this.textureWidth * 4);
    for (let i = 0; i < this.textureWidth; i++) {
      this.displacementData[i * 4 + 0] = 0.0;
      this.displacementData[i * 4 + 1] = 0.0;
      this.displacementData[i * 4 + 2] = 0.0;
      this.displacementData[i * 4 + 3] = 1.0; // visible by default
    }

    this.partTexture = new THREE.DataTexture(
      this.displacementData,
      this.textureWidth,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.partTexture.minFilter = THREE.NearestFilter;
    this.partTexture.magFilter = THREE.NearestFilter;
    this.partTexture.generateMipmaps = false;
    this.partTexture.needsUpdate = true;

    this.selectionData = new Uint8Array(this.textureWidth * 4);
    this.selectionTexture = new THREE.DataTexture(
      this.selectionData,
      this.textureWidth,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.selectionTexture.minFilter = THREE.NearestFilter;
    this.selectionTexture.magFilter = THREE.NearestFilter;
    this.selectionTexture.generateMipmaps = false;
    this.selectionTexture.needsUpdate = true;

    // Scene State
    this.visibleSystems = new Set(ANATOMICAL_SYSTEMS.map(s => s.id));
    this.selectedPartId = null;
    this.hoveredPartId = null;
    this.isIsolated = false;
    this.currentView = 'front';
    this.isTurntable = false;

    // Dissection Slider State
    this.sliderAmount = 0.0;
    this.smoothAmount = 0.0;

    // Skin (Integumentary) Opacity Mode: 'translucent' (0.35), 'solid' (1.0), 'hidden' (0.0)
    this.skinMode = 'translucent';

    // Raycasting & Hit Targets
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-999, -999);
    this.screenTargets = [];
    this.worldBox = new THREE.Box3();
    this.hitPoint = new THREE.Vector3();
    this.projectedVec = new THREE.Vector3();

    // Search state
    this.searchResults = [];
    this.selectedSearchIdx = 0;
    this.activeCategory = 'all';

    // Clock
    this.clock = new THREE.Clock();

    this.init();
  }

  async init() {
    this.initRendererAndScene();
    this.initLightsAndEnvironment();
    this.initGroundAndStudioFloor();
    this.initControls();
    this.initMaterials();

    // Start loading the 2,234 authentic BodyParts3D meshes
    await this.loadAnatomy();

    this.initUI();
    this.initSearch();
    this.initEventListeners();
    this.fit('front', 0.0);

    this.animate();
  }

  initRendererAndScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f6f7f9');

    this.camera = new THREE.PerspectiveCamera(
      34,
      window.innerWidth / window.innerHeight,
      0.005,
      100
    );
    this.camera.position.set(0.0, 1.05, 3.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  initLightsAndEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    this.scene.environment = env.texture;
    room.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffffff, 0xa7acb2, 1.05);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfffaf4, 2.3);
    key.position.set(-2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.bias = -0.0002;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xe9f0ff, 1.8);
    rim.position.set(2, 2, -3);
    this.scene.add(rim);
  }

  initGroundAndStudioFloor() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 96),
      new THREE.MeshStandardMaterial({ color: 0xd5d9dc, roughness: 1.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.019;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundMesh = ground;

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.7, 0.028, 100),
      new THREE.MeshStandardMaterial({ color: 0xeeeeec, metalness: 0.12, roughness: 0.67 })
    );
    platform.position.y = -0.016;
    platform.receiveShadow = true;
    this.scene.add(platform);
    this.platformMesh = platform;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.63, 0.632, 128),
      new THREE.MeshBasicMaterial({ color: 0x8c969f, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    this.scene.add(ring);
    this.ringMesh = ring;

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.551, 128),
      new THREE.MeshBasicMaterial({ color: 0xa4aeb8, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.001;
    this.scene.add(innerRing);
    this.innerRingMesh = innerRing;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 256);
    ctx.font = '600 32px Inter, sans-serif';
    ctx.fillStyle = 'rgba(100, 116, 139, 0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '10px';
    ctx.fillText('ADULT HUMAN · MALE', 512, 128);

    const textTexture = new THREE.CanvasTexture(canvas);
    const textGeo = new THREE.PlaneGeometry(1.6, 0.4);
    const textMat = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, depthWrite: false });
    const textMesh = new THREE.Mesh(textGeo, textMat);
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.set(0, 0.002, 0.35);
    this.scene.add(textMesh);
    this.textMesh = textMesh;
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.target.set(0, 0.85, 0);
    this.controls.minDistance = 0.07;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.96;
  }

  initMaterials() {
    for (const sys of ANATOMICAL_SYSTEMS) {
      const isSkin = sys.id === 'integumentary';
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(sys.color),
        metalness: 0.08,
        roughness: 0.53,
        side: THREE.DoubleSide,
        transparent: isSkin,
        opacity: isSkin ? 0.35 : 1.0,
        depthWrite: !isSkin
      });

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.partState = { value: this.partTexture };
        shader.uniforms.selectionState = { value: this.selectionTexture };
        shader.uniforms.stateWidth = { value: this.textureWidth };

        shader.vertexShader = 'attribute float partIndex;\nuniform sampler2D partState;\nuniform sampler2D selectionState;\nuniform float stateWidth;\nvarying float partVisible;\nvarying float partSelected;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5);\nvec4 state = texture2D(partState, stateUv);\ntransformed += state.xyz;\npartVisible = state.w;\npartSelected = texture2D(selectionState, stateUv).r;'
        );

        shader.fragmentShader = 'varying float partVisible;\nvarying float partSelected;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif (partVisible < 0.5) discard;'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.82, 0.88), partSelected * 0.85);'
        );
      };

      this.materialsMap.set(sys.id, mat);
    }
  }

  async loadAnatomy() {
    const loaderBar = document.querySelector('.loader-bar-fill');
    const loaderSub = document.querySelector('.loader-sub');

    this.loader = new BodyParts3DLoader({
      onProgress: (pct) => {
        if (loaderBar) loaderBar.style.width = pct + '%';
        if (loaderSub) loaderSub.textContent = 'Synthesizing real anatomy (' + pct + '%)...';
      }
    });

    const result = await this.loader.load(this.scene, this.materialsMap);

    this.engine = new ExplosionEngine(
      result.parts,
      result.centers,
      result.bounds,
      result.pickers,
      this.partTexture,
      this.displacementData,
      this.selectionTexture,
      this.selectionData
    );

    const overlay = document.getElementById('loader-overlay');
    if (overlay) {
      setTimeout(() => overlay.classList.add('hidden'), 350);
    }
  }

  fit(view = 'front', extent = 0.0) {
    if (!this.engine) return;
    const aspect = this.camera.aspect;
    const isMobile = window.innerWidth < 768;
    const normalDist = isMobile ? 4.8 : 3.6;

    const reservedH = isMobile ? 350 : 270;
    const availableAspect = Math.max(0.35, (window.innerWidth - (isMobile ? 40 : 340)) / Math.max(160, window.innerHeight - reservedH));
    const atlasDist = Math.max(this.engine.packingHeight, this.engine.packingWidth / availableAspect) /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * (window.innerHeight / Math.max(160, window.innerHeight - reservedH)) * 1.08;

    const distance = THREE.MathUtils.lerp(normalDist, Math.max(0.2, atlasDist), extent);
    let activeView = view;
    if (extent > 0.8) activeView = 'front';

    let direction;
    if (activeView === 'front') direction = new THREE.Vector3(0, 0.02, 1);
    else if (activeView === 'back') direction = new THREE.Vector3(0, 0.02, -1);
    else if (activeView === 'side') direction = new THREE.Vector3(1, 0.02, 0);
    else direction = new THREE.Vector3(0.35, 0.06, 1).normalize();

    const targetX = extent > 0.05 && window.innerWidth > 767 ? this.engine.packingWidth * 0.06 : 0;
    const targetY = extent > 0.1 || isMobile ? 0.85 : 0.68;

    this.controls.target.set(targetX, targetY, 0);
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
    this.controls.update();
  }

  initUI() {
    this.renderSystemsList();
    this.bindSystemsControls();
    this.bindCameraControls();
    this.bindExplodeSlider();
    this.bindDetailCard();
  }

  renderSystemsList() {
    const listEl = document.getElementById('systems-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const filtered = ANATOMICAL_SYSTEMS.filter(sys => {
      if (this.activeCategory === 'all') return true;
      if (this.activeCategory === 'skeleton') return sys.category === 'skeleton';
      if (this.activeCategory === 'organs') return sys.category === 'organs';
      return true;
    });

    const badge = document.getElementById('systems-count-badge');
    if (badge) badge.textContent = filtered.length;

    for (const sys of filtered) {
      const row = document.createElement('div');
      row.className = 'system-row';
      row.dataset.system = sys.id;

      const isChecked = this.visibleSystems.has(sys.id);

      const extraSkinControl = sys.id === 'integumentary' ?
        '<span class="skin-mode-badge" title="Click to cycle Skin: Ghost / Solid / Hidden" id="skin-mode-toggle">GHOST (35%)</span>' : '';

      row.innerHTML = 
        '<div class="system-row-left">' +
          '<span class="system-dot" style="background-color: ' + sys.color + ';"></span>' +
          '<span class="system-name">' + sys.name + '</span>' +
          extraSkinControl +
        '</div>' +
        '<div class="system-row-right">' +
          '<span class="system-count">' + sys.count + '</span>' +
          '<label class="switch mini">' +
            '<input type="checkbox" class="system-checkbox" data-sys="' + sys.id + '" ' + (isChecked ? 'checked' : '') + ' />' +
            '<span class="slider round"></span>' +
          '</label>' +
        '</div>';

      listEl.appendChild(row);
    }

    listEl.querySelectorAll('.system-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const sysId = e.target.dataset.sys;
        if (e.target.checked) {
          this.visibleSystems.add(sysId);
        } else {
          this.visibleSystems.delete(sysId);
        }
        sound.playToggle();
      });
    });

    const skinToggle = document.getElementById('skin-mode-toggle');
    if (skinToggle) {
      skinToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cycleSkinMode();
      });
    }
  }

  cycleSkinMode() {
    const skinMat = this.materialsMap.get('integumentary');
    const badge = document.getElementById('skin-mode-toggle');
    if (!skinMat) return;

    if (this.skinMode === 'translucent') {
      this.skinMode = 'solid';
      skinMat.transparent = false;
      skinMat.opacity = 1.0;
      skinMat.depthWrite = true;
      if (badge) badge.textContent = 'SOLID (100%)';
      this.visibleSystems.add('integumentary');
    } else if (this.skinMode === 'solid') {
      this.skinMode = 'hidden';
      this.visibleSystems.delete('integumentary');
      if (badge) badge.textContent = 'OFF (0%)';
    } else {
      this.skinMode = 'translucent';
      skinMat.transparent = true;
      skinMat.opacity = 0.35;
      skinMat.depthWrite = false;
      this.visibleSystems.add('integumentary');
      if (badge) badge.textContent = 'GHOST (35%)';
    }

    sound.playClick();
    skinMat.needsUpdate = true;
  }

  bindSystemsControls() {
    const hideAllToggle = document.getElementById('toggle-hide-all');
    if (hideAllToggle) {
      hideAllToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.visibleSystems.clear();
        } else {
          ANATOMICAL_SYSTEMS.forEach(s => this.visibleSystems.add(s.id));
        }
        this.renderSystemsList();
        sound.playToggle();
      });
    }

    document.querySelectorAll('.cat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeCategory = tab.dataset.category;
        this.renderSystemsList();
        sound.playTab();
      });
    });
  }

  bindCameraControls() {
    document.querySelectorAll('.cam-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        this.fit(this.currentView, Math.max(0, (this.sliderAmount - 0.25) / 0.75));
        sound.playClick();
      });
    });

    const turntableBtn = document.getElementById('btn-turntable');
    if (turntableBtn) {
      turntableBtn.addEventListener('click', () => {
        this.isTurntable = !this.isTurntable;
        turntableBtn.classList.toggle('active', this.isTurntable);
        sound.playClick();
      });
    }

    const resetViewBtn = document.getElementById('btn-reset-view');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', () => {
        this.currentView = 'front';
        document.querySelectorAll('.cam-btn[data-view]').forEach(b => {
          b.classList.toggle('active', b.dataset.view === 'front');
        });
        this.fit('front', Math.max(0, (this.sliderAmount - 0.25) / 0.75));
        sound.playClick();
      });
    }
  }

  bindExplodeSlider() {
    const slider = document.getElementById('explode-slider');
    const pctBadge = document.getElementById('explode-pct-badge');
    const resetBtn = document.getElementById('btn-reset-explode');

    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseInt(slider.value, 10);
        this.sliderAmount = val / 100;
        if (pctBadge) pctBadge.textContent = val + '%';
        this.fit(this.currentView, Math.max(0, (this.sliderAmount - 0.25) / 0.75));
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.animateSliderTo(0);
        sound.playSlide();
      });
    }
  }

  animateSliderTo(targetVal) {
    const slider = document.getElementById('explode-slider');
    const pctBadge = document.getElementById('explode-pct-badge');
    const startVal = this.sliderAmount;
    const startTime = performance.now();
    const duration = 500;

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
      const current = THREE.MathUtils.lerp(startVal, targetVal, ease);

      this.sliderAmount = current;
      if (slider) slider.value = Math.round(current * 100);
      if (pctBadge) pctBadge.textContent = Math.round(current * 100) + '%';
      this.fit(this.currentView, Math.max(0, (this.sliderAmount - 0.25) / 0.75));

      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  bindDetailCard() {
    const closeBtn = document.getElementById('btn-close-detail');
    const isolateBtn = document.getElementById('btn-isolate-action');
    const focusBtn = document.getElementById('btn-focus-action');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.selectedPartId = null;
        this.isIsolated = false;
        this.hideDetailCard();
      });
    }

    if (isolateBtn) {
      isolateBtn.addEventListener('click', () => {
        this.isIsolated = !this.isIsolated;
        isolateBtn.textContent = this.isIsolated ? 'Show All' : 'Isolate';
        isolateBtn.classList.toggle('primary', this.isIsolated);
        sound.playClick();
      });
    }

    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        this.focusOnSelected();
        sound.playClick();
      });
    }
  }

  focusOnSelected() {
    if (!this.selectedPartId || !this.loader) return;
    const partIdx = this.loader.parts.findIndex(p => p.id === this.selectedPartId);
    if (partIdx < 0) return;

    const center = this.loader.centers[partIdx];
    const dx = this.engine.displacementData[partIdx * 4 + 0];
    const dy = this.engine.displacementData[partIdx * 4 + 1];
    const dz = this.engine.displacementData[partIdx * 4 + 2];
    const targetPos = new THREE.Vector3(center.x + dx, center.y + dy, center.z + dz);

    this.controls.target.copy(targetPos);
    this.camera.position.copy(targetPos).add(new THREE.Vector3(0, 0.05, 0.45));
    this.controls.update();
  }

  showDetailCard(part) {
    const card = document.getElementById('piece-detail-card');
    if (!card) return;

    const dossier = getPartDossier(part);
    document.getElementById('detail-system-tag').textContent = dossier.systemName.toUpperCase();
    document.getElementById('detail-system-tag').style.color = dossier.systemColor;
    document.getElementById('detail-title').textContent = dossier.name;
    document.getElementById('detail-latin').textContent = dossier.latin;
    document.getElementById('detail-region').textContent = dossier.region;
    document.getElementById('detail-id').textContent = dossier.id;
    document.getElementById('detail-function').textContent = dossier.functionText;
    document.getElementById('detail-clinical').textContent = dossier.clinicalText;
    document.getElementById('detail-vessels').textContent = dossier.vesselsText;

    card.classList.remove('hidden');
    sound.playSelect();
  }

  hideDetailCard() {
    const card = document.getElementById('piece-detail-card');
    if (card) card.classList.add('hidden');
  }

  initSearch() {
    const triggerBtn = document.getElementById('search-trigger-btn');
    const backdrop = document.getElementById('search-modal-backdrop');
    const input = document.getElementById('search-input');

    const openSearch = () => {
      backdrop.classList.remove('hidden');
      input.value = '';
      input.focus();
      this.renderSearchResults('');
    };

    const closeSearch = () => {
      backdrop.classList.add('hidden');
    };

    if (triggerBtn) triggerBtn.addEventListener('click', openSearch);
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeSearch();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        openSearch();
      } else if (e.key === 'Escape') {
        closeSearch();
      }
    });

    if (input) {
      input.addEventListener('input', (e) => {
        this.renderSearchResults(e.target.value.trim().toLowerCase());
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectedSearchIdx = Math.min(this.selectedSearchIdx + 1, this.searchResults.length - 1);
          this.highlightSearchResult();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectedSearchIdx = Math.max(this.selectedSearchIdx - 1, 0);
          this.highlightSearchResult();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.searchResults[this.selectedSearchIdx]) {
            this.selectPart(this.searchResults[this.selectedSearchIdx].id);
            closeSearch();
          }
        }
      });
    }
  }

  renderSearchResults(query) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer || !this.loader) return;
    resultsContainer.innerHTML = '';

    const q = (query || '').trim().toLowerCase();

    if (!q) {
      this.searchResults = this.loader.parts.slice(0, 25);
    } else {
      const matchedSys = ANATOMICAL_SYSTEMS
        .filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
        .map(s => s.id);
      const sysSet = new Set(matchedSys);

      this.searchResults = this.loader.parts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.conceptId && p.conceptId.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q) ||
        sysSet.has(p.system)
      ).slice(0, 40);
    }

    this.selectedSearchIdx = 0;

    for (let i = 0; i < this.searchResults.length; i++) {
      const p = this.searchResults[i];
      const sys = getSystemInfo(p.system);
      const item = document.createElement('div');
      item.className = 'search-item' + (i === 0 ? ' selected' : '');
      item.dataset.index = i;

      item.innerHTML = 
        '<div class="search-item-left">' +
          '<span class="system-dot mini" style="background-color: ' + sys.color + ';"></span>' +
          '<span class="search-item-name">' + p.name + '</span>' +
          '<span class="search-item-concept">' + (p.conceptId || '') + '</span>' +
        '</div>' +
        '<div class="search-item-right">' +
          '<span class="search-item-system">' + sys.name + '</span>' +
        '</div>';

      item.addEventListener('click', () => {
        this.selectPart(p.id);
        document.getElementById('search-modal-backdrop').classList.add('hidden');
      });

      resultsContainer.appendChild(item);
    }
  }

  highlightSearchResult() {
    const items = document.querySelectorAll('.search-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.selectedSearchIdx);
      if (idx === this.selectedSearchIdx) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  selectPart(partId) {
    if (!this.loader) return;
    const part = this.loader.parts.find(p => p.id === partId);
    if (!part) return;

    this.selectedPartId = partId;
    this.showDetailCard(part);
    this.focusOnSelected();
  }

  initEventListeners() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
      if (this.engine) this.engine.updateLayout(this.camera.aspect);
      this.fit(this.currentView, Math.max(0, (this.sliderAmount - 0.25) / 0.75));
    });

    const hoverTooltip = document.getElementById('hover-tooltip');

    window.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.sliderAmount > 0.45 && this.screenTargets.length > 0) {
        const hitIdx = this.findScreenTarget(e.clientX, e.clientY, 16);
        if (hitIdx >= 0 && this.loader && this.loader.parts[hitIdx]) {
          const p = this.loader.parts[hitIdx];
          hoverTooltip.textContent = p.name;
          hoverTooltip.style.left = (e.clientX + 14) + 'px';
          hoverTooltip.style.top = (e.clientY + 18) + 'px';
          hoverTooltip.style.display = 'block';
          this.canvas.style.cursor = 'pointer';
          return;
        }
      }

      hoverTooltip.style.display = 'none';
      this.canvas.style.cursor = 'grab';
    });

    window.addEventListener('pointerdown', () => {
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('pointerup', (e) => {
      this.canvas.style.cursor = 'grab';
      if (e.target.closest('.glass-card, .glass-pill, .modal-backdrop, header, footer')) return;

      this.handleScenePick(e.clientX, e.clientY);
    });
  }

  findScreenTarget(x, y, radius) {
    let best = -1, score = Infinity;
    for (const t of this.screenTargets) {
      const dx = Math.max(t.left - x, 0, x - t.right);
      const dy = Math.max(t.top - y, 0, y - t.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const cand = dist + Math.hypot(t.x - x, t.y - y) * 0.025;
      if (cand < score) {
        score = cand;
        best = t.index;
      }
    }
    return best;
  }

  handleScenePick(clientX, clientY) {
    if (!this.loader || !this.engine) return;

    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;

    if (this.sliderAmount > 0.45) {
      const screenHit = this.findScreenTarget(clientX, clientY, 40);
      if (screenHit >= 0) {
        this.selectPart(this.loader.parts[screenHit].id);
        return;
      }
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    let nearestDist = Infinity;
    let foundIdx = -1;

    for (let i = 0; i < this.loader.pickers.length; i++) {
      const picker = this.loader.pickers[i];
      if (!picker) continue;

      const vis = this.engine.displacementData[i * 4 + 3];
      if (vis < 0.5) continue;

      const p = this.loader.parts[i];
      if (p.system === 'integumentary' && this.skinMode === 'translucent') continue;

      this.worldBox.copy(this.loader.bounds[i]).translate(picker.position);
      if (!this.raycaster.ray.intersectBox(this.worldBox, this.hitPoint)) continue;

      const hits = this.raycaster.intersectObject(picker, false);
      if (hits.length > 0 && hits[0].distance < nearestDist) {
        nearestDist = hits[0].distance;
        foundIdx = i;
      }
    }

    if (foundIdx >= 0) {
      this.selectPart(this.loader.parts[foundIdx].id);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.engine) {
      const res = this.engine.update({
        sliderAmount: this.sliderAmount,
        visibleSystems: this.visibleSystems,
        selectedPartId: this.selectedPartId,
        isIsolated: this.isIsolated,
        deltaTime: dt
      });
      this.smoothAmount = res.amount;

      const isGroundVisible = this.smoothAmount < 0.5 && !this.isIsolated;
      if (this.groundMesh) this.groundMesh.visible = isGroundVisible;
      if (this.platformMesh) this.platformMesh.visible = isGroundVisible;
      if (this.ringMesh) this.ringMesh.visible = isGroundVisible;
      if (this.innerRingMesh) this.innerRingMesh.visible = isGroundVisible;
      if (this.textMesh) this.textMesh.visible = isGroundVisible;

      if (this.smoothAmount > 0.45 && this.loader) {
        this.screenTargets = [];
        const w = window.innerWidth;
        const h = window.innerHeight;

        for (let i = 0; i < this.loader.parts.length; i++) {
          const vis = this.engine.displacementData[i * 4 + 3];
          if (vis < 0.5) continue;

          const p = this.loader.parts[i];
          const dx = this.engine.displacementData[i * 4 + 0];
          const dy = this.engine.displacementData[i * 4 + 1];
          const dz = this.engine.displacementData[i * 4 + 2];

          let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
          for (let corner = 0; corner < 8; corner++) {
            this.projectedVec.set(
              p.bounds[(corner & 1) ? 1 : 0][0] + dx,
              p.bounds[(corner & 2) ? 1 : 0][1] + dy,
              p.bounds[(corner & 4) ? 1 : 0][2] + dz
            ).project(this.camera);

            const sx = (this.projectedVec.x + 1) * w / 2;
            const sy = (1 - this.projectedVec.y) * h / 2;
            left = Math.min(left, sx);
            right = Math.max(right, sx);
            top = Math.min(top, sy);
            bottom = Math.max(bottom, sy);
          }

          const c = this.loader.centers[i];
          this.projectedVec.set(c.x + dx, c.y + dy, c.z + dz).project(this.camera);
          if (this.projectedVec.z < -1 || this.projectedVec.z > 1) continue;

          this.screenTargets.push({
            index: i,
            x: (this.projectedVec.x + 1) * w / 2,
            y: (1 - this.projectedVec.y) * h / 2,
            left, right, top, bottom
          });
        }
      }
    }

    if (this.controls) {
      this.controls.autoRotate = this.isTurntable && this.smoothAmount < 0.5 && !this.isIsolated;
      this.controls.autoRotateSpeed = 1.0;
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.atlasApp = new HumanAtlasApp();
});
