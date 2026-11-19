import * as THREE from 'three';

// =========================================================================
// 1. REAL GOOGLE MAPS DATA — HAPPY VALLEY TEA ESTATE, DARJEELING (EST. 1854)
//    27.0521° N, 88.2587° E · Altitude 2,100 m ASL
// =========================================================================
export const ORIGIN_LAT = 27.0521;
export const ORIGIN_LON = 88.2587;
export const ORIGIN_ELEV = 2100.0;
export const EARTH_R = 6371000.0;
export const COS_LAT = Math.cos(THREE.MathUtils.degToRad(ORIGIN_LAT));

// Real Himalayan summits visible across the Little Rangeet Gorge from Happy Valley
// Spherical-earth bearing (azimuth), distance (km), and refraction-adjusted elevation angle
export const HIMALAYAN_PEAKS = [
  { name: 'Jannu (Kumbhakarna)', lat: 27.6825, lon: 88.0375, elev: 7710, sharp: 1.58, width: 1.04, label: true },
  { name: 'Rathong',             lat: 27.5949, lon: 88.0890, elev: 6678, sharp: 1.36, width: 0.90, label: false },
  { name: 'Kabru South',         lat: 27.6080, lon: 88.1100, elev: 7318, sharp: 1.20, width: 1.15, label: false },
  { name: 'Kabru North',         lat: 27.6350, lon: 88.1180, elev: 7338, sharp: 1.28, width: 1.10, label: true },
  { name: 'Kanchenjunga West',   lat: 27.7050, lon: 88.1280, elev: 8505, sharp: 1.44, width: 1.24, label: false },
  { name: 'Kanchenjunga Main',   lat: 27.7025, lon: 88.1475, elev: 8586, sharp: 1.54, width: 1.40, label: true, primary: true },
  { name: 'Kanchenjunga South',  lat: 27.6917, lon: 88.1542, elev: 8476, sharp: 1.46, width: 1.16, label: false },
  { name: 'Talung',              lat: 27.6510, lon: 88.1980, elev: 7349, sharp: 1.40, width: 1.06, label: false },
  { name: 'Pandim',              lat: 27.5810, lon: 88.2190, elev: 6691, sharp: 1.64, width: 0.96, label: true },
  { name: 'Simvo',               lat: 27.6780, lon: 88.2450, elev: 6811, sharp: 1.48, width: 0.95, label: false },
  { name: 'Narsing',             lat: 27.5080, lon: 88.2830, elev: 5825, sharp: 1.32, width: 0.92, label: true },
  { name: 'Siniolchu',           lat: 27.7117, lon: 88.3183, elev: 6888, sharp: 1.88, width: 0.82, label: true }
].map((p) => {
  const dy = THREE.MathUtils.degToRad(p.lat - ORIGIN_LAT) * EARTH_R;           // North (+Y)
  const dx = THREE.MathUtils.degToRad(p.lon - ORIGIN_LON) * EARTH_R * COS_LAT; // East  (+X)
  const dist = Math.hypot(dx, dy);
  const azRad = Math.atan2(dx, dy); // 0 = True North (-Z), + = East (+X), - = West (-X)
  const azDeg = ((THREE.MathUtils.radToDeg(azRad) % 360) + 360) % 360;
  // Standard earth curvature drop adjusted by atmospheric refraction coefficient (k ≈ 0.13)
  const curvDrop = ((dist * dist) / (2 * EARTH_R)) * 0.87;
  const elRad = Math.atan2((p.elev - ORIGIN_ELEV) - curvDrop, dist);
  return { ...p, distKm: dist / 1000, azRad, azDeg, elRad };
});

// Deterministic PRNG seeded by Happy Valley's founding year
export function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
export const rand = seededRandom(1854);

// =========================================================================
// 2. HAPPY VALLEY LANDMARKS, PATHWAYS & JHORA STREAM CHANNEL
// =========================================================================
// Winding stone-stepped footpath curving down from T.P. Banerjee Rd toward Tukvar
export function getPathX(z) {
  return Math.sin(z * 0.068) * 7.2 + Math.cos(z * 0.032) * 2.2;
}

// Rocky Himalayan Jhora spring stream tumbling down the western hollow
export function getStreamX(z) {
  return -22.0 + Math.sin(z * 0.08 + 0.9) * 4.2;
}

export const SHED_POS = new THREE.Vector3(getPathX(19) + 4.8, 0, 19);
export const FACTORY_POS = new THREE.Vector3(24, 0, 44);

