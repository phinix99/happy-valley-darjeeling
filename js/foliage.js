import * as THREE from 'three';
import {
  rand, getPathX, getStreamX, getTerrainHeight, mergeGeometries,
  SHED_POS, FACTORY_POS, SHADE_TREES
} from './geo.js';
import { createTeaLeafSprigTexture } from './textures.js';
import { enhanceFoliageMaterial } from './world.js';

// Simple seeded value-noise helper (0..1 output)
function vnoise(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.3) * 43758.5453;
  return n - Math.floor(n);
}

// =========================================================================
// 1. BOTANICAL GEOMETRY BUILDERS ("Two Leaves & a Bud" + Painterly Bushes)
// =========================================================================

// Sculpted Camellia sinensis flush shoot: curved stem + upright bud + 2 cupped leaves
export function createDetailedShootGeo() {
  const parts = [];

  // Gently arched tender green petiole stem — control points slightly randomised per call
  const rX1 = (Math.random() - 0.5) * 0.024, rZ1 = (Math.random() - 0.5) * 0.024;
  const rX2 = (Math.random() - 0.5) * 0.024, rZ2 = (Math.random() - 0.5) * 0.024;
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.008 + rX1, 0.08, 0.004 + rZ1),
    new THREE.Vector3(0.002 + rX2, 0.165, 0 + rZ2)
  ]);
  parts.push(new THREE.TubeGeometry(stemCurve, 5, 0.009, 5, false));

  // Velvety upright central silver-tip bud ("Ek Kali")
  const bud = new THREE.ConeGeometry(0.021, 0.138, 7);
  bud.scale(0.82, 1.0, 0.72);
  bud.translate(0.002, 0.22, 0);
  parts.push(bud);

  // Two arched, tapered, slightly cupped tender leaves ("Do Patti")
  // Vary aperture angle ±8° and leaf length ±15% per call
  const apertureVariation = (Math.random() - 0.5) * (8 * Math.PI / 180) * 2; // ±8° in total range
  const lengthScale = 1.0 + (Math.random() - 0.5) * 0.30; // ±15%
  for (const side of [-1, 1]) {
    const leaf = new THREE.SphereGeometry(0.074, 7, 5);
    const lp = leaf.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const lx = lp.getX(i), ly = lp.getY(i), lz = lp.getZ(i);
      const tipTaper = 1.0 - Math.max(0, (lx * side) / 0.074) * 0.56;
      lp.setXYZ(i, lx * 1.48 * lengthScale, ly * 0.16 + Math.abs(lz) * 0.28, lz * 0.54 * tipTaper);
    }
    leaf.rotateZ(side * (0.48 + side * apertureVariation));
    leaf.rotateY(side * 0.22);
    leaf.translate(side * 0.072 * lengthScale, 0.145 + (side > 0 ? 0.015 : 0), side * 0.008);
    leaf.computeVertexNormals();
    parts.push(leaf);
  }

  const merged = mergeGeometries(parts);
  merged.scale(1.62, 1.62, 1.62);
  merged.computeVertexNormals();
  return merged;
}

