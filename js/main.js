import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  SHED_POS, getStreamX, getTerrainHeight, worldToGPS, getEstateBlockName
} from './geo.js';
import { Soundscape } from './audio.js';
import { buildWorld } from './world.js';
import {
  populateEstateFoliage, createArticulatedPlucker,
  createFirstPersonHands, spawnFellowCollectors
} from './foliage.js';
import { PhysicsWorld } from './physics.js';

const $ = (id) => document.getElementById(id);

// =========================================================================
// 1. RENDERER, SCENE, CAMERA & CINEMATIC POST-PROCESSING
// =========================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
$('canvas-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc5d8e8, 18, 320);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.08, 4800);
camera.rotation.order = 'YXZ';
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.42, 0.72, 0.78
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const audio = new Soundscape();

// =========================================================================
// 2. SHARED SHADER UNIFORMS, DYNAMIC LIGHTS & RAYLEIGH/MIE SKY DOME
// =========================================================================
const sharedUniforms = {
  uTime:       { value: 0 },
  uSunDir:     { value: new THREE.Vector3(0.68, 0.14, -0.72).normalize() },
  uSunColor:   { value: new THREE.Color(0xffcfa0) },
  uPlayerPos:  { value: new THREE.Vector3(0, 0, 10) },
  uPluckPulse: { value: new THREE.Vector4(0, -100, 0, 0) },
  uWindVec:    { value: new THREE.Vector2(1.0, 0.45) }
};

const mountainUniforms = {
  uSunDir:      sharedUniforms.uSunDir,
  uSunColor:    { value: new THREE.Color(0xffbfa0) },
  uAlpenglow:   { value: new THREE.Color(0xff9982) },
  uShadowColor: { value: new THREE.Color(0x3f537a) },
  uFogColor:    { value: new THREE.Color(0xe6c8ba) }
};

const sunLight = new THREE.DirectionalLight(0xffe4b5, 2.6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 260;
const sExt = 90;
sunLight.shadow.camera.left = -sExt;
sunLight.shadow.camera.right = sExt;
sunLight.shadow.camera.top = sExt;
sunLight.shadow.camera.bottom = -sExt;
sunLight.shadow.bias = -0.00045;
sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);

const hemiLight = new THREE.HemisphereLight(0xb8d4f0, 0x2d4a28, 1.45);
scene.add(hemiLight);

// Cool alpine bounce light reflected from Kanchenjunga's northern snow wall
const northBounce = new THREE.DirectionalLight(0x9ec8f0, 0.62);
northBounce.position.set(-25, 35, -140);
scene.add(northBounce);

const shedLantern = new THREE.PointLight(0xffaa44, 6.0, 22, 1.5);
shedLantern.position.set(SHED_POS.x, SHED_POS.y + 2.55, SHED_POS.z);
scene.add(shedLantern);

// Warm eastern horizon glow — dawn fill light
const eastFill = new THREE.DirectionalLight(0xffa06a, 0.38);
eastFill.position.set(60, 20, 80);
scene.add(eastFill);

const skyUniforms = {
  uSunDir:  sharedUniforms.uSunDir,
  uTime:    sharedUniforms.uTime,
  uZenith:  { value: new THREE.Color(0x1a3357) },
  uMidSky:  { value: new THREE.Color(0x5a7ea8) },
  uHorizon: { value: new THREE.Color(0xf4b28f) },
  uSunCol:  { value: new THREE.Color(0xfff1cc) }
};

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(3600, 40, 28),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform vec3 uZenith;
      uniform vec3 uMidSky;
      uniform vec3 uHorizon;
      uniform vec3 uSunCol;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        vec3 d = normalize(vDir);
        float y = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMidSky, smoothstep(0.0, 0.24, y));
        col = mix(col, uZenith, smoothstep(0.18, 0.85, y));

        float sa = max(dot(d, normalize(uSunDir)), 0.0);
        float glow = pow(sa, 6.0) * 0.36 + pow(sa, 42.0) * 0.55 + pow(sa, 260.0) * 0.85;
        float disc = smoothstep(0.99915, 0.99955, sa) * 2.5;
        col += uSunCol * (glow + disc);

        // High-altitude painted Himalayan cirrus wisps
        if (d.y > 0.04) {
          vec2 uv = d.xz / (d.y + 0.22) * 1.45 + vec2(uTime * 0.008, -uTime * 0.003);
          float c = noise(uv * 2.2) * 0.6 + noise(uv * 4.8 + 3.1) * 0.4;
          float cirrus = smoothstep(0.56, 0.84, c) * smoothstep(0.04, 0.22, d.y) * smoothstep(0.85, 0.3, d.y);
          vec3 cloudCol = mix(uHorizon * 1.08, uSunCol * 1.15, pow(sa, 2.0));
          col = mix(col, cloudCol, cirrus * 0.48);
        }

        if (d.y < 0.0) {
          col = mix(uHorizon, uHorizon * 0.82, clamp(-d.y * 5.0, 0.0, 1.0));
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
));

// Layered ground mist plane — hover just above terrain at y ≈ 1.2
const groundMistMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshBasicMaterial({
    color: 0xd4e8f5,
    transparent: true,
    opacity: 0.13,
    depthWrite: false
  })
);
groundMistMesh.rotation.x = -Math.PI / 2;
groundMistMesh.position.y = 1.2;
scene.add(groundMistMesh);

