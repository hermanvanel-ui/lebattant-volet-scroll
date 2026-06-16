// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
// MONTAGE — Volet battant procédural (~52 pièces) + ouverture finale
// Pattern : scroll-driven assembly + pivot rotation des vantaux
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─────────────────────────────────────────────────────────────
// PLAN FIXE — une seule caméra, ne bouge pas pendant l'assemblage
// ─────────────────────────────────────────────────────────────
const FIXED_CAMERA = {
  pos:    [3.5, 1.2, 4.5],   // 3/4 front, légère plongée
  target: [0.0, 0.75, 0.0],  // centre du volet
  fov:    35,
};

const Easing = {
  linear: t => t,
  easeInCubic: t => t*t*t,
  easeOutCubic: t => 1 - Math.pow(1-t, 3),
  easeInOutCubic: t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,
  easeOutQuart: t => 1 - Math.pow(1-t, 4),
  easeInOutQuart: t => t<0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2, 4)/2,
  easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10*t),
};
const clamp01 = v => Math.max(0, Math.min(1, v));
const invLerp = (a,b,v) => clamp01((v-a)/(b-a));
const smoothstep = (a,b,v) => { const t = clamp01((v-a)/(b-a)); return t*t*(3-2*t); };
const lerp = (a,b,t) => a + (b-a) * t;

FIXED_CAMERA.posV = new THREE.Vector3(...FIXED_CAMERA.pos);
FIXED_CAMERA.targetV = new THREE.Vector3(...FIXED_CAMERA.target);

// ─────────────────────────────────────────────────────────────
// Renderer + scene + camera
// ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('three-canvas');
const loaderEl = document.getElementById('three-loader');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(FIXED_CAMERA.fov, 2, 0.1, 200);
camera.position.copy(FIXED_CAMERA.posV);
camera.lookAt(FIXED_CAMERA.targetV);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

new RGBELoader().load('assets/hdri/studio.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = envMap;
  hdr.dispose();
  console.log('HDR studio chargée');
}, undefined, () => console.warn('HDR fallback'));

// ─────────────────────────────────────────────────────────────
// Lighting — 3-point Fight Night (warm key + cool fill + rouge sang rim)
// ─────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0x808088, 0x14141A, 0.5));

const keyLight = new THREE.DirectionalLight(0xfff0d0, 4.0);
keyLight.position.set(-4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0005;
keyLight.shadow.camera.left = -5; keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 4; keyLight.shadow.camera.bottom = -2;
keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 25;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xc8d8ff, 2.0);
fillLight.position.set(4, 3, 4);
scene.add(fillLight);

const topStrip = new THREE.RectAreaLight(0xffffff, 3.0, 4, 2);
topStrip.position.set(0, 5, 0);
topStrip.lookAt(0, 0, 0);
scene.add(topStrip);

const rimLight = new THREE.SpotLight(0xc5322d, 16, 20, Math.PI / 5, 0.6, 1.5);
rimLight.position.set(-3, 3, -3);
rimLight.target.position.set(0, 0.75, 0);
scene.add(rimLight, rimLight.target);