// Sculpted flat-topped plucking-table tea bush core with baked vertical AO
function createWoodyBushCoreGeo() {
  const geo = new THREE.IcosahedronGeometry(0.66, 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * 1.18;
    let y = pos.getY(i);
    let z = pos.getZ(i) * 1.14;

    if (y > 0.16) y = 0.16 + (y - 0.16) * 0.36;
    y = (y + 0.66) * 0.78;

    const bump = 0.07 * Math.sin(x * 8.0 + z * 5.0) + 0.05 * Math.cos(y * 10.0 - x * 6.0);
    pos.setXYZ(i, x + bump, Math.max(0, y + bump * 0.4), z + bump * 0.8);

    const ao = THREE.MathUtils.clamp(0.36 + (y / 0.86) * 0.74, 0.32, 1.1);
    cols[i * 3]     = ao * 0.88;
    cols[i * 3 + 1] = ao * 1.02;
    cols[i * 3 + 2] = ao * 0.84;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

// Crossed 3-plane painterly sprig fan with soft upward-biased Ghibli foliage normals
function createSprigFanGeo() {
  const p1 = new THREE.PlaneGeometry(0.55, 0.49);
  p1.translate(0, 0.22, 0);
  const planes = [p1, p1.clone().rotateY(Math.PI / 3), p1.clone().rotateY(-Math.PI / 3)];

  const pos = new Float32Array(planes.length * 18);
  const norm = new Float32Array(planes.length * 18);
  const uv = new Float32Array(planes.length * 12);
  let pi = 0, ui = 0;

  for (const pl of planes) {
    const ni = pl.toNonIndexed();
    pos.set(ni.attributes.position.array, pi);
    for (let k = 0; k < ni.attributes.normal.count; k++) {
      norm[pi + k * 3]     = ni.attributes.normal.getX(k) * 0.3;
      norm[pi + k * 3 + 1] = 0.92;
      norm[pi + k * 3 + 2] = ni.attributes.normal.getZ(k) * 0.3;
    }
    uv.set(ni.attributes.uv.array, ui);
    pi += ni.attributes.position.array.length;
    ui += ni.attributes.uv.array.length;
    pl.dispose();
    ni.dispose();
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// =========================================================================
// 2. POPULATE HAPPY VALLEY TEA TERRACES, SHOOTS & MORNING DEW MOTES
// =========================================================================
export function populateEstateFoliage(scene, sharedUniforms) {
  const bushes = [];
  const dummy = new THREE.Object3D();

  for (let z = -54; z <= 34; z += 1.66) {
    // Periodic narrow contour walking aisles between terraced bands
    const isTerraceLane = Math.abs(((z + 60) % 8.3) - 4.15) < 0.72;
    if (isTerraceLane && z > -36 && z < 24) continue;

    for (let x = -52; x <= 52; x += 1.58) {
      const jx = x + (rand() - 0.5) * 0.52;
      const jz = z + (rand() - 0.5) * 0.44;

      if (Math.abs(jx - getPathX(jz)) < 1.55) continue;
      if (Math.abs(jx - getStreamX(jz)) < 3.45) continue;
      if (Math.hypot(jx - SHED_POS.x, jz - SHED_POS.z) < 6.0) continue;
      if (Math.hypot(jx - FACTORY_POS.x, jz - FACTORY_POS.z) < 14.5) continue;
      if (SHADE_TREES.some((t) => Math.hypot(jx - t.x, jz - t.z) < 1.75)) continue;

      bushes.push({
        x: jx,
        y: getTerrainHeight(jx, jz),
        z: jz,
        sx: 0.88 + rand() * 0.34,
        sy: 0.86 + rand() * 0.26,
        sz: 0.88 + rand() * 0.34,
        rot: rand() * Math.PI * 2,
        // Natural variation additions
        uniformScale: 0.78 + Math.random() * 0.44,
        rotY: Math.random() * Math.PI * 2,
        tiltX: (Math.random() - 0.5) * 0.16,
        tiltZ: (Math.random() - 0.5) * 0.16,
        // HSL lightness variation for color tinting (base green, slight l shift)
        lVariation: (Math.random() - 0.5) * 0.08
      });
    }
  }

  // Layer 1: Dense sculpted Camellia bush cores
  const coreMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84 });
  enhanceFoliageMaterial(coreMat, sharedUniforms, 'bush-core', 0.028, 0.36, true);

  const coreMesh = new THREE.InstancedMesh(createWoodyBushCoreGeo(), coreMat, bushes.length);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;

  // HSL range: 0x2d6b2f ≈ h~0.339, s~0.41, l~0.30  →  0x4a9e38 ≈ h~0.306, s~0.47, l~0.42
  // We'll interpolate h between 0.306–0.339, s ~0.42–0.48, and vary l per bush ±0.04
  const cA = new THREE.Color(0x1b5224);
  const cB = new THREE.Color(0x2d7630);
  const cC = new THREE.Color(0x4b8f34);
  const tc = new THREE.Color();

  bushes.forEach((b, i) => {
    const us = b.uniformScale;
    dummy.position.set(b.x, b.y - 0.14, b.z);
    dummy.rotation.set(b.tiltX, b.rotY, b.tiltZ);
    dummy.scale.set(b.sx * us, b.sy * us, b.sz * us);
    dummy.updateMatrix();
    coreMesh.setMatrixAt(i, dummy.matrix);

    // Base color blend then apply HSL lightness variation per bush
    tc.copy(cA).lerp(cB, rand()).lerp(cC, Math.max(0, rand() - 0.6));
    const hsl = { h: 0, s: 0, l: 0 };
    tc.getHSL(hsl);
    tc.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + b.lVariation, 0.14, 0.72));
    coreMesh.setColorAt(i, tc);
  });
  coreMesh.instanceMatrix.needsUpdate = true;
  coreMesh.instanceColor.needsUpdate = true;
  scene.add(coreMesh);

  // Layer 2: Painterly hand-illustrated leaf-sprig fans on playable terraces
  const nearBushes = bushes.filter((b) => Math.abs(b.x) < 34 && b.z > -32 && b.z < 24);
  const sprigMat = new THREE.MeshStandardMaterial({
    map: createTeaLeafSprigTexture(),
    alphaTest: 0.44,
    side: THREE.DoubleSide,
    roughness: 0.66
  });
  enhanceFoliageMaterial(sprigMat, sharedUniforms, 'sprig-fan', 0.062, 0.62, true);

  const sprigMesh = new THREE.InstancedMesh(createSprigFanGeo(), sprigMat, nearBushes.length * 3);
  sprigMesh.receiveShadow = true;

  const sA = new THREE.Color(0xd5f2bc);
  const sB = new THREE.Color(0xffffff);
  let si = 0;
  for (const b of nearBushes) {
    for (let k = 0; k < 3; k++) {
      const ang = rand() * Math.PI * 2;
      const r = rand() * 0.42 * b.sx;
      const sc = 0.85 + rand() * 0.45;
      dummy.position.set(b.x + Math.cos(ang) * r, b.y + b.sy * 0.56, b.z + Math.sin(ang) * r);
      dummy.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      sprigMesh.setMatrixAt(si, dummy.matrix);
      sprigMesh.setColorAt(si, tc.copy(sA).lerp(sB, rand()));
      si++;
    }
  }
  sprigMesh.instanceMatrix.needsUpdate = true;
  sprigMesh.instanceColor.needsUpdate = true;
  scene.add(sprigMesh);

  // Layer 3: Interactive Pluckable Shoots (Fine Flush, Dew-Kissed Silver Tip, Coarse Mature)
  const shootMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.36,
    metalness: 0.05,
    emissive: new THREE.Color(0x2a4510),
    emissiveIntensity: 0.28
  });
  enhanceFoliageMaterial(shootMat, sharedUniforms, 'pluck-shoot', 0.075, 0.74, true);

  const playable = bushes.filter((b) => Math.abs(b.x) < 28 && b.z > -26 && b.z < 18);
  const maxShoots = Math.min(600, playable.length);
  const shootMesh = new THREE.InstancedMesh(createDetailedShootGeo(), shootMat, maxShoots);
  shootMesh.frustumCulled = false;

  const shootData = [];
  const cFineA  = new THREE.Color(0xbef255);
  const cFineB  = new THREE.Color(0xdcf872);
  const cDew    = new THREE.Color(0xf8ff9a);
  const cCoarse = new THREE.Color(0x365c30);

  for (let i = 0; i < maxShoots; i++) {
    const b = playable[Math.floor((i / maxShoots) * playable.length)];
    const ang = rand() * Math.PI * 2;
    const rad = rand() * 0.35;
    const sx = b.x + Math.cos(ang) * rad;
    const sz = b.z + Math.sin(ang) * rad;
    const sy = b.y + b.sy * 0.78;

    const roll = rand();
    const type = roll < 0.11 ? 'dew' : (roll < 0.80 ? 'fine' : 'coarse');
    const rotY = rand() * Math.PI * 2;
    const sc = type === 'coarse' ? (1.14 + rand() * 0.22) : (0.98 + rand() * 0.28);

    dummy.position.set(sx, sy, sz);
    dummy.rotation.set((rand() - 0.5) * 0.2, rotY, (rand() - 0.5) * 0.2);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    shootMesh.setMatrixAt(i, dummy.matrix);

    const baseColor = type === 'dew'
      ? cDew.clone()
      : (type === 'fine' ? cFineA.clone().lerp(cFineB, rand()) : cCoarse.clone());
    shootMesh.setColorAt(i, baseColor);

    shootData.push({
      id: i,
      pos: new THREE.Vector3(sx, sy, sz),
      rotY,
      scale: sc,
      type,
      baseColor,
      plucked: false
    });
  }
  shootMesh.instanceMatrix.needsUpdate = true;
  shootMesh.instanceColor.needsUpdate = true;
  shootMesh.computeBoundingSphere();
  scene.add(shootMesh);

  // Layer 4: Sunlit Morning Dew / Pollen Motes drifting gently over the canopy
  const moteCount = 240;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const mx = (rand() - 0.5) * 64;
    const mz = (rand() - 0.5) * 56;
    motePos[i * 3]     = mx;
    motePos[i * 3 + 1] = getTerrainHeight(mx, mz) + 0.6 + rand() * 5.2;
    motePos[i * 3 + 2] = mz;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const dewMotes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({ color: 0xfff0c8, size: 0.08, transparent: true, opacity: 0.52, depthWrite: false })
  );
  scene.add(dewMotes);

  return { shootData, shootMesh, dewMotes };
}