// =========================================================================
// 3. ASSEMBLE WORLD, FOLIAGE, CHARACTERS & 120HZ PHYSICS ENGINE
// =========================================================================
$('loader-status').textContent = 'Sculpting Kanchenjunga & Happy Valley Terraces…';
const world = buildWorld(scene, sharedUniforms, mountainUniforms);
const { shootData, shootMesh, dewMotes } = populateEstateFoliage(scene, sharedUniforms);

const playerAvatar = createArticulatedPlucker(0xc43741, 0xe8b954, world.bambooTex);
playerAvatar.root.visible = false;
scene.add(playerAvatar.root);

const { fpHands, fpLeft, fpRight, heldShootMeshes } = createFirstPersonHands(camera);
const fellowWorkers = spawnFellowCollectors(scene, world.bambooTex);

// =========================================================================
// 4. TIME-OF-DAY ATMOSPHERE MOODS
// =========================================================================
const moods = [
  {
    name: 'Kanchenjunga Alpenglow', clock: '05:40 AM',
    sunDir: new THREE.Vector3(0.68, 0.14, -0.72).normalize(),
    zenith: new THREE.Color(0x203b66), mid: new THREE.Color(0x6e8cb4), horizon: new THREE.Color(0xf4b28f),
    sunCol: new THREE.Color(0xffcfa0), alpenglow: new THREE.Color(0xff947c),
    fogCol: new THREE.Color(0xdfb9ab), fogDensity: 0.0046,
    linearFogCol: new THREE.Color(0xc5d8e8),
    sunInt: 3.0, hemiSky: new THREE.Color(0x9fb8e0), hemiGrd: new THREE.Color(0x283a22),
    mShadow: new THREE.Color(0x3f537a), lantern: 5.5
  },
  {
    name: 'Golden First Flush', clock: '07:35 AM',
    sunDir: new THREE.Vector3(0.56, 0.38, -0.73).normalize(),
    zenith: new THREE.Color(0x2c68a6), mid: new THREE.Color(0x8bb6d9), horizon: new THREE.Color(0xebd8be),
    sunCol: new THREE.Color(0xfff1cc), alpenglow: new THREE.Color(0xffe7c2),
    fogCol: new THREE.Color(0xd0d9d5), fogDensity: 0.0034,
    linearFogCol: new THREE.Color(0xe8c8a0),
    sunInt: 3.3, hemiSky: new THREE.Color(0xbed9f5), hemiGrd: new THREE.Color(0x304a25),
    mShadow: new THREE.Color(0x4d6b8e), lantern: 1.0
  },
  {
    name: 'Silver Rangeet Mist', clock: '11:15 AM',
    sunDir: new THREE.Vector3(0.20, 0.74, -0.64).normalize(),
    zenith: new THREE.Color(0x6285a8), mid: new THREE.Color(0xaec2cf), horizon: new THREE.Color(0xdce4e6),
    sunCol: new THREE.Color(0xfaf8f0), alpenglow: new THREE.Color(0xf5f5f5),
    fogCol: new THREE.Color(0xcfdadb), fogDensity: 0.0058,
    linearFogCol: new THREE.Color(0xcee4f0),
    sunInt: 2.35, hemiSky: new THREE.Color(0xd8e6f0), hemiGrd: new THREE.Color(0x2e4529),
    mShadow: new THREE.Color(0x657b91), lantern: 0.4
  },
  {
    name: 'Amber Himalayan Sunset', clock: '05:05 PM',
    sunDir: new THREE.Vector3(-0.70, 0.15, -0.70).normalize(),
    zenith: new THREE.Color(0x293357), mid: new THREE.Color(0x826c8c), horizon: new THREE.Color(0xeb9268),
    sunCol: new THREE.Color(0xffb173), alpenglow: new THREE.Color(0xff7e6b),
    fogCol: new THREE.Color(0xd19f8d), fogDensity: 0.0046,
    linearFogCol: new THREE.Color(0xb09080),
    sunInt: 2.75, hemiSky: new THREE.Color(0x9d8cb3), hemiGrd: new THREE.Color(0x292b1d),
    mShadow: new THREE.Color(0x47456b), lantern: 7.2
  }
];

let moodIndex = 0;
const curMood = {
  sunDir: moods[0].sunDir.clone(), zenith: moods[0].zenith.clone(), mid: moods[0].mid.clone(),
  horizon: moods[0].horizon.clone(), sunCol: moods[0].sunCol.clone(), alpenglow: moods[0].alpenglow.clone(),
  fogCol: moods[0].fogCol.clone(), fogDensity: moods[0].fogDensity, sunInt: moods[0].sunInt,
  linearFogCol: moods[0].linearFogCol.clone(),
  hemiSky: moods[0].hemiSky.clone(), hemiGrd: moods[0].hemiGrd.clone(), mShadow: moods[0].mShadow.clone(),
  lantern: moods[0].lantern
};