// Authentic Darjeeling estate shade trees (Albizia chinensis) & Dhupi cedar-pines
export const SHADE_TREES = [
  { x: -13, z: 7,   s: 1.15, type: 'albizia' },
  { x: 17,  z: 4,   s: 1.25, type: 'albizia' },
  { x: -7,  z: -14, s: 1.08, type: 'albizia' },
  { x: 15,  z: -22, s: 1.28, type: 'albizia' },
  { x: -16, z: -26, s: 1.15, type: 'albizia' },
  { x: 28,  z: -8,  s: 1.12, type: 'albizia' },
  { x: -30, z: 14,  s: 1.35, type: 'dhupi' },
  { x: -34, z: -4,  s: 1.42, type: 'dhupi' },
  { x: 34,  z: 18,  s: 1.38, type: 'dhupi' },
  { x: 8,   z: 32,  s: 1.45, type: 'dhupi' },
  { x: -14, z: 30,  s: 1.32, type: 'dhupi' },
  { x: 38,  z: 36,  s: 1.50, type: 'dhupi' }
];

// =========================================================================
// 3. HILLSIDE TOPOGRAPHY HEIGHT & ANALYTIC SURFACE NORMAL
// =========================================================================
export function getTerrainHeight(x, z) {
  // Primary north-facing slope descending steeply into the Little Rangeet Gorge (-Z)
  let slope = z * 0.245;
  if (z < -44) {
    slope -= Math.pow((-44 - z) * 0.165, 1.52);
  } else if (z > 34) {
    slope += Math.pow((z - 34) * 0.12, 1.28);
  }

  // Multi-octave organic Himalayan ridge undulations
  const hills =
    Math.sin(x * 0.038 + z * 0.022) * 2.9 +
    Math.cos(x * 0.072 - z * 0.051) * 1.1 +
    Math.sin(x * 0.017) * Math.cos(z * 0.020) * 4.2;

  let h = slope + hills;

  // Contour terrace banding across the playable tea garden blocks
  if (z > -44 && z < 34) {
    h += Math.sin(h * 1.95) * 0.16;
  }

  // Carve the mossy rocky Jhora mountain stream channel on the western slope
  const sDist = Math.abs(x - getStreamX(z));
  if (sDist < 4.5 && z > -46 && z < 36) {
    const carve = Math.pow(1 - sDist / 4.5, 2) * 1.55;
    h -= carve;
  }

  // Level terrace pad for the Tola Ghar Weighing Shed
  const dShed = Math.hypot(x - SHED_POS.x, z - SHED_POS.z);
  if (dShed < 8.5) {
    const target = SHED_POS.z * 0.245 + 2.4;
    h = THREE.MathUtils.lerp(h, target, Math.pow(1 - dShed / 8.5, 2) * 0.88);
  }

  // Level ridge plateau for the 1854 Happy Valley Tea Factory
  const dFac = Math.hypot(x - FACTORY_POS.x, z - FACTORY_POS.z);
  if (dFac < 18.0) {
    const target = FACTORY_POS.z * 0.245 + 5.2;
    h = THREE.MathUtils.lerp(h, target, Math.pow(1 - dFac / 18.0, 2) * 0.9);
  }

  return h;
}

export function getTerrainNormal(x, z, out = new THREE.Vector3()) {
  const eps = 0.22;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return out.set(hL - hR, 2 * eps, hD - hU).normalize();
}

// Initialize exact Y elevations for key estate landmarks
SHED_POS.y = getTerrainHeight(SHED_POS.x, SHED_POS.z);
FACTORY_POS.y = getTerrainHeight(FACTORY_POS.x, FACTORY_POS.z);

// Convert world (x, y, z) to simulated live GPS coordinates & altitude
export function worldToGPS(x, y, z) {
  const lat = ORIGIN_LAT + (-z / EARTH_R) * (180 / Math.PI);
  const lon = ORIGIN_LON + (x / (EARTH_R * COS_LAT)) * (180 / Math.PI);
  const elev = Math.round(ORIGIN_ELEV + y);
  return {
    lat,
    lon,
    elev,
    formatted: `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E · ${elev.toLocaleString()} m`
  };
}

// Dynamic estate sub-block naming as the player traverses Happy Valley
export function getEstateBlockName(x, z) {
  if (Math.hypot(x - SHED_POS.x, z - SHED_POS.z) < 9.5) return 'Happy Valley · Tola Weighing Terrace';
  if (Math.abs(x - getStreamX(z)) < 7.0) return 'Happy Valley · Jhora Spring Hollow';
  if (z < -16) return 'Happy Valley · Rangeet Valley Overlook';
  if (z > 22) return 'Happy Valley · 1854 Factory Upper Ridge';
  if (x > 14) return 'Happy Valley · Singamari East Spur';
  return 'Happy Valley · North Heritage Block';
}

// Lightweight geometry merger (no external addon dependencies)
export function mergeGeometries(geoms) {
  let totalVerts = 0;
  const list = geoms.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g.clone();
    if (!ni.attributes.normal) ni.computeVertexNormals();
    totalVerts += ni.attributes.position.count;
    return ni;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of list) {
    positions.set(g.attributes.position.array, offset);
    normals.set(g.attributes.normal.array, offset);
    offset += g.attributes.position.array.length;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}