// =========================================================================
// 3. ARTICULATED DARJEELING TEA PLUCKER (3RD PERSON & FELLOW COLLECTORS)
// =========================================================================
export function createArticulatedPlucker(sareeHex, shawlHex, bambooTex) {
  const root = new THREE.Group();

  // Vary saree color lightness ±0.06 while keeping hue/saturation
  const sareeBase = new THREE.Color(sareeHex);
  const sareeHSL = { h: 0, s: 0, l: 0 };
  sareeBase.getHSL(sareeHSL);
  sareeBase.setHSL(sareeHSL.h, sareeHSL.s, THREE.MathUtils.clamp(sareeHSL.l + (Math.random() - 0.5) * 0.12, 0.08, 0.92));

  const clothMat  = new THREE.MeshStandardMaterial({ color: sareeBase, roughness: 0.82 });
  const shawlMat  = new THREE.MeshStandardMaterial({ color: shawlHex, roughness: 0.85 });
  const skinMat   = new THREE.MeshStandardMaterial({ color: 0x85553b, roughness: 0.72 });
  const hairMat   = new THREE.MeshStandardMaterial({ color: 0x181414, roughness: 0.88 });
  const dokoMat   = new THREE.MeshStandardMaterial({ map: bambooTex, roughness: 0.85, side: THREE.DoubleSide });
  const strapMat  = new THREE.MeshStandardMaterial({ color: 0xd1b384, roughness: 0.92 });
  const woodMat   = new THREE.MeshStandardMaterial({ color: 0x6b4c2e, roughness: 0.9 });
  const bangleMat = new THREE.MeshStandardMaterial({ color: 0xe6be5c, roughness: 0.3, metalness: 0.82 });

  // Per-avatar limb proportion variation ±5%
  const legLenVar   = 1.0 + (Math.random() - 0.5) * 0.10;
  const armLenVar   = 1.0 + (Math.random() - 0.5) * 0.10;

  // Articulated hip-pivoting legs
  const legGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.72 * legLenVar, 7);
  legGeo.translate(0, -0.36 * legLenVar, 0);
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.11, 0.74, 0);
  leftLeg.add(new THREE.Mesh(legGeo, clothMat));
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.11, 0.74, 0);
  rightLeg.add(new THREE.Mesh(legGeo, clothMat));
  root.add(leftLeg, rightLeg);

  // Draped traditional gunyu / saree skirt with hem band
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 0.88, 12), clothMat);
  skirt.position.y = 0.56;
  skirt.castShadow = true;
  root.add(skirt);

  const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.345, 0.08, 12), shawlMat);
  hem.position.y = 0.16;
  root.add(hem);

  // Upper Torso Pivot (bends gracefully over waist-high tea rows)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.96;

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.50, 10), clothMat);
  chest.position.y = 0.25;
  chest.castShadow = true;
  torsoGroup.add(chest);

  const shawl = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.225, 0.32, 10), shawlMat);
  shawl.position.y = 0.34;
  torsoGroup.add(shawl);

  // Head + Headscarf + Hair Bun + Braided Namlo Forehead Strap
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.62;
  headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), skinMat));

  const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.136, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), shawlMat);
  scarf.position.set(0, 0.02, 0.01);
  headGroup.add(scarf);

  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), hairMat);
  bun.position.set(0, -0.02, 0.13);
  headGroup.add(bun);

  const namloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, -0.18, 0.26),
    new THREE.Vector3(-0.14,  0.02, -0.06),
    new THREE.Vector3( 0.00,  0.05, -0.145),
    new THREE.Vector3( 0.14,  0.02, -0.06),
    new THREE.Vector3( 0.18, -0.18, 0.26)
  ]);
  headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(namloCurve, 16, 0.022, 5, false), strapMat));
  torsoGroup.add(headGroup);

  // Articulated Left & Right Arms (Shoulder -> Forearm -> Wrist Bangle -> Hand)
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.22, 0.44, 0);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.28 * armLenVar, 7), shawlMat);
    upper.position.y = -0.14 * armLenVar;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.28 * armLenVar;

    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.26 * armLenVar, 7), skinMat);
    fore.position.y = -0.13 * armLenVar;
    elbow.add(fore);

    const bangle = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 10), bangleMat);
    bangle.rotation.x = Math.PI / 2;
    bangle.position.y = -0.22 * armLenVar;
    elbow.add(bangle);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 7), skinMat);
    hand.position.y = -0.27 * armLenVar;
    elbow.add(hand);

    shoulder.add(elbow);
    return { shoulder, elbow };
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  torsoGroup.add(leftArm.shoulder, rightArm.shoulder);

  // Woven Bamboo Doko Basket (spring-swaying pivot + rising fresh leaf mound!)
  const dokoPivot = new THREE.Group();
  dokoPivot.position.set(0, 0.34, 0.29);

  const dokoCone = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.11, 0.78, 12, 1, true), dokoMat);
  dokoCone.position.y = -0.14;
  dokoCone.rotation.x = 0.20;
  dokoCone.castShadow = true;
  dokoPivot.add(dokoCone);

  const dokoRim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 16), woodMat);
  dokoRim.rotation.x = Math.PI / 2 + 0.20;
  dokoRim.position.set(0, 0.24, 0.08);
  dokoPivot.add(dokoRim);

  // Rising mound of freshly plucked bright green shoots inside the basket
  const leafMound = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 9, 7),
    new THREE.MeshStandardMaterial({ color: 0x85cc43, roughness: 0.7 })
  );
  leafMound.scale.set(0.95, 0.45, 0.95);
  leafMound.position.set(0, -0.32, 0.03);
  leafMound.visible = false;
  dokoPivot.add(leafMound);

  torsoGroup.add(dokoPivot);
  root.add(torsoGroup);

  return { root, leftLeg, rightLeg, torsoGroup, headGroup, leftArm, rightArm, dokoPivot, leafMound };
}