function updateAtmosphere(dt, focusPos) {
  const t = moods[moodIndex];
  const k = Math.min(1, dt * 1.45);
  curMood.sunDir.lerp(t.sunDir, k).normalize();
  curMood.zenith.lerp(t.zenith, k);
  curMood.mid.lerp(t.mid, k);
  curMood.horizon.lerp(t.horizon, k);
  curMood.sunCol.lerp(t.sunCol, k);
  curMood.alpenglow.lerp(t.alpenglow, k);
  curMood.fogCol.lerp(t.fogCol, k);
  curMood.linearFogCol.lerp(t.linearFogCol, k);
  curMood.fogDensity = THREE.MathUtils.lerp(curMood.fogDensity, t.fogDensity, k);
  curMood.sunInt = THREE.MathUtils.lerp(curMood.sunInt, t.sunInt, k);
  curMood.hemiSky.lerp(t.hemiSky, k);
  curMood.hemiGrd.lerp(t.hemiGrd, k);
  curMood.mShadow.lerp(t.mShadow, k);
  curMood.lantern = THREE.MathUtils.lerp(curMood.lantern, t.lantern, k);

  sharedUniforms.uSunDir.value.copy(curMood.sunDir);
  sharedUniforms.uSunColor.value.copy(curMood.sunCol);
  skyUniforms.uZenith.value.copy(curMood.zenith);
  skyUniforms.uMidSky.value.copy(curMood.mid);
  skyUniforms.uHorizon.value.copy(curMood.horizon);
  skyUniforms.uSunCol.value.copy(curMood.sunCol);

  mountainUniforms.uSunColor.value.copy(curMood.sunCol);
  mountainUniforms.uAlpenglow.value.copy(curMood.alpenglow);
  mountainUniforms.uShadowColor.value.copy(curMood.mShadow);
  mountainUniforms.uFogColor.value.copy(curMood.fogCol);

  sunLight.position.copy(focusPos).addScaledVector(curMood.sunDir, 105);
  sunLight.target.position.copy(focusPos);
  sunLight.color.copy(curMood.sunCol);
  sunLight.intensity = curMood.sunInt;
  hemiLight.color.copy(curMood.hemiSky);
  hemiLight.groundColor.copy(curMood.hemiGrd);
  // Drive the linear fog colour from per-mood sky palette (dawn/golden/midday/dusk)
  scene.fog.color.copy(curMood.linearFogCol);
  shedLantern.intensity = curMood.lantern;

  const bq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), curMood.sunDir);
  for (const b of world.sunbeamMeshes) b.quaternion.copy(bq);
}

// =========================================================================
// 5. GAMEPLAY STATE, PINCH-NODE SNAP MECHANIC & HUD SYNC
// =========================================================================
const DOKO_TARGET_KG = 4.0;
const PINCH_DURATION = 0.42;

let gameStarted = false;
let isResting = false;
let weighModalOpen = false;
let settingsOpen = false;
let thirdPerson = false;
let isPointerLocked = false;
let isDraggingLook = false;
let lookSensMultiplier = 1.0;

let yaw = 0.14, pitch = -0.05;
let targetYaw = yaw, targetPitch = pitch;

let dokoWeight = 0;
let fineShoots = 0;
let coarseShoots = 0;
let crispSnaps = 0;
let streak = 0;
let handful = [];

let highlightedShootId = -1;
let isPinching = false;
let pinchShootId = -1;
let pinchProgress = 0;
let fpPluckKick = 0;
let fpTossAnim = 0;

const keys = {};
const raycaster = new THREE.Raycaster();
const centerNDC = new THREE.Vector2(0, 0);
const dummy = new THREE.Object3D();

const reticle = $('reticle');
const reticleLabel = $('reticle-label');
const pinchCircle = $('pinch-circle');
const snapFeedback = $('snap-feedback');
const handfulPips = Array.from($('handful-pips').children);

let toastTimer = null;
let fbTimer = null;

