import * as THREE from 'three';
import { seededRandom } from './geo.js';

// =========================================================================
// HIGH-DETAIL PAINTERLY BOTANICAL & MATERIAL TEXTURE GENERATORS
// Zero external image files — crafted specifically for Darjeeling's flora
// =========================================================================

// --- Noise helpers for organic variation ---
function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function fbm(x, y, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * hash2(x * f, y * f); a *= 0.5; f *= 2.1; }
  return v;
}

// 1. Dense overlapping small-leaf mat texture wrapped onto tea bushes
//    (eliminates smooth/faceted low-poly polygon look completely)
export function createTeaCanopyMatTexture() {
  const SIZE = 1024;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');

  // Deep shaded interior canopy base
  ctx.fillStyle = '#143319';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const r = seededRandom(412);
  const palette = [
    ['#18421e', '#285e27'],
    ['#1f5224', '#37782e'],
    ['#276329', '#499135'],
    ['#32752e', '#62ad3c'],
    ['#3e8532', '#7ec447']
  ];

  // Paint ~1,400 overlapping small serrated Camellia sinensis leaves
  for (let i = 0; i < 1450; i++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    const ang = r() * Math.PI * 2;
    const len = 28 + r() * 36; // scaled for 1024
    const w = 11 + r() * 13;
    const tier = Math.min(palette.length - 1, Math.floor((i / 1450) * palette.length));
    const [dark, light] = palette[tier];

    // Wrap across edges for seamless tiling
    for (const ox of [-SIZE, 0, SIZE]) {
      for (const oy of [-SIZE, 0, SIZE]) {
        const px = x + ox, py = y + oy;
        if (px < -70 || px > SIZE + 70 || py < -70 || py > SIZE + 70) continue;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);

        // Soft drop shadow beneath each leaf layer for lush depth
        ctx.fillStyle = 'rgba(8, 22, 10, 0.32)';
        ctx.beginPath();
        ctx.ellipse(2, -len * 0.45 + 2, w * 0.72, len * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();

        const g = ctx.createLinearGradient(0, 0, 0, -len);
        g.addColorStop(0, dark);
        g.addColorStop(1, light);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-w, -len * 0.3, -w * 0.8, -len * 0.78, 0, -len);
        ctx.bezierCurveTo(w * 0.8, -len * 0.78, w, -len * 0.3, 0, 0);
        ctx.fill();

        // Crisp central midrib highlight
        ctx.strokeStyle = 'rgba(215, 245, 145, 0.32)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(0, -len * 0.86);
        ctx.stroke();

        ctx.restore();
      }
    }
  }

  // fbm-based dark vein pattern: darken pixels in a grid where fbm < 0.35
  for (let gy = 0; gy < SIZE; gy += 4) {
    for (let gx = 0; gx < SIZE; gx += 4) {
      const n = fbm(gx / 80, gy / 80);
      if (n < 0.35) {
        ctx.fillStyle = 'rgba(6,16,8,0.38)';
        ctx.fillRect(gx, gy, 4, 4);
      }
    }
  }

  // Subtle moss/lichen overlay — 200 tiny sage ellipses
  for (let i = 0; i < 200; i++) {
    const mx = r() * SIZE;
    const my = r() * SIZE;
    const rw = 3 + r() * 9;
    const rh = 2 + r() * 6;
    const ma = r() * Math.PI;
    ctx.fillStyle = 'rgba(80,110,70,0.18)';
    ctx.beginPath();
    ctx.ellipse(mx, my, rw, rh, ma, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leaf-vein highlights at 15% opacity
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = 'rgba(220,250,160,1)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 120; i++) {
    const vx = r() * SIZE;
    const vy = r() * SIZE;
    const vlen = 18 + r() * 40;
    const va = r() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + Math.cos(va) * vlen, vy + Math.sin(va) * vlen);
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 2.2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 2. Delicate multi-shoot tea-leaf sprig silhouette for top-canopy tufts
export function createTeaLeafSprigTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  const r = seededRandom(884);
  // Paint 16 small, finely proportioned Camellia leaves radiating naturally
  const leaves = [];
  for (let i = 0; i < 16; i++) {
    const frac = i / 15;
    const side = i % 2 === 0 ? -1 : 1;
    leaves.push({
      x: 128 + side * (4 + r() * 24),
      y: 222 - frac * 112 + (r() - 0.5) * 14,
      ang: side * (0.22 + (1 - frac) * 0.95) + (r() - 0.5) * 0.25,
      len: 44 + r() * 34,
      w: 14 + r() * 10,
      bright: frac
    });
  }

  ctx.strokeStyle = '#362719';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(128, 250);
  ctx.quadraticCurveTo(124, 185, 128, 108);
  ctx.stroke();

  for (const l of leaves) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.ang);

    const g = ctx.createLinearGradient(0, 0, 0, -l.len);
    const gBase = Math.round(74 + l.bright * 58);
    const gTip = Math.round(135 + l.bright * 82);
    g.addColorStop(0, `rgb(${Math.round(30 + l.bright * 28)}, ${gBase}, ${Math.round(32 + l.bright * 14)})`);
    g.addColorStop(1, `rgb(${Math.round(85 + l.bright * 88)}, ${gTip}, ${Math.round(48 + l.bright * 38)})`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-l.w, -l.len * 0.28, -l.w * 0.82, -l.len * 0.78, 0, -l.len);
    ctx.bezierCurveTo(l.w * 0.82, -l.len * 0.78, l.w, -l.len * 0.28, 0, 0);
    ctx.fill();

    ctx.strokeStyle = 'rgba(225, 252, 158, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(0, -l.len * 0.88);
    ctx.stroke();

    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 3. Feathery bipinnate Albizia shade-tree foliage cluster (airy Ghibli canopy!)