// =========================================================================
// 4. ARTICULATED FIRST-PERSON PLUCKING HANDS (Attached to Camera)
// =========================================================================
export function createFirstPersonHands(camera) {
  const fpHands = new THREE.Group();
  const skin   = new THREE.MeshStandardMaterial({ color: 0x8a583d, roughness: 0.68 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0xc43741, roughness: 0.8 });
  const trim   = new THREE.MeshStandardMaterial({ color: 0xe8b954, roughness: 0.75 });
  const bangle = new THREE.MeshStandardMaterial({ color: 0xe6be5c, roughness: 0.3, metalness: 0.82 });

  const buildHand = (side) => {
    const g = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.28, 8), sleeve);
    fore.rotation.x = Math.PI / 2;
    fore.position.set(0, -0.02, 0.16);
    g.add(fore);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.035, 0.028, 8), trim);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.016, 0.045);
    g.add(cuff);

    const wrist = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0055, 6, 12), bangle);
    wrist.position.set(0, -0.01, 0.025);
    g.add(wrist);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.026, 0.082), skin);
    palm.position.set(0, 0, -0.03);
    g.add(palm);

    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const fg = new THREE.Group();
      fg.position.set((-0.024 + f * 0.016) * side, 0.002, -0.068);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.042, 4, 6), skin);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -0.025;
      fg.add(seg);
      g.add(fg);
      fingers.push(fg);
    }

    const thumb = new THREE.Group();
    thumb.position.set(-0.034 * side, -0.004, -0.032);
    const tSeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.034, 4, 6), skin);
    tSeg.rotation.z = side * 0.7;
    tSeg.rotation.x = Math.PI / 2;
    tSeg.position.set(-0.016 * side, 0, -0.02);
    thumb.add(tSeg);
    g.add(thumb);

    return { group: g, fingers };
  };

  const fpLeft = buildHand(-1);
  const fpRight = buildHand(1);
  fpLeft.group.position.set(-0.24, -0.26, -0.44);
  fpRight.group.position.set(0.24, -0.25, -0.44);
  fpHands.add(fpLeft.group, fpRight.group);

  // Up to 5 visibly held fresh tea shoots accumulating in the cupped left hand
  const heldShootMeshes = [];
  const miniGeo = createDetailedShootGeo();
  miniGeo.scale(0.32, 0.32, 0.32);
  const heldMat = new THREE.MeshStandardMaterial({ color: 0xcaf564, roughness: 0.4 });

  for (let i = 0; i < 5; i++) {
    const sm = new THREE.Mesh(miniGeo, heldMat);
    sm.position.set(-0.022 + i * 0.011, 0.025, -0.035 + (i % 2) * 0.015);
    sm.rotation.set(0.35, i * 0.7, (i - 2) * 0.22);
    sm.visible = false;
    fpLeft.group.add(sm);
    heldShootMeshes.push(sm);
  }

  camera.add(fpHands);
  return { fpHands, fpLeft, fpRight, heldShootMeshes };
}