function showToast(msg, ms = 4200) {
  const el = $('poetic-toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), ms);
}

function showSnapFeedback(text, color) {
  snapFeedback.textContent = text;
  snapFeedback.style.color = color;
  snapFeedback.classList.add('show');
  clearTimeout(fbTimer);
  fbTimer = setTimeout(() => snapFeedback.classList.remove('show'), 560);
}

function computeTeaGrade(purity) {
  if (purity >= 92) return { short: 'FTGFOP1', full: 'FTGFOP1 · Finest Tippy Golden Flowery Orange Pekoe' };
  if (purity >= 78) return { short: 'TGFOP',   full: 'TGFOP · Tippy Golden Flowery Orange Pekoe' };
  if (purity >= 60) return { short: 'FOP',     full: 'FOP · Flowery Orange Pekoe' };
  return { short: 'BOP', full: 'BOP · Broken Orange Pekoe (Coarse Mix)' };
}

function updateHUD() {
  const total = fineShoots + coarseShoots;
  const purity = total === 0 ? 100 : Math.round((fineShoots / total) * 100);
  const grade = computeTeaGrade(purity);

  $('quality-val').textContent = `${purity}%`;
  $('grade-val').textContent = grade.short;
  $('weight-val').textContent = `${dokoWeight.toFixed(2)} kg`;
  $('streak-val').textContent = streak >= 3 ? `Flow ×${streak}` : `Rhythm ×${streak}`;

  const pct = Math.min(100, Math.round((dokoWeight / DOKO_TARGET_KG) * 100));
  $('doko-pct').textContent = `${pct}%`;
  $('doko-bar').style.width = `${pct}%`;

  handfulPips.forEach((pip, i) => pip.classList.toggle('filled', i < handful.length));
  heldShootMeshes.forEach((m, i) => { m.visible = i < handful.length; });

  // Physically grow the mound of fresh shoots inside the 3rd-person woven Doko
  playerAvatar.leafMound.visible = dokoWeight > 0.05;
  const fill = THREE.MathUtils.clamp(dokoWeight / DOKO_TARGET_KG, 0, 1);
  playerAvatar.leafMound.position.y = THREE.MathUtils.lerp(-0.32, 0.16, fill);
  const ms = 0.65 + fill * 0.45;
  playerAvatar.leafMound.scale.set(ms, 0.35 + fill * 0.25, ms);

  $('time-readout').textContent = `${moods[moodIndex].clock} · ${moods[moodIndex].name}`;
}

// Initialize 120Hz Physics Engine with Doko landing callback
const physics = new PhysicsWorld(scene, world, sharedUniforms, audio, {
  onLeafLanded: (weight, isLast, batchSize) => {
    const prevWeight = dokoWeight;
    dokoWeight += weight;
    if (isLast) {
      audio.playDokoLand(batchSize);
      if (dokoWeight >= DOKO_TARGET_KG && prevWeight < DOKO_TARGET_KG) {
        showToast('Your woven doko is brimming! Climb the stone steps to the Tola Shed to weigh in.');
      }
    }
    updateHUD();
  }
});

updateHUD();

function tossCurrentHandful() {
  if (handful.length === 0) return;
  fpTossAnim = 1.0;
  const batch = handful.splice(0, handful.length);
  physics.launchShoulderToss(batch, yaw);
  updateHUD();
}

function completePinchSnap() {
  if (!isPinching) return;
  isPinching = false;
  reticle.classList.remove('pinching');

  const s = shootData[pinchShootId];
  const p = pinchProgress;
  pinchShootId = -1;
  pinchProgress = 0;
  if (!s || s.plucked) return;

  // Golden Node Sweet-Spot aligns visually with the dashed gold SVG ring (r = 18)
  const inSweet = streak >= 3 ? (p >= 0.22 && p <= 0.84) : (p >= 0.36 && p <= 0.80);
  const overPulled = p > 0.84;

  s.plucked = true;
  dummy.position.set(0, -250, 0);
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  shootMesh.setMatrixAt(s.id, dummy.matrix);
  shootMesh.instanceMatrix.needsUpdate = true;

  physics.triggerBushRecoil(s.pos);
  fpPluckKick = 1.0;

  const isFine = s.type !== 'coarse';
  const isDew = s.type === 'dew';

  if (isFine && !overPulled) {
    fineShoots++;
    if (inSweet) {
      crispSnaps++;
      streak++;
      physics.spawnDewBurst(s.pos, isDew ? 14 : 8);
      showSnapFeedback(
        isDew ? 'Dew-Kissed Silver Tip!' : (streak >= 4 ? `Crisp Flush · Flow ×${streak}` : 'Crisp Node Snap!'),
        isDew ? '#fff3a8' : '#c4f266'
      );
      if (isDew) physics.stamina = Math.min(1.0, physics.stamina + 0.16);
    } else {
      streak = Math.max(1, streak);
      physics.spawnDewBurst(s.pos, 4);
      showSnapFeedback('Clean Pluck', '#d8f0a8');
    }
    audio.playCrispSnap(streak, inSweet, true, isDew);
    handful.push({ color: s.baseColor.clone(), weight: isDew ? 0.18 : 0.14 });
    if (streak === 5) {
      showToast('Rhythm of the Ridge — your fingers glide effortlessly over the tender nodes.');
    }
  } else if (isFine && overPulled) {
    coarseShoots++;
    streak = 0;
    audio.playCrispSnap(0, false, false, false);
    showSnapFeedback('Stem Bruised — release inside gold ring', '#f2a16b');
    handful.push({ color: new THREE.Color(0x5a7340), weight: 0.15 });
  } else {
    coarseShoots++;
    streak = 0;
    audio.playCrispSnap(0, false, false, false);
    showSnapFeedback('Coarse Mature Leaf', '#e88b5a');
    handful.push({ color: s.baseColor.clone(), weight: 0.18 });
  }

  highlightedShootId = -1;
  updateHUD();

  // Automatically execute over-the-shoulder toss when 5 tender shoots fill the cupped palm
  if (handful.length >= 5) {
    setTimeout(() => tossCurrentHandful(), 160);
  }
}

// =========================================================================
// 6. WEIGH-IN LEDGER, SETTINGS MODAL & CONTROLS
// =========================================================================
function requestSafePointerLock() {
  try {
    const p = renderer.domElement.requestPointerLock?.();
    if (p?.catch) p.catch(() => {});
  } catch (_) {}
}

function isAnyModalOpen() {
  return weighModalOpen || settingsOpen;
}

function setSettingsOpen(open) {
  settingsOpen = open;
  $('settings-modal').classList.toggle('visible', open);
  if (open && document.pointerLockElement) document.exitPointerLock();
  if (!open && gameStarted && !weighModalOpen) requestSafePointerLock();
}

function openWeighInModal() {
  if (handful.length > 0) tossCurrentHandful();
  if (dokoWeight <= 0) return;

  physics.impulseWeighScale();
  audio.playBrassScaleBell();
  weighModalOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();

  const total = fineShoots + coarseShoots;
  const purity = total === 0 ? 100 : Math.round((fineShoots / total) * 100);
  const grade = computeTeaGrade(purity);

  $('modal-stamp').textContent = grade.short;
  $('modal-grade').textContent = grade.full;
  $('modal-weight').textContent = `${dokoWeight.toFixed(2)} kg`;
  $('modal-purity').textContent = `${purity}%`;
  $('modal-crisp').textContent = `${crispSnaps}`;
  $('modal-shoots').textContent = `${total}`;

  const noteEl = $('modal-note');
  const badgeEl = $('appraisal-model-badge');
  if (badgeEl) badgeEl.textContent = 'Gemini 4 Neon · Evaluating…';
  noteEl.textContent = 'The Head Tea Master examines the silver tips under the morning light…';

  $('weigh-modal').classList.add('visible');

  // Request real-time appraisal from Gemini 4 Neon
  fetch('/api/gemini/tea-master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weight: dokoWeight.toFixed(2),
      purity,
      grade: grade.full,
      crispSnaps,
      shoots: total,
      streak,
      timeOfDay: moods[moodIndex].clock + ' · ' + moods[moodIndex].name,
      block: $('block-name').textContent
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res && res.appraisal) {
        noteEl.textContent = res.appraisal;
        if (badgeEl) {
          badgeEl.textContent = `Appraised by ${res.model}`;
        }
      }
    })
    .catch(() => {
      noteEl.textContent = purity >= 90
        ? 'An exquisite Happy Valley First Flush — bright silver-tipped buds snapped cleanly at the tender node, ready for the 1854 hillside withering lofts.'
        : 'The brass scale settles as cool mist drifts up from the Little Rangeet gorge. Releasing inside the golden node ring yields unbruised, aromatic First Flush tea.';
      if (badgeEl) badgeEl.textContent = '1854 Vintage Ledger';
    });
}