export function createAlbiziaCanopyTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  const r = seededRandom(519);

  // Fine radiating dark twigs
  ctx.strokeStyle = 'rgba(62, 46, 33, 0.78)';
  ctx.lineWidth = 3;
  for (let b = 0; b < 14; b++) {
    const ang = (b / 14) * Math.PI * 2 + (r() - 0.5) * 0.25;
    const len = 110 + r() * 95;
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.quadraticCurveTo(
      256 + Math.cos(ang + 0.15) * len * 0.5,
      256 + Math.sin(ang + 0.15) * len * 0.5,
      256 + Math.cos(ang) * len,
      256 + Math.sin(ang) * len
    );
    ctx.stroke();
  }

  // Hundreds of feathery fern-like Albizia leaflets clustered organically
  for (let i = 0; i < 680; i++) {
    const dist = Math.pow(r(), 0.65) * 215;
    const ang = r() * Math.PI * 2;
    const x = 256 + Math.cos(ang) * dist;
    const y = 256 + Math.sin(ang) * dist;
    const leafAng = ang + (r() - 0.5) * 1.3;
    const len = 14 + r() * 20;
    const w = 4.2 + r() * 4.8;
    const lit = 1.0 - dist / 245 + (r() - 0.5) * 0.35;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(leafAng);
    const rv = Math.round(38 + Math.max(0, lit) * 68);
    const gv = Math.round(78 + Math.max(0, lit) * 92);
    const bv = Math.round(34 + Math.max(0, lit) * 26);
    ctx.fillStyle = `rgb(${rv}, ${gv}, ${bv})`;
    ctx.beginPath();
    ctx.ellipse(0, -len * 0.5, w, len * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 4. Layered Himalayan Dhupi (Cryptomeria japonica) cedar-pine bough needles
export function createDhupiBranchTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  const r = seededRandom(733);
  for (let i = 0; i < 620; i++) {
    const dist = Math.pow(r(), 0.62) * 210;
    const ang = r() * Math.PI * 2;
    const x = 256 + Math.cos(ang) * dist;
    const y = 256 + Math.sin(ang) * dist;
    const nAng = ang + (r() - 0.5) * 0.9;
    const len = 24 + r() * 26;
    const bright = (1 - dist / 240) * 0.7 + r() * 0.3;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(nAng);
    ctx.strokeStyle = `rgb(${Math.round(24 + bright * 34)}, ${Math.round(56 + bright * 58)}, ${Math.round(32 + bright * 24)})`;
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len);
    ctx.stroke();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 5. Roadside Himalayan Fern & Wildflower / Marigold Sprigs for playable foreground
export function createFernAndFlowerTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  // Arching lush fern fronds
  const fronds = [-0.72, -0.38, -0.05, 0.32, 0.68];
  for (const ang of fronds) {
    ctx.save();
    ctx.translate(128, 246);
    ctx.rotate(ang);
    ctx.strokeStyle = '#2c5927';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -185);
    ctx.stroke();

    for (let y = 26; y < 178; y += 11) {
      const span = (1 - y / 205) * 32;
      ctx.fillStyle = y > 110 ? '#5ea339' : '#3a7a2e';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * span * 0.5, -y, span * 0.55, 4.2, s * -0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Delicate hillside wildflowers (warm golden marigolds & pale pink cosmos)
  const blooms = [
    { x: 90, y: 112, col: '#f2b83b', core: '#b35912', rad: 10 },
    { x: 162, y: 100, col: '#f7c948', core: '#b35912', rad: 11 },
    { x: 128, y: 78, col: '#f5dce6', core: '#e6b835', rad: 9 },
    { x: 64, y: 152, col: '#f2a63b', core: '#994411', rad: 8 },
    { x: 188, y: 146, col: '#f2d9e4', core: '#e6b835', rad: 8 }
  ];
  for (const fl of blooms) {
    ctx.fillStyle = fl.col;
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fl.x + Math.cos(a) * fl.rad * 0.55, fl.y + Math.sin(a) * fl.rad * 0.55, fl.rad * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = fl.core;
    ctx.beginPath();
    ctx.arc(fl.x, fl.y, fl.rad * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lotus-like flowers (3–5 concentric-petal blooms in pale pink/white)
  const lotusPositions = [
    { x: 44, y: 80 }, { x: 210, y: 68 }, { x: 130, y: 48 },
    { x: 72, y: 185 }, { x: 196, y: 190 }
  ];
  for (const lp of lotusPositions) {
    const petalCount = 8;
    const outerR = 7 + Math.random() * 4;
    // Outer ring of petals
    for (let p = 0; p < petalCount; p++) {
      const a = (p / petalCount) * Math.PI * 2;
      ctx.fillStyle = 'rgba(240,220,210,0.7)';
      ctx.beginPath();
      ctx.ellipse(
        lp.x + Math.cos(a) * outerR * 0.7,
        lp.y + Math.sin(a) * outerR * 0.7,
        outerR * 0.55, outerR * 0.9,
        a, 0, Math.PI * 2
      );
      ctx.fill();
    }
    // Inner petals slightly smaller
    for (let p = 0; p < petalCount; p++) {
      const a = (p / petalCount) * Math.PI * 2 + Math.PI / petalCount;
      ctx.fillStyle = 'rgba(255,235,228,0.6)';
      ctx.beginPath();
      ctx.ellipse(
        lp.x + Math.cos(a) * outerR * 0.35,
        lp.y + Math.sin(a) * outerR * 0.35,
        outerR * 0.3, outerR * 0.52,
        a, 0, Math.PI * 2
      );
      ctx.fill();
    }
    // Golden centre
    ctx.fillStyle = 'rgba(240,210,100,0.85)';
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, outerR * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dewdrop highlights: 15–25 tiny white circles
  const dewCount = 15 + Math.floor(Math.random() * 11);
  for (let d = 0; d < dewCount; d++) {
    const dx = 10 + Math.random() * 236;
    const dy = 10 + Math.random() * 236;
    const dr = 2 + Math.random() * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(dx, dy, dr, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 6. Mossy Himalayan tree bark texture
export function createBarkTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Base color using fbm to vary between dark sienna and warm umber
  const imgData = ctx.createImageData(256, 256);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const t = fbm(px / 48, py / 48);
      // Sienna: (71, 57, 46) — Umber: (101, 76, 54)
      const rr = Math.round(71 + t * 30);
      const gg = Math.round(57 + t * 19);
      const bb = Math.round(46 + t * 8);
      const idx = (py * 256 + px) * 4;
      imgData.data[idx] = rr;
      imgData.data[idx + 1] = gg;
      imgData.data[idx + 2] = bb;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const r = seededRandom(612);

  // fbm-driven organic longitudinal ridges
  for (let i = 0; i < 180; i++) {
    const baseX = r() * 256;
    const dark = r() > 0.45;
    ctx.strokeStyle = dark ? 'rgba(28, 18, 12, 0.48)' : 'rgba(130, 108, 88, 0.3)';
    ctx.lineWidth = 1.5 + r() * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Start at top, follow fbm-warped path down
    let cx = baseX;
    ctx.moveTo(cx, 0);
    const steps = 16;
    for (let s = 1; s <= steps; s++) {
      const sy = (s / steps) * 256;
      // Lateral drift driven by fbm
      cx += (fbm(baseX / 60 + s * 0.3, sy / 60) - 0.5) * 14;
      cx = Math.max(0, Math.min(255, cx));
      ctx.lineTo(cx, sy);
    }
    ctx.stroke();
  }

  // Knot-like circular distortions at 2–3 random positions
  const knotCount = 2 + Math.floor(r() * 2);
  for (let k = 0; k < knotCount; k++) {
    const kx = 30 + r() * 196;
    const ky = 30 + r() * 196;
    const kr = 10 + r() * 18;
    // Dark concentric rings
    for (let ring = 3; ring >= 0; ring--) {
      const alpha = 0.12 + ring * 0.06;
      ctx.strokeStyle = `rgba(20, 12, 8, ${alpha})`;
      ctx.lineWidth = 2.5 - ring * 0.4;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr + ring * 5, (kr + ring * 5) * 0.68, r() * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Central knot highlight
    ctx.fillStyle = 'rgba(55, 38, 28, 0.72)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr * 0.42, kr * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft Darjeeling mist-moss patches on bark
  for (let i = 0; i < 65; i++) {
    ctx.fillStyle = `rgba(68, 108, 48, ${0.14 + r() * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(r() * 256, r() * 256, 8 + r() * 22, 16 + r() * 34, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 7. Traditional Darjeeling woven saree / gunyu cloth with golden brocade border
export function createSareeFabricTexture(primaryHex, borderHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle vertical pleated fold shading + fine woven loom threads
  for (let x = 0; x < 256; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0.0, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.08)');
    g.addColorStop(1.0, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, 256);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 1);

  // Ornamental brocade border along lower hem
  ctx.fillStyle = borderHex;
  ctx.fillRect(0, 212, 256, 36);
  ctx.fillStyle = 'rgba(255, 240, 195, 0.55)';
  ctx.fillRect(0, 214, 256, 3);
  ctx.fillRect(0, 242, 256, 3);
  for (let x = 8; x < 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 222);
    ctx.lineTo(x + 5, 229);
    ctx.lineTo(x, 236);
    ctx.lineTo(x - 5, 229);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 8. Soft circular glowing sunlight bokeh sprite (fixes white square motes!)
export function createDewParticleTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0.0, 'rgba(255, 252, 225, 1.0)');
  g.addColorStop(0.38, 'rgba(255, 242, 196, 0.55)');
  g.addColorStop(1.0, 'rgba(255, 235, 175, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 9. Fine woven diagonal split-bamboo lattice for Darjeeling Dokos
export function createBambooWeaveTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#825d30';
  ctx.fillRect(0, 0, 256, 256);

  const step = 12;
  const r = seededRandom(303);
  for (let y = 0; y < 256; y += step) {
    for (let x = 0; x < 256; x += step) {
      const alt = ((Math.floor(x / step) + Math.floor(y / step)) & 1) === 0;
      const j = Math.floor((r() - 0.5) * 14);
      ctx.fillStyle = alt
        ? `rgb(${202 + j}, ${158 + j}, ${96 + j})`
        : `rgb(${128 + j}, ${90 + j}, ${46 + j})`;
      ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
      ctx.fillStyle = alt ? 'rgba(255, 238, 198, 0.24)' : 'rgba(26, 15, 5, 0.28)';
      ctx.fillRect(x + 2, y + 2, step - 4, 2.5);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 10. Hand-painted Himalayan schist dry-stone terrace wall with mossy seams
export function createStoneWallTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  // fbm-based mortar color background (not uniform grey)
  const imgData = ctx.createImageData(256, 256);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const n = fbm(px / 12, py / 12);
      // Lerp between #6a6560 (106,101,96) and #9a9490 (154,148,144)
      const rr = Math.round(106 + n * 48);
      const gg = Math.round(101 + n * 47);
      const bb = Math.round(96 + n * 48);
      const idx = (py * 256 + px) * 4;
      imgData.data[idx] = rr;
      imgData.data[idx + 1] = gg;
      imgData.data[idx + 2] = bb;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const r = seededRandom(77);
  // Aspect ratio multipliers per row for variety
  const rowAspects = [1.0, 1.4, 0.8, 1.2, 1.6, 0.9, 1.1, 1.3];
  for (let row = 0; row < 8; row++) {
    let x = (row % 2) * -18;
    const y = row * 32;
    const aspect = rowAspects[row] || 1.0;
    while (x < 256) {
      const w = (34 + r() * 36) * aspect;
      const sh = 84 + Math.floor(r() * 48);
      const isMossy = r() > 0.62;
      ctx.fillStyle = isMossy
        ? `rgb(${sh - 16}, ${sh + 16}, ${sh - 24})`
        : `rgb(${sh + 6}, ${sh + 3}, ${sh - 4})`;
      ctx.fillRect(x + 2, y + 2, w - 4, 27);
      ctx.fillStyle = 'rgba(255, 248, 235, 0.14)';
      ctx.fillRect(x + 3, y + 3, w - 6, 5);
      if (isMossy) {
        ctx.fillStyle = 'rgba(72, 118, 48, 0.55)';
        ctx.fillRect(x + 2, y + 24, w * 0.45, 5);
      }
      x += w;
    }
  }

  // Subtle moss growth in lower corners using green-tinted fbm patches
  for (let py = 180; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      // Corner proximity factor
      const leftCorner = 1.0 - px / 128;
      const rightCorner = (px - 128) / 128;
      const bottomFactor = (py - 180) / 76;
      const cornerStrength = Math.max(0, leftCorner, rightCorner) * bottomFactor;
      if (cornerStrength <= 0) continue;
      const n = fbm(px / 14, py / 14);
      if (n * cornerStrength > 0.28) {
        ctx.fillStyle = `rgba(52, 90, 38, ${Math.min(0.55, (n * cornerStrength - 0.28) * 2.2)})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 11. Weathered colonial corrugated-tin roofing
export function createCorrugatedTinTexture(baseHex, rustHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Corrugated ridge highlights and shadows
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(x, 0, 3, 256);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fillRect(x + 4, 0, 3, 256);
  }

  const r = seededRandom(baseHex.charCodeAt(1) * 19);
  ctx.fillStyle = rustHex;
  for (let i = 0; i < 115; i++) {
    ctx.globalAlpha = 0.07 + r() * 0.15;
    ctx.fillRect(r() * 256, r() * 256, 12 + r() * 28, 6 + r() * 26);
  }
  ctx.globalAlpha = 1.0;

  // fbm-based rust patches
  for (let py = 0; py < 256; py += 2) {
    for (let px = 0; px < 256; px += 2) {
      const n = fbm(px / 18, py / 18);
      if (n > 0.72) {
        ctx.fillStyle = 'rgba(140,70,30,0.35)';
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }

  // Rain-streak vertical lines in lighter grey
  for (let sx = 2; sx < 256; sx += 7 + Math.floor(hash2(sx, 1) * 11)) {
    const streakAlpha = 0.06 + hash2(sx * 0.3, 2) * 0.10;
    const streakWidth = 0.5 + hash2(sx, 3) * 1.0;
    const streakTop = hash2(sx * 0.7, 4) * 60;
    const streakLen = 80 + hash2(sx * 0.5, 5) * 140;
    ctx.strokeStyle = `rgba(200,210,215,${streakAlpha.toFixed(3)})`;
    ctx.lineWidth = streakWidth;
    ctx.beginPath();
    ctx.moveTo(sx, streakTop);
    ctx.lineTo(sx + (hash2(sx, 6) - 0.5) * 3, streakTop + streakLen);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 12. Whitewashed colonial lime-plaster wall
export function createPlasterWallTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ece6d8';
  ctx.fillRect(0, 0, 256, 256);

  const r = seededRandom(1854);
  for (let i = 0; i < 600; i++) {
    const v = 215 + Math.floor(r() * 35);
    ctx.fillStyle = `rgba(${v}, ${v - 5}, ${v - 14}, 0.22)`;
    ctx.fillRect(r() * 256, r() * 256, 6 + r() * 18, 4 + r() * 12);
  }
  ctx.fillStyle = 'rgba(80, 72, 58, 0.08)';
  for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 2);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 13. Traditional Tibetan Lungta prayer flag cloth
export function createPrayerFlagTexture(bgHex) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let i = 0; i < 128; i += 4) {
    ctx.fillRect(i, 0, 1, 128);
    ctx.fillRect(0, i, 128, 1);
  }
  ctx.strokeStyle = 'rgba(22, 18, 16, 0.48)';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(10, 10, 108, 108);

  ctx.fillStyle = 'rgba(22, 18, 16, 0.42)';
  ctx.beginPath();
  ctx.arc(64, 52, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 52, 9, 0, Math.PI * 2);
  ctx.fill();
  for (let y = 84; y <= 106; y += 7) ctx.fillRect(20, y, 88, 2.5);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 14. Heritage Happy Valley Tea Estate painted wooden signboard
export function createSignTexture(line1, line2) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b3a29';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#e8c782';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, 476, 124);
  ctx.fillStyle = '#f6f0e4';
  ctx.font = '600 35px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(line1, 256, 74);
  ctx.fillStyle = '#e8c782';
  ctx.font = '500 20px Inter, sans-serif';
  ctx.fillText(line2, 256, 116);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 15. Soft radial cloud / valley mist / chimney steam billboard texture
export function createSoftCloudTexture(innerAlpha = 0.44, midAlpha = 0.18) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  grad.addColorStop(0.0, `rgba(255, 250, 245, ${innerAlpha})`);
  grad.addColorStop(0.48, `rgba(246, 241, 238, ${midAlpha})`);
  grad.addColorStop(1.0, 'rgba(242, 238, 236, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 16. Painterly soil & mossy earth grain
export function createSoilGrainTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dedede';
  ctx.fillRect(0, 0, 256, 256);

  const r = seededRandom(909);
  for (let i = 0; i < 4800; i++) {
    const v = 185 + Math.floor(r() * 68);
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(r() * 256, r() * 256, 2 + r() * 2.5, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(46, 46);
  return tex;
}