// ─────────────────────────────────────────────────────────────
// Floor
// ─────────────────────────────────────────────────────────────
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(15, 64),
  new THREE.MeshStandardMaterial({ color: 0x0a0608, roughness: 0.45, metalness: 0.4 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ─────────────────────────────────────────────────────────────
// MATÉRIAUX Le battant
// ─────────────────────────────────────────────────────────────
const M = {
  // Cadre dormant — alu thermolaqué noir profond
  dormant: new THREE.MeshPhysicalMaterial({
    color: 0x14141A, metalness: 0.65, roughness: 0.45,
    clearcoat: 0.30, clearcoatRoughness: 0.35,
    envMapIntensity: 1.1,
  }),
  // Vantail — vert deep thermolaqué (signature Le battant)
  vantail: new THREE.MeshPhysicalMaterial({
    color: 0x4A6347, metalness: 0.55, roughness: 0.45,
    clearcoat: 0.30, clearcoatRoughness: 0.30,
    envMapIntensity: 1.2,
  }),
  // Lames — vert volet plus clair
  lame: new THREE.MeshPhysicalMaterial({
    color: 0x5A7656, metalness: 0.55, roughness: 0.42,
    clearcoat: 0.30, clearcoatRoughness: 0.30,
    envMapIntensity: 1.2,
  }),
  // Inox 316 brossé — gonds, paumelles, tringle
  inox: new THREE.MeshPhysicalMaterial({
    color: 0xc8cad0, metalness: 1.0, roughness: 0.22,
    envMapIntensity: 1.8,
  }),
  // Chrome — poignées
  chrome: new THREE.MeshPhysicalMaterial({
    color: 0xeeeeee, metalness: 1.0, roughness: 0.05,
    envMapIntensity: 2.5,
  }),
  // Rouge sang — accents quincaillerie (verrous)
  rouge: new THREE.MeshPhysicalMaterial({
    color: 0xC5322D, metalness: 0.6, roughness: 0.30,
    clearcoat: 0.8, clearcoatRoughness: 0.1,
    envMapIntensity: 1.4,
  }),
};

// Toutes les matériaux passent en transparent pour fade-in
for (const key in M) {
  M[key].transparent = true;
}

// ─────────────────────────────────────────────────────────────
// STAGES — timing
// ─────────────────────────────────────────────────────────────
const STAGES = {
  dormant:      [0.05, 0.18],
  gonds:        [0.16, 0.28],
  cadres:       [0.26, 0.38],
  lames:        [0.36, 0.62],   // cascade longue (les 24 lames)
  paumelles:    [0.60, 0.70],
  zbar:         [0.66, 0.74],
  espagnolette: [0.72, 0.84],
  poignees:     [0.80, 0.86],
};

const FROM_DIRS = {
  above:      new THREE.Vector3(0, 1, 0),
  below:      new THREE.Vector3(0, -1, 0),
  left:       new THREE.Vector3(-1, 0, 0),
  right:      new THREE.Vector3(1, 0, 0),
  front:      new THREE.Vector3(0, 0, 1),
  back:       new THREE.Vector3(0, 0, -1),
  aboveLeft:  new THREE.Vector3(-1, 1, 0).normalize(),
  aboveRight: new THREE.Vector3(1, 1, 0).normalize(),
  aboveFront: new THREE.Vector3(0, 1, 1).normalize(),
};

// ─────────────────────────────────────────────────────────────
// Sub-groups : vantaux pour rotation autour des charnières
// ─────────────────────────────────────────────────────────────
const assembly = new THREE.Group();
scene.add(assembly);

// Vantail gauche : pivot autour du montant gauche (charnière)
const leftSash = new THREE.Group();
leftSash.position.set(-1.0, 0, 0); // pivot au monde
assembly.add(leftSash);

// Vantail droit : pivot autour du montant droit (charnière)
const rightSash = new THREE.Group();
rightSash.position.set(1.0, 0, 0);
assembly.add(rightSash);

const carParts = []; // toutes les pièces animées

function registerPart(node, parent, stage, fromKey = 'above', fromMag = 3.0) {
  node.userData.finalPos = node.position.clone();
  node.userData.fromOffset = (FROM_DIRS[fromKey] || FROM_DIRS.above).clone().multiplyScalar(fromMag);

  const [stageStart, stageEnd] = STAGES[stage];
  const range = stageEnd - stageStart;
  const idx = carParts.length;
  const jitter = ((idx * 37) % 100) / 100;
  const start = stageStart + jitter * 0.55 * range;
  const partDur = 0.04 + (1 - jitter) * 0.05;
  node.userData.scrollStart = start;
  node.userData.scrollEnd = Math.min(stageEnd + 0.02, start + partDur);

  node.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material)) {
      o.userData._origOp = o.material.opacity ?? 1;
    }
  });

  node.position.copy(node.userData.finalPos).add(node.userData.fromOffset);
  node.visible = false;

  carParts.push(node);
  parent.add(node);
  return node;
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}
function cyl(rT, rB, h, mat, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg), mat);
  m.castShadow = true;
  return m;
}