function resetForNextRound() {
  weighModalOpen = false;
  $('weigh-modal').classList.remove('visible');

  dokoWeight = 0;
  fineShoots = 0;
  coarseShoots = 0;
  crispSnaps = 0;
  streak = 0;
  handful = [];
  physics.stamina = 1.0;

  moodIndex = (moodIndex + 1) % moods.length;
  for (const s of shootData) {
    if (s.plucked) {
      s.plucked = false;
      dummy.position.copy(s.pos);
      dummy.rotation.set(0, s.rotY, 0);
      dummy.scale.set(s.scale, s.scale, s.scale);
      dummy.updateMatrix();
      shootMesh.setMatrixAt(s.id, dummy.matrix);
    }
  }
  shootMesh.instanceMatrix.needsUpdate = true;
  updateHUD();
  showToast(`${moods[moodIndex].clock} — ${moods[moodIndex].name} arrives across Happy Valley.`, 4200);
  requestSafePointerLock();
}

// Settings UI Wiring
$('opt-sens').addEventListener('input', (e) => {
  lookSensMultiplier = parseFloat(e.target.value);
});
$('opt-vol').addEventListener('input', (e) => {
  audio.setVolume(parseFloat(e.target.value));
});
$('opt-bloom').addEventListener('change', (e) => {
  bloomPass.enabled = e.target.checked;
});
$('opt-hints').addEventListener('change', (e) => {
  $('controls-legend').classList.toggle('hints-hidden', !e.target.checked);
});
$('resume-btn').addEventListener('click', () => setSettingsOpen(false));

document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
  $('lock-reminder').classList.toggle('visible', gameStarted && !isAnyModalOpen() && !isResting && !isPointerLocked);
});

$('start-btn').addEventListener('click', () => {
  audio.init();
  gameStarted = true;
  document.body.classList.remove('cinema-mode');
  document.body.classList.add('started');
  $('title-screen').classList.add('hidden');
  $('hud').classList.add('visible');
  showToast('Hold Left-Click on a bright lime shoot and release inside the golden node ring.', 5800);
  requestSafePointerLock();
});

$('continue-shift-btn').addEventListener('click', resetForNextRound);

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!gameStarted) return;

  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (weighModalOpen) return;
    if (e.code === 'KeyP' || !isPointerLocked) {
      setSettingsOpen(!settingsOpen);
    }
    return;
  }

  if (isAnyModalOpen()) return;

  if (e.code === 'KeyR') {
    isResting = !isResting;
    document.body.classList.toggle('cinema-mode', isResting);
    document.body.classList.toggle('show-peaks', isResting);
    if (isResting) {
      targetYaw = 0.15;   // Aim NNW directly at Kanchenjunga Main (351°)
      targetPitch = 0.11;
    }
  } else if (e.code === 'KeyV') {
    thirdPerson = !thirdPerson;
    playerAvatar.root.visible = thirdPerson;
    fpHands.visible = !thirdPerson;
    showToast(
      thirdPerson
        ? 'Third-Person View — watch your woven bamboo doko fill on your back.'
        : 'First-Person View — tactile plucking hands.',
      2800
    );
  } else if (e.code === 'KeyF') {
    tossCurrentHandful();
  } else if (e.code === 'KeyT') {
    moodIndex = (moodIndex + 1) % moods.length;
    updateHUD();
    showToast(`${moods[moodIndex].clock} — ${moods[moodIndex].name}`, 2800);
  } else if (e.code === 'KeyH') {
    const legend = $('controls-legend');
    const hidden = legend.classList.toggle('hints-hidden');
    $('opt-hints').checked = !hidden;
  } else if (e.code === 'KeyE') {
    if (physics.playerPos.distanceTo(SHED_POS) < 6.4 && (dokoWeight > 0 || handful.length > 0)) {
      openWeighInModal();
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!gameStarted || isAnyModalOpen()) return;
  audio.init();
  if (e.button === 0) {
    if (!isPointerLocked && highlightedShootId < 0) requestSafePointerLock();
    if (!isResting && highlightedShootId >= 0) {
      isPinching = true;
      pinchShootId = highlightedShootId;
      pinchProgress = 0;
      reticle.classList.add('pinching');
      audio.playPinchStart();
    }
  } else if (e.button === 2) {
    isDraggingLook = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0 && isPinching) completePinchSnap();
  if (e.button === 2) isDraggingLook = false;
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousemove', (e) => {
  if (!gameStarted || isAnyModalOpen()) return;
  if (isPointerLocked || isDraggingLook) {
    const baseSens = isResting ? 0.0012 : 0.0021;
    const sens = baseSens * lookSensMultiplier;
    targetYaw -= e.movementX * sens;
    targetPitch = THREE.MathUtils.clamp(targetPitch - e.movementY * sens, -1.2, 1.05);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// =========================================================================
// 7. MAIN ANIMATION, CAMERA RIG, RAYCASTING & PEAK MAP LOOP
// =========================================================================
const clock = new THREE.Clock();
const projVec = new THREE.Vector3();
const hiFine = new THREE.Color(0xf4ff99);
const hiDew = new THREE.Color(0xffffd4);
const hiCoarse = new THREE.Color(0xd69658);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  sharedUniforms.uTime.value = elapsed;

  // Step 120Hz Physics Engine
  const moveF = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
  const moveR = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
  const sprinting = !!(keys['ShiftLeft'] || keys['ShiftRight']);

  physics.update(dt, elapsed, {
    active: gameStarted && !isAnyModalOpen(),
    isResting,
    yaw,
    moveF,
    moveR,
    sprinting,
    dokoWeight,
    dokoTargetKg: DOKO_TARGET_KG
  });

  sharedUniforms.uPlayerPos.value.copy(physics.playerPos);
  updateAtmosphere(dt, physics.playerPos);

  const distStream = Math.abs(physics.playerPos.x - getStreamX(physics.playerPos.z));
  audio.update(dt, physics.currentWind.x * 0.25, isResting, distStream);

  // Animate Happy Valley Factory chimney steam, Kanchenjunga spindrift, mist & dew motes
  for (const p of world.factorySteamPuffs) {
    const life = (elapsed * 0.16 + p.userData.phase) % 1;
    p.position.copy(p.userData.origin).add(
      new THREE.Vector3(life * physics.currentWind.x * 3.8, life * 11.5, life * physics.currentWind.z * 2.5)
    );
    const sc = 0.65 + life * 2.6;
    p.scale.set(sc, sc, 1);
    p.lookAt(camera.position);
  }

  for (const pm of world.spindriftPlumes) {
    pm.position.x = pm.userData.baseX + Math.sin(elapsed * 0.25 + pm.userData.phase) * 28;
    pm.lookAt(camera.position);
  }

  for (const m of world.mistCards) {
    m.position.x += m.userData.speed * physics.currentWind.x * 0.45 * dt;
    if (m.position.x > 270) m.position.x = -270;
    m.lookAt(camera.position.x, m.position.y, camera.position.z);
  }

  const mArr = dewMotes.geometry.attributes.position.array;
  for (let i = 0; i < mArr.length; i += 3) {
    mArr[i]     += Math.sin(elapsed * 0.42 + i) * 0.0038;
    mArr[i + 1] += Math.cos(elapsed * 0.62 + i * 1.3) * 0.0022;
  }
  dewMotes.geometry.attributes.position.needsUpdate = true;

  // Animate Fellow Darjeeling Tea Collectors (scan -> pluck -> toss over shoulder)
  for (const fw of fellowWorkers) {
    const t = elapsed + fw.phase;
    const tossing = ((t % 5.5) / 5.5) > 0.84;
    fw.rig.torsoGroup.rotation.x = tossing ? -0.05 : 0.24 + Math.sin(t * 2.1) * 0.06;
    fw.rig.root.rotation.y = fw.baseRot + Math.sin(t * 0.45) * 0.35;
    fw.rig.rightArm.shoulder.rotation.x = tossing ? -2.35 : -0.85 - Math.sin(t * 4.2) * 0.22;
    fw.rig.rightArm.elbow.rotation.x = tossing ? -0.9 : -0.65;
    fw.rig.leftArm.shoulder.rotation.x = tossing ? -2.1 : -0.78;
    fw.rig.leftArm.elbow.rotation.x = -0.85;
  }

  // Opening Sweeping Vista Camera before Shift Begins
  if (!gameStarted) {
    const cx = Math.sin(elapsed * 0.075) * 11.0;
    const cz = 12.0 + Math.cos(elapsed * 0.055) * 3.5;
    const cy = getTerrainHeight(cx, cz) + 3.4;
    camera.position.set(cx, cy, cz);
    camera.lookAt(cx * 0.35 - 12, cy + 0.2, -95);
    fpHands.visible = false;
    composer.render();
    return;
  }

  // Update SVG Contracting Pinch-Node Ring (r: 33 -> 8; gold sweet-zone at r = 18)
  if (isPinching) {
    pinchProgress += dt / PINCH_DURATION;
    const radius = THREE.MathUtils.lerp(33, 8, Math.min(1, pinchProgress));
    pinchCircle.setAttribute('r', radius.toFixed(1));
    const inSweet = streak >= 3 ? (pinchProgress >= 0.22 && pinchProgress <= 0.84) : (pinchProgress >= 0.36 && pinchProgress <= 0.80);
    pinchCircle.classList.toggle('in-sweet', inSweet);
    pinchCircle.classList.toggle('over', pinchProgress > 0.84);
    if (pinchProgress >= 1.12) completePinchSnap();
  }

  // Camera Smoothing & Character Rig Synchronization
  yaw = THREE.MathUtils.lerp(yaw, targetYaw, Math.min(1, dt * 14));
  pitch = THREE.MathUtils.lerp(pitch, targetPitch, Math.min(1, dt * 14));

  const speed = Math.hypot(physics.playerVel.x, physics.playerVel.z);
  const walkBob = speed > 0.2 ? Math.sin(physics.walkBobPhase) * 0.048 : 0;
  const breath = Math.sin(elapsed * 1.45) * 0.015;
  fpPluckKick = Math.max(0, fpPluckKick - dt * 4.8);
  fpTossAnim = Math.max(0, fpTossAnim - dt * 2.2);

  if (!thirdPerson) {
    fpHands.visible = !isResting;
    camera.position.set(
      physics.playerPos.x,
      physics.playerPos.y + 1.56 + breath + walkBob - fpPluckKick * 0.045,
      physics.playerPos.z
    );
    camera.rotation.set(pitch - fpPluckKick * 0.03, yaw, 0, 'YXZ');

    // Procedural Articulated First-Person Hands
    const aim = highlightedShootId >= 0 ? 1 : 0;
    const tossArc = Math.sin(fpTossAnim * Math.PI);
    const swayX = Math.cos(physics.walkBobPhase * 0.5) * 0.012 * Math.min(1, speed);
    const swayY = Math.abs(Math.sin(physics.walkBobPhase * 0.5)) * 0.014 * Math.min(1, speed);

    fpRight.group.position.set(
      THREE.MathUtils.lerp(0.24, 0.14, aim) + swayX + tossArc * 0.16,
      THREE.MathUtils.lerp(-0.25, -0.17, aim) - swayY + tossArc * 0.28 + fpPluckKick * 0.04,
      THREE.MathUtils.lerp(-0.44, -0.54, aim) + (isPinching ? -0.05 : 0) + tossArc * 0.22
    );
    fpRight.group.rotation.set(
      (isPinching ? -0.35 : 0) + tossArc * 1.15 - fpPluckKick * 0.45,
      -0.25 * aim,
      0.18 + tossArc * 0.45
    );
    const curl = isPinching ? 0.65 + pinchProgress * 0.55 : (fpPluckKick > 0 ? 1.1 : 0.18);
    fpRight.fingers.forEach((f) => { f.rotation.x = -curl; });

    fpLeft.group.position.set(
      -0.22 - swayX - tossArc * 0.14,
      -0.24 - swayY + tossArc * 0.34,
      -0.43 + tossArc * 0.24
    );
    fpLeft.group.rotation.set(0.22 + tossArc * 1.35, 0.35, -0.25 - tossArc * 0.35);
    fpLeft.fingers.forEach((f) => { f.rotation.x = handful.length > 0 ? -0.62 : -0.22; });
  } else {
    // Articulated Third-Person Tea Plucker & Over-Shoulder Cinema Camera
    playerAvatar.root.position.copy(physics.playerPos);
    playerAvatar.root.rotation.y = yaw;
    const stride = Math.sin(physics.walkBobPhase) * Math.min(1, speed / 2.8);
    playerAvatar.leftLeg.rotation.x = stride * 0.55;
    playerAvatar.rightLeg.rotation.x = -stride * 0.55;
    playerAvatar.torsoGroup.rotation.x = (highlightedShootId >= 0 ? 0.22 : 0.06) + fpPluckKick * 0.12 - Math.sin(fpTossAnim * Math.PI) * 0.15;
    playerAvatar.dokoPivot.rotation.x = physics.dokoSpringAngle;
    playerAvatar.rightArm.shoulder.rotation.x = fpTossAnim > 0
      ? -Math.sin(fpTossAnim * Math.PI) * 2.4
      : (highlightedShootId >= 0 ? -0.95 - fpPluckKick * 0.35 : -stride * 0.4);
    playerAvatar.rightArm.elbow.rotation.x = -0.6;
    playerAvatar.leftArm.shoulder.rotation.x = fpTossAnim > 0 ? -Math.sin(fpTossAnim * Math.PI) * 2.2 : -0.68;
    playerAvatar.leftArm.elbow.rotation.x = -0.9;

    const camDist = 3.1;
    const bx = Math.sin(yaw) * Math.cos(pitch) * camDist;
    const bz = Math.cos(yaw) * Math.cos(pitch) * camDist;
    const camY = Math.max(
      getTerrainHeight(physics.playerPos.x + bx, physics.playerPos.z + bz) + 0.55,
      physics.playerPos.y + 2.05 - Math.sin(pitch) * 1.8
    );
    camera.position.set(
      physics.playerPos.x + bx + Math.cos(yaw) * 0.45,
      camY,
      physics.playerPos.z + bz - Math.sin(yaw) * 0.45
    );
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  // Live GPS Coordinates, Dynamic Estate Block Name, Compass & Slope Readout
  const gps = worldToGPS(physics.playerPos.x, physics.playerPos.y, physics.playerPos.z);
  $('gps-readout').textContent = gps.formatted;
  $('block-name').textContent = getEstateBlockName(physics.playerPos.x, physics.playerPos.z);

  const deg = ((Math.round(THREE.MathUtils.radToDeg(-yaw)) % 360) + 360) % 360;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  $('compass-bearing').textContent = `${String(deg).padStart(3, '0')}° ${dirs[Math.round(deg / 22.5) % 16]}`;

  $('stamina-bar').style.width = `${Math.round(physics.stamina * 100)}%`;
  $('slope-status').textContent = isResting
    ? 'Gazing North'
    : `${physics.slopeAngleDeg > 18 ? 'Steep' : 'Steady'} · ${Math.round(physics.slopeAngleDeg)}°`;

  // Project GPS-Accurate Himalayan Peak Callouts in Rest & Gaze Mode
  if (isResting) {
    for (const pk of world.peakWorldPositions) {
      projVec.copy(pk.pos).project(camera);
      const vis = projVec.z < 1 && projVec.x > -0.94 && projVec.x < 0.94 && projVec.y > -0.7 && projVec.y < 0.92;
      pk.el.style.display = vis ? 'flex' : 'none';
      if (vis) {
        pk.el.style.left = `${(projVec.x * 0.5 + 0.5) * window.innerWidth}px`;
        pk.el.style.top  = `${(-projVec.y * 0.5 + 0.5) * window.innerHeight}px`;
      }
    }
  }

  // Center-Reticle Shoot Raycasting (Supports both 1st-Person and 3rd-Person)
  let newHighlight = -1;
  if (!isResting && !isAnyModalOpen()) {
    raycaster.setFromCamera(centerNDC, camera);
    raycaster.far = thirdPerson ? 6.4 : 3.25;
    const hits = raycaster.intersectObject(shootMesh, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const cand = shootData[hits[0].instanceId];
      if (cand && !cand.plucked && cand.pos.distanceTo(physics.playerPos) < 3.5) {
        newHighlight = cand.id;
      }
    }
  }

  if (newHighlight !== highlightedShootId) {
    if (highlightedShootId >= 0 && shootData[highlightedShootId]) {
      shootMesh.setColorAt(highlightedShootId, shootData[highlightedShootId].baseColor);
    }
    highlightedShootId = newHighlight;

    if (highlightedShootId >= 0) {
      const cur = shootData[highlightedShootId];
      const hiCol = cur.type === 'dew' ? hiDew : (cur.type === 'fine' ? hiFine : hiCoarse);
      shootMesh.setColorAt(cur.id, hiCol);
      reticle.className = `hud-fade ${cur.type}${isPinching ? ' pinching' : ''}`;
      reticleLabel.textContent = cur.type === 'dew'
        ? 'Dew-Kissed Silver Tip · Hold & Snap'
        : (cur.type === 'fine' ? 'Fine Flush · Two Leaves & a Bud' : 'Coarse Mature Leaf');
    } else {
      reticle.className = `hud-fade${isPinching ? ' pinching' : ''}`;
    }
    shootMesh.instanceColor.needsUpdate = true;
  }

  // Contextual Weighing Shed Prompt
  const distShed = physics.playerPos.distanceTo(SHED_POS);
  if (distShed < 6.4 && !isAnyModalOpen() && !isResting) {
    const carried = dokoWeight + handful.reduce((sum, h) => sum + h.weight, 0);
    $('prompt-banner').textContent = carried > 0
      ? `[E] Weigh ${carried.toFixed(2)} kg Harvest on the Tola Brass Scale`
      : 'Happy Valley Tola Ghar · Gather tender shoots from the terraces below';
    $('prompt-banner').classList.add('visible');
  } else {
    $('prompt-banner').classList.remove('visible');
  }

  composer.render();
}

// Start render loop and fade out the procedural loading veil once first frame renders
animate();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.body.classList.remove('is-loading');
  });
});