// =========================================================================
// 5. FELLOW TEA COLLECTORS WORKING NEIGHBORING HAPPY VALLEY BLOCKS
// =========================================================================
export function spawnFellowCollectors(scene, bambooTex) {
  const workers = [];
  const placements = [
    { x: -13, z: -6,  saree: 0xd9483b, shawl: 0xf2c96b },
    { x:  14, z: -9,  saree: 0x2c7e8c, shawl: 0xf0d295 },
    { x: -20, z: -17, saree: 0xa63c76, shawl: 0xe8b574 },
    { x:  10, z: -21, saree: 0xd97d2b, shawl: 0x45805a },
    { x:  -5, z: -25, saree: 0x3f5e9e, shawl: 0xedd68c },
    { x:  22, z: -2,  saree: 0xb8374e, shawl: 0xd4a957 }
  ];

  for (const fc of placements) {
    const rig = createArticulatedPlucker(fc.saree, fc.shawl, bambooTex);
    rig.root.position.set(fc.x, getTerrainHeight(fc.x, fc.z), fc.z);
    rig.root.rotation.y = rand() * Math.PI * 2;
    rig.leafMound.visible = true;
    rig.leafMound.position.y = 0.08;

    // Per-worker natural variation
    const workerScale = 0.92 + Math.random() * 0.16;
    rig.root.scale.setScalar(workerScale);
    const speedMult = 0.65 + Math.random() * 0.70;   // 0.65–1.35
    const phaseOffset = Math.random() * Math.PI * 2;  // random idle bob phase

    scene.add(rig.root);
    workers.push({ rig, phase: rand() * 10, baseRot: rig.root.rotation.y, speedMult, phaseOffset });
  }
  return workers;
}