// ─────────────────────────────────────────────────────────────
// 1. DORMANT (cadre fixe sur le mur) — 4 pièces
// ─────────────────────────────────────────────────────────────
function buildDormant() {
  // Linteau (haut)
  const linteau = box(2.10, 0.08, 0.10, M.dormant);
  linteau.position.set(0, 1.46, -0.05);
  registerPart(linteau, assembly, 'dormant', 'back', 2.5);

  // Seuil (bas)
  const seuil = box(2.10, 0.08, 0.10, M.dormant);
  seuil.position.set(0, 0.04, -0.05);
  registerPart(seuil, assembly, 'dormant', 'back', 2.5);

  // Montants
  for (const x of [-1.05, 1.05]) {
    const montant = box(0.08, 1.50, 0.10, M.dormant);
    montant.position.set(x, 0.75, -0.05);
    registerPart(montant, assembly, 'dormant', x < 0 ? 'aboveLeft' : 'aboveRight', 2.5);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. GONDS muraux (4 pièces — 2 par côté)
// ─────────────────────────────────────────────────────────────
function buildGonds() {
  for (const x of [-1.00, 1.00]) {
    for (const y of [0.30, 1.20]) {
      // Pin du gond (cylindre vertical)
      const pin = cyl(0.025, 0.025, 0.10, M.inox, 16);
      pin.position.set(x, y, 0.02);
      registerPart(pin, assembly, 'gonds', x < 0 ? 'left' : 'right', 1.5);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 3. CADRES OUVRANTS — 4 traverses par vantail (8 total)
//    Positions LOCALES aux sub-groups (leftSash/rightSash)
// ─────────────────────────────────────────────────────────────
function buildCadre(parent, sashSide) {
  // sashSide = +1 (droit, parent rightSash à x=+1.0) ou -1 (gauche, parent leftSash à x=-1.0)
  // Vantail centré localement à x = -sashSide * 0.5 (s'éloigne du pivot)
  const cx = -sashSide * 0.5; // centre du vantail en local

  // Traverse haute
  const tH = box(0.95, 0.07, 0.04, M.vantail);
  tH.position.set(cx, 1.38, 0.06);
  registerPart(tH, parent, 'cadres', 'above', 3);

  // Traverse basse
  const tB = box(0.95, 0.07, 0.04, M.vantail);
  tB.position.set(cx, 0.12, 0.06);
  registerPart(tB, parent, 'cadres', 'above', 3);

  // Montant charnière (côté gond)
  const mH = box(0.06, 1.34, 0.04, M.vantail);
  mH.position.set(cx - sashSide * 0.445, 0.75, 0.06);
  registerPart(mH, parent, 'cadres', sashSide < 0 ? 'right' : 'left', 3);

  // Montant central (côté espagnolette)
  const mC = box(0.06, 1.34, 0.04, M.vantail);
  mC.position.set(cx + sashSide * 0.445, 0.75, 0.06);
  registerPart(mC, parent, 'cadres', sashSide < 0 ? 'left' : 'right', 3);
}

// ─────────────────────────────────────────────────────────────
// 4. LAMES horizontales — 12 par vantail (24 total)
// ─────────────────────────────────────────────────────────────
function buildLames(parent, sashSide) {
  const cx = -sashSide * 0.5;
  // 12 lames de y=0.20 à y=1.30, espacement 0.10
  for (let i = 0; i < 12; i++) {
    const y = 0.22 + i * 0.094;
    const lame = box(0.85, 0.07, 0.025, M.lame);
    lame.position.set(cx, y, 0.06);
    // Arrive depuis le haut, en cascade (le jitter dans registerPart cascade les timings)
    registerPart(lame, parent, 'lames', 'above', 4);
  }
}

// ─────────────────────────────────────────────────────────────
// 5. PAUMELLES (4 — 2 par vantail)
// ─────────────────────────────────────────────────────────────
function buildPaumelles(parent, sashSide) {
  // Position locale : sur le montant charnière, au niveau des gonds (y=0.30 et y=1.20)
  // Position en monde : (sashSide * 0.92, y, 0.04) — légèrement décalé devant le gond
  // En local au sub-group : (sashSide * 0.92 - sashSide * 1.0, y, 0.04) = (-sashSide * 0.08, y, 0.04)
  const localX = -sashSide * 0.08;
  for (const y of [0.30, 1.20]) {
    const paum = box(0.07, 0.08, 0.07, M.inox);
    paum.position.set(localX, y, 0.04);
    registerPart(paum, parent, 'paumelles', sashSide < 0 ? 'right' : 'left', 2);
  }
}

// ─────────────────────────────────────────────────────────────
// 6. BARRE Z décorative (1 par vantail)
// ─────────────────────────────────────────────────────────────
function buildZBar(parent, sashSide) {
  const cx = -sashSide * 0.5;
  // Diagonale du bas-charnière au haut-central
  const zbar = box(1.05, 0.04, 0.020, M.vantail);
  zbar.position.set(cx, 0.75, 0.085);
  // Angle : opposé selon le sens du vantail
  zbar.rotation.z = sashSide < 0 ? 0.85 : -0.85;
  registerPart(zbar, parent, 'zbar', 'front', 2);
}

// ─────────────────────────────────────────────────────────────
// 7. POIGNÉE de vantail (1 par vantail, côté central)
// ─────────────────────────────────────────────────────────────
function buildPoignee(parent, sashSide) {
  const cx = -sashSide * 0.5;
  // Poignée verticale sur le montant central, au milieu
  const localX = cx + sashSide * 0.40;
  const tige = box(0.04, 0.22, 0.04, M.chrome);
  tige.position.set(localX, 0.75, 0.10);
  registerPart(tige, parent, 'poignees', 'front', 2);
}

// ─────────────────────────────────────────────────────────────
// 8. ESPAGNOLETTE centrale (4 pièces, sur l'assembly directement)
// ─────────────────────────────────────────────────────────────
function buildEspagnolette() {
  // Tringle verticale centrale (entre les 2 montants centraux des vantaux)
  const tringle = cyl(0.025, 0.025, 1.20, M.inox, 16);
  tringle.position.set(0, 0.75, 0.09);
  registerPart(tringle, assembly, 'espagnolette', 'above', 3);

  // Verrou haut
  const vH = box(0.05, 0.06, 0.05, M.rouge);
  vH.position.set(0, 1.38, 0.09);
  registerPart(vH, assembly, 'espagnolette', 'above', 2);

  // Verrou bas
  const vB = box(0.05, 0.06, 0.05, M.rouge);
  vB.position.set(0, 0.12, 0.09);
  registerPart(vB, assembly, 'espagnolette', 'below', 2);

  // Poignée centrale (boutonnière)
  const poignee = box(0.06, 0.10, 0.10, M.chrome);
  poignee.position.set(0, 0.75, 0.13);
  registerPart(poignee, assembly, 'espagnolette', 'front', 2);
}

// ─────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────
buildDormant();
buildGonds();

// Vantail gauche : sashSide = -1, parent = leftSash
buildCadre(leftSash, -1);
buildLames(leftSash, -1);
buildPaumelles(leftSash, -1);
buildZBar(leftSash, -1);
buildPoignee(leftSash, -1);

// Vantail droit : sashSide = +1, parent = rightSash
buildCadre(rightSash, +1);
buildLames(rightSash, +1);
buildPaumelles(rightSash, +1);
buildZBar(rightSash, +1);
buildPoignee(rightSash, +1);

buildEspagnolette();

console.log(`Volet procédural : ${carParts.length} pièces animées`);

if (loaderEl) {
  loaderEl.style.opacity = '0';
  setTimeout(() => { if (loaderEl) loaderEl.style.display = 'none'; }, 600);
}

// ─────────────────────────────────────────────────────────────
// Post-processing
// ─────────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 768), 0.4, 0.9, 0.85);
composer.addPass(bloom);

const ChromaticShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.0010 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec2 off = d * uAmount * r2 * 4.0;
      float r = texture2D(tDiffuse, vUv + off).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - off).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }`,
};
composer.addPass(new ShaderPass(ChromaticShader));

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uOffset: { value: 1.35 }, uDarkness: { value: 0.30 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uOffset; uniform float uDarkness; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * uOffset;
      float v = smoothstep(0.85, 0.2, 1.0 - dot(uv, uv));
      c.rgb *= mix(1.0, v, uDarkness);
      gl_FragColor = c;
    }`,
};
composer.addPass(new ShaderPass(VignetteShader));

composer.addPass(new OutputPass());

// ─────────────────────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────────────────────
function resize() {
  const stage = canvas.parentElement;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ─────────────────────────────────────────────────────────────
// Caméra : plan fixe — ne bouge jamais pendant l'assemblage
// ─────────────────────────────────────────────────────────────
const track = document.querySelector('.genesis-track');
function getScrollProgress() {
  if (!track) return 0;
  const rect = track.getBoundingClientRect();
  const viewH = window.innerHeight;
  const scrollable = rect.height - viewH;
  if (scrollable <= 0) return 0;
  return clamp01(-rect.top / scrollable);
}

// 8 "étapes" du scroll pour piloter les captions UI (pas la caméra)
function getStepIndex(scroll) {
  return Math.min(7, Math.floor(scroll * 8));
}

// ─────────────────────────────────────────────────────────────
// Animation des pièces + ouverture finale des vantaux
// ─────────────────────────────────────────────────────────────
function updateAssembly(p) {
  for (const node of carParts) {
    const sP = node.userData.scrollStart;
    const eP = node.userData.scrollEnd;
    if (p < sP - 0.005) {
      node.visible = false;
      continue;
    }
    node.visible = true;
    const tRaw = (p - sP) / (eP - sP);
    const t = Easing.easeOutQuart(clamp01(tRaw));
    const fp = node.userData.finalPos;
    const fo = node.userData.fromOffset;
    node.position.x = fp.x + fo.x * (1 - t);
    node.position.y = fp.y + fo.y * (1 - t);
    node.position.z = fp.z + fo.z * (1 - t);
    const opa = clamp01(t * 1.4);
    node.traverse((o) => {
      if (o.isMesh && o.material && !Array.isArray(o.material)) {
        o.material.opacity = (o.userData._origOp ?? 1) * opa;
      }
    });
  }

  // OUVERTURE FINALE des vantaux — scroll 0.88 → 1.0
  // Vantail gauche ouvre vers la gauche (rot Y négatif depuis pivot)
  // Vantail droit ouvre vers la droite (rot Y positif depuis pivot)
  const openT = smoothstep(0.88, 1.00, p);
  const openAngle = openT * 1.15; // ~66°
  leftSash.rotation.y = -openAngle;
  rightSash.rotation.y = +openAngle;
}

// ─────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────
const captionTitles = document.querySelectorAll('.caption-title');
const captionBodies = document.querySelectorAll('.caption-body');
const stepNum = document.querySelector('.caption-step .step-num');
const progressFill = document.querySelector('.progress-fill');
const progressDots = document.querySelectorAll('.progress-steps .dot');
let lastShot = -1;

function updateUI(shotIndex, scrollProgress) {
  if (shotIndex !== lastShot) {
    lastShot = shotIndex;
    captionTitles.forEach((t, i) => t.classList.toggle('hidden', i !== shotIndex));
    captionBodies.forEach((t, i) => t.classList.toggle('hidden', i !== shotIndex));
    if (stepNum) stepNum.textContent = String(shotIndex + 1).padStart(2, '0');
    progressDots.forEach((d, i) => d.classList.toggle('active', i <= shotIndex));
  }
  if (progressFill) progressFill.style.right = `${(1 - scrollProgress) * 100}%`;
}

// ─────────────────────────────────────────────────────────────
// Render loop
// ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const p = getScrollProgress();

  // Caméra fixe — pas de mise à jour position/target/fov
  updateAssembly(p);
  updateUI(getStepIndex(p), p);

  composer.render();
  requestAnimationFrame(tick);
}
tick();
