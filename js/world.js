import * as THREE from 'three';
import {
  HIMALAYAN_PEAKS, rand, getPathX, getStreamX,
  SHED_POS, FACTORY_POS, SHADE_TREES, getTerrainHeight
} from './geo.js';
import {
  createBambooWeaveTexture, createStoneWallTexture, createCorrugatedTinTexture,
  createPlasterWallTexture, createPrayerFlagTexture, createSignTexture,
  createSoftCloudTexture, createSoilGrainTexture, createBarkTexture,
  createAlbiziaCanopyTexture, createDhupiBranchTexture, createFernAndFlowerTexture
} from './textures.js';

// =========================================================================
// 1. SHARED FOLIAGE SHADER INJECTION
//    (3D Wind Sway + Backlit Subsurface Scattering + GPU Bush Recoil Physics)
// =========================================================================
export function enhanceFoliageMaterial(
  material,
  sharedUniforms,
  cacheKey,
  windAmp = 0.045,
  sssStrength = 0.44,
  playerRecoil = true
) {
  material.customProgramCacheKey = () => `darjeeling-foliage-${cacheKey}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uSunDir = sharedUniforms.uSunDir;
    shader.uniforms.uSunColor = sharedUniforms.uSunColor;
    shader.uniforms.uPlayerPos = sharedUniforms.uPlayerPos;
    shader.uniforms.uPluckPulse = sharedUniforms.uPluckPulse;
    shader.uniforms.uWindVec = sharedUniforms.uWindVec;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform vec4 uPluckPulse;
        uniform vec2 uWindVec;
        varying vec3 vFoliageWorldPos;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wBase = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 wBase = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
        #endif
        float hWeight = clamp(transformed.y, 0.0, 1.5);
        float gust = sin(uTime * 1.55 + wBase.x * 0.22 + wBase.z * 0.18)
                   + 0.45 * cos(uTime * 2.65 + wBase.x * 0.48 - wBase.z * 0.31);
        transformed.x += gust * ${windAmp.toFixed(4)} * uWindVec.x * hWeight;
        transformed.z += gust * ${windAmp.toFixed(4)} * uWindVec.y * hWeight;

        ${playerRecoil ? `
        vec2 toBush = wBase.xz - uPlayerPos.xz;
        float pDist = length(toBush);
        if (pDist < 1.38 && pDist > 0.01) {
          float push = smoothstep(1.38, 0.18, pDist) * 0.34 * hWeight;
          vec2 pushDir = toBush / pDist;
          transformed.x += pushDir.x * push;
          transformed.z += pushDir.y * push;
          transformed.y -= push * 0.20;
        }
        float pluckDist = length(wBase - uPluckPulse.xyz);
        if (pluckDist < 1.5 && uPluckPulse.w > 0.001) {
          float spring = sin(uTime * 28.0) * uPluckPulse.w * smoothstep(1.5, 0.0, pluckDist);
          transformed.y += spring * 0.12 * hWeight;
          transformed.x += spring * 0.07 * hWeight;
        }
        ` : ''}
      `)
      .replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 fwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fwp = instanceMatrix * fwp;
        #endif
        fwp = modelMatrix * fwp;
        vFoliageWorldPos = fwp.xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vFoliageWorldPos;
      `)
      .replace('#include <opaque_fragment>', `
        vec3 vDir = normalize(cameraPosition - vFoliageWorldPos);
        float backLight = pow(clamp(dot(vDir, -normalize(uSunDir)), 0.0, 1.0), 2.8);
        float rimLift = pow(clamp(dot(vDir, normalize(uSunDir)) * -0.5 + 0.5, 0.0, 1.0), 2.0);
        vec3 sssTint = vec3(0.72, 0.96, 0.26) * uSunColor;
        outgoingLight += sssTint * (backLight * ${sssStrength.toFixed(3)} + rimLift * ${(sssStrength * 0.22).toFixed(3)}) * diffuseColor.rgb;
        #include <opaque_fragment>
      `);
  };
}

// Helper: crossed leafy card geometry for roadside ferns & wildflowers
function createCrossedPlantGeo(w = 0.65, h = 0.62) {
  const p1 = new THREE.PlaneGeometry(w, h);
  p1.translate(0, h * 0.46, 0);
  const p2 = p1.clone().rotateY(Math.PI * 0.5);
  const planes = [p1, p2];
  const pos = new Float32Array(planes.length * 18);
  const norm = new Float32Array(planes.length * 18);
  const uv = new Float32Array(planes.length * 12);
  let pi = 0, ui = 0;
  for (const pl of planes) {
    const ni = pl.toNonIndexed();
    pos.set(ni.attributes.position.array, pi);
    for (let k = 0; k < ni.attributes.normal.count; k++) {
      norm[pi + k * 3] = 0;
      norm[pi + k * 3 + 1] = 1;
      norm[pi + k * 3 + 2] = 0;
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
// 2. COMPLETE DARJEELING HAPPY VALLEY WORLD BUILDER
// =========================================================================
export function buildWorld(scene, sharedUniforms, mountainUniforms) {
  const stoneWallTex = createStoneWallTexture();
  const bambooTex    = createBambooWeaveTexture();
  const plasterTex   = createPlasterWallTexture();
  const barkTex      = createBarkTexture();
  const albiziaTex   = createAlbiziaCanopyTexture();
  const dhupiTex     = createDhupiBranchTexture();
  const fernTex      = createFernAndFlowerTexture();
  const mistTex      = createSoftCloudTexture(0.42, 0.17);
  const steamTex     = createSoftCloudTexture(0.44, 0.16);

  const peakWorldPositions = [];
  const spindriftPlumes = [];
  const sunbeamMeshes = [];
  const factorySteamPuffs = [];
  const ropewayCars = [];
  const verletRopes = [];
  const mistCards = [];
  const scalePendulum = { group: null, angleX: 0, angleZ: 0, velX: 0, velZ: 0, dipY: 0, dipVel: 0 };

  // -----------------------------------------------------------------------
  // A. SWEEPING, PHOTOREAL-PAINTERLY KANCHENJUNGA MASSIF ("SLEEPING BUDDHA")
  //    + SEAMLESS 360° HIMALAYAN FOOTHILL RINGS (ZERO VERTICAL CLIFF CUTS!)
  // -----------------------------------------------------------------------
  {
    const R_ARC = 2520;
    const MIN_AZ = THREE.MathUtils.degToRad(-54);
    const MAX_AZ = THREE.MathUtils.degToRad(40);
    const SEG_U = 320;
    const SEG_V = 72;
    const VERT_SCALE = 2.15;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array((SEG_U + 1) * (SEG_V + 1) * 3);
    const indices = [];

    // Smooth ridged multifractal FBM for authentic Himalayan glacier cirques & arêtes
    const ridgedFBM = (a, b) => {
      let sum = 0, amp = 0.52, freq = 1.0;
      for (let o = 0; o < 4; o++) {
        const n = 1.0 - Math.abs(Math.sin(a * freq + Math.cos(b * freq * 0.85) * 1.4) * Math.cos(b * freq - Math.sin(a * freq * 0.7)));
        sum += n * n * amp;
        freq *= 2.12;
        amp *= 0.48;
      }
      return sum;
    };

    let ptr = 0;
    for (let iv = 0; iv <= SEG_V; iv++) {
      const v = iv / SEG_V;
      const radialOff = (v - 0.52) * 860;
      // Smooth envelope at front/back valley edges
      const vEnv = Math.sin(v * Math.PI);

      for (let iu = 0; iu <= SEG_U; iu++) {
        const u = iu / SEG_U;
        const az = THREE.MathUtils.lerp(MIN_AZ, MAX_AZ, u);
        // Smooth horizontal edge taper so outer mountain shoulders never cut off abruptly
        const uEdge = THREE.MathUtils.smoothstep(u, 0.0, 0.14) * THREE.MathUtils.smoothstep(1.0, 0.86, u);

        // Broad interconnected Himalayan wall base ("Sleeping Buddha" continuous massif)
        const wallProfile = Math.exp(-Math.pow((az + 0.11) / 0.46, 2)) * 315;
        let crestH = -135 + wallProfile * Math.pow(vEnv, 0.62);

        for (const pk of HIMALAYAN_PEAKS) {
          // Realistic broad 30°-38° alpine mountain slopes (NOT thin spiky crown teeth!)
          const azSpan = 0.145 * pk.width;
          const radSpan = 0.46;
          const dAz = (az - pk.azRad) / azSpan;
          const dRad = (v - 0.50) / radSpan;
          // Faceted diamond-pyramid distance (creates realistic crisp Himalayan arête ridges)
          const dFacet = Math.hypot(dAz, dRad * 1.1) * 0.72 + (Math.abs(dAz) + Math.abs(dRad)) * 0.22;
          const targetH = Math.tan(pk.elRad) * R_ARC * VERT_SCALE;

          const broadSlope = Math.max(0, 1.0 - dFacet);
          const peakH = Math.pow(broadSlope, 1.25) * (targetH + 145);
          // Broad glacial apron buttressing each major peak
          const apron = Math.exp(-(dAz * dAz * 0.65 + dRad * dRad * 1.35)) * (targetH * 0.84 + 90);
          crestH = Math.max(crestH, -135 + Math.max(peakH, apron));
        }

        // Carve realistic glacial ribs, couloirs, and hanging valleys
        const rf = ridgedFBM(az * 13.5, v * 5.8);
        const elevMask = THREE.MathUtils.clamp((crestH + 110) / 420, 0, 1);
        let y = crestH + (rf - 0.46) * 118 * elevMask;
        y = THREE.MathUtils.lerp(-165, y, uEdge * Math.pow(vEnv, 0.45));

        const r = R_ARC + radialOff;
        positions[ptr++] = Math.sin(az) * r;
        positions[ptr++] = y;
        positions[ptr++] = -Math.cos(az) * r;
      }
    }

    for (let iv = 0; iv < SEG_V; iv++) {
      for (let iu = 0; iu < SEG_U; iu++) {
        const a = iv * (SEG_U + 1) + iu;
        const b = a + 1;
        const c = a + (SEG_U + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    scene.add(new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: mountainUniforms,
      fog: false,
      vertexShader: `
        varying vec3 vW;
        varying vec3 vN;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uAlpenglow;
        uniform vec3 uShadowColor;
        uniform vec3 uFogColor;
        varying vec3 vW;
        varying vec3 vN;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec3 n = normalize(vN);
          vec3 sun = normalize(uSunDir);

          // High-resolution alpine granite striations, ice flutes & snow cornices
          vec2 sp = vW.xz * 0.0065 + vec2(vW.y * 0.009);
          float strata = vn(sp * 3.8) * 0.55 + vn(sp * 10.5) * 0.30 + vn(sp * 24.0) * 0.15;
          float couloir = vn(vec2(vW.x * 0.015, vW.y * 0.0038));

          vec3 dN = normalize(n + vec3((strata - 0.5) * 0.28, 0.0, (couloir - 0.5) * 0.28));
          float ndl = max(dot(dN, sun), 0.0);
          float slope = clamp(dN.y, 0.0, 1.0);

          // Authentic snowline with exposed sheer Himalayan dark granite faces & glacial ice
          float snowLine = smoothstep(95.0, 235.0, vW.y + slope * 145.0 + (couloir - 0.5) * 70.0);
          float cliffRock = smoothstep(0.72, 0.38, slope) * smoothstep(0.32, 0.70, strata);

          vec3 granite = mix(vec3(0.15, 0.18, 0.25), vec3(0.27, 0.30, 0.38), strata);
          vec3 glacierIce = vec3(0.62, 0.80, 0.96);
          vec3 pureSnow = vec3(0.98, 0.98, 1.0);
          vec3 snowMix = mix(glacierIce, pureSnow, smoothstep(0.24, 0.72, slope + strata * 0.25));
          vec3 albedo = mix(granite, snowMix, clamp(snowLine - cliffRock * 0.48, 0.0, 1.0));

          // Luminous pink-gold Kanchenjunga alpenglow contrasting cool cobalt glacier shadows
          float summitH = smoothstep(200.0, 440.0, vW.y);
          vec3 sunLit = mix(uSunColor * 1.30, uAlpenglow * 1.48, summitH * (1.0 - clamp(sun.y * 2.1, 0.0, 1.0)));
          vec3 ambShadow = mix(uShadowColor * 0.82, uShadowColor * 1.18, snowLine);
          vec3 lit = albedo * mix(ambShadow, sunLit, smoothstep(0.02, 0.56, ndl));

          // Sun-catching summit ridge rim brilliance
          float rim = pow(1.0 - max(dot(dN, normalize(cameraPosition - vW)), 0.0), 3.0);
          lit += uSunColor * rim * 0.18 * snowLine;

          // Seamless aerial dissolution into misty Rangeet valley floor
          float valleyMist = smoothstep(-60.0, 165.0, vW.y);
          gl_FragColor = vec4(mix(uFogColor, lit, clamp(valleyMist * 0.82 + 0.03, 0.0, 1.0)), 1.0);
        }
      `
    })));

    // Summit Spindrift Snow Plumes & Cartographic Peak Callout Anchors
    const plumeMat = new THREE.MeshBasicMaterial({
      map: createSoftCloudTexture(0.46, 0.18),
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.56,
      side: THREE.DoubleSide
    });

    const peakContainer = document.getElementById('peak-labels');
    for (const pk of HIMALAYAN_PEAKS) {
      const y = Math.tan(pk.elRad) * R_ARC * VERT_SCALE + 6;
      const pos = new THREE.Vector3(Math.sin(pk.azRad) * R_ARC, y, -Math.cos(pk.azRad) * R_ARC);

      if (pk.label && peakContainer) {
        const el = document.createElement('div');
        el.className = 'peak-tag';
        el.innerHTML = `
          <span class="peak-name">${pk.name}</span>
          <span class="peak-meta">${pk.elev.toLocaleString()} m · ${pk.distKm.toFixed(0)} km</span>
          <div class="peak-stem"></div>
        `;
        peakContainer.appendChild(el);
        peakWorldPositions.push({ pos, el });
      }

      if (pk.elev >= 7700) {
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(340, 62), plumeMat);
        pm.position.set(pos.x + 115, pos.y - 6, pos.z + 25);
        pm.userData = { baseX: pm.position.x, phase: rand() * Math.PI * 2 };
        scene.add(pm);
        spindriftPlumes.push(pm);
      }
    }

    // SEAMLESS 360° ENCIRCLING HIMALAYAN FOOTHILL RINGS (Zero vertical cardboard edges!)
    const addContinuous360Ring = (radius, depth, baseH, amp, colHex, haze, northGorgeDepth) => {
      const segU = 180, segV = 14;
      const g = new THREE.BufferGeometry();
      const posArr = new Float32Array((segU + 1) * (segV + 1) * 3);
      const idx = [];
      let p = 0;

      for (let iv = 0; iv <= segV; iv++) {
        const v = iv / segV;
        const env = Math.sin(v * Math.PI);
        const r = radius + (v - 0.5) * depth;

        for (let iu = 0; iu <= segU; iu++) {
          const az = (iu / segU) * Math.PI * 2; // Continuous 0 -> 2π loop!
          // Integer harmonics guarantee 100% seamless loop with zero cliff seam
          const ridge =
            (Math.sin(az * 3.0 + radius * 0.01) * 0.5 + 0.5) * amp * 0.55 +
            (Math.cos(az * 7.0 - 0.8) * 0.5 + 0.5) * amp * 0.32 +
            (Math.sin(az * 13.0 + 1.5) * 0.5 + 0.5) * amp * 0.16 +
            (Math.cos(az * 23.0) * 0.5 + 0.5) * amp * 0.08;

          // Carve the natural Little Rangeet Gorge valley opening toward NNW (-10°)
          // so Kanchenjunga rises unobstructed and majestic between framing ridges!
          const dNorth = Math.atan2(Math.sin(az + 0.15), Math.cos(az + 0.15));
          const gorgeDip = Math.exp(-Math.pow(dNorth / 0.58, 2)) * northGorgeDepth;

          const y = baseH + (ridge - gorgeDip) * Math.pow(env, 0.72) - (1.0 - env) * 160;
          posArr[p++] = Math.sin(az) * r;
          posArr[p++] = y;
          posArr[p++] = -Math.cos(az) * r;
        }
      }

      for (let iv = 0; iv < segV; iv++) {
        for (let iu = 0; iu < segU; iu++) {
          const a = iv * (segU + 1) + iu, b = a + 1, c = a + (segU + 1), d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }

      g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();

      scene.add(new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(colHex) },
          uFogColor: mountainUniforms.uFogColor,
          uSunDir: sharedUniforms.uSunDir,
          uSunCol: mountainUniforms.uSunColor,
          uHaze: { value: haze }
        },
        fog: false,
        vertexShader: `
          varying vec3 vN; varying vec3 vW;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor; uniform vec3 uFogColor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uHaze;
          varying vec3 vN; varying vec3 vW;
          void main() {
            float ndl = max(dot(normalize(vN), normalize(uSunDir)), 0.0);
            vec3 lit = uColor * (0.55 + ndl * 0.65 * uSunCol);
            float mistFloor = smoothstep(-135.0, 35.0, vW.y);
            gl_FragColor = vec4(mix(uFogColor, lit, (1.0 - uHaze) * (0.25 + 0.75 * mistFloor)), 1.0);
          }
        `
      })));
    };

    // 3 Nested 360° Himalayan Ranges framing the Rangeet Gorge naturally
    addContinuous360Ring(420,  260, -38, 128, 0x264d33, 0.24, 118); // Near Tukvar, Singamari & Darjeeling hills
    addContinuous360Ring(880,  340, -34, 162, 0x264c4a, 0.48, 105); // Mid-distance Sikkim emerald ridges
    addContinuous360Ring(1480, 420, -28, 195, 0x334e66, 0.68,  95); // Far blue-violet Himalayan foothills

    // Seamless Valley Cloud-Sea Floor (eliminates any flat orange sky gap under the Ropeway!)
    const valleySea = new THREE.Mesh(
      new THREE.CircleGeometry(2800, 48),
      new THREE.ShaderMaterial({
        uniforms: { uFogColor: mountainUniforms.uFogColor },
        fog: false,
        vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uFogColor; void main() { gl_FragColor = vec4(uFogColor, 1.0); }`
      })
    );
    valleySea.rotation.x = -Math.PI / 2;
    valleySea.position.y = -112;
    scene.add(valleySea);

    // Shimmering Little Rangeet River meandering down the deep northern gorge
    const riverGeo = new THREE.PlaneGeometry(580, 36, 36, 4);
    riverGeo.rotateX(-Math.PI / 2);
    const rp = riverGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setZ(i, rp.getZ(i) + Math.sin(rp.getX(i) * 0.015) * 44);
    const river = new THREE.Mesh(
      riverGeo,
      new THREE.MeshStandardMaterial({ color: 0x5d8aa8, roughness: 0.14, metalness: 0.64 })
    );
    river.position.set(-20, -96, -242);
    scene.add(river);
  }

  // -----------------------------------------------------------------------
  // B. HAPPY VALLEY TERRAIN, JHORA STREAM, FOOTBRIDGE, FERNS & RAILINGS
  // -----------------------------------------------------------------------
  {
    const geo = new THREE.PlaneGeometry(260, 260, 195, 195);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);

    const cGrass = new THREE.Color(0x284b22);
    const cMoss  = new THREE.Color(0x3c612b);
    const cPath  = new THREE.Color(0x7c5f46);
    const cRock  = new THREE.Color(0x4b514c);
    const tmp    = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);

      const n = 0.5 + 0.5 * Math.sin(x * 0.34) * Math.cos(z * 0.34);
      tmp.copy(cGrass).lerp(cMoss, n * 0.72);

      const pd = Math.abs(x - getPathX(z));
      const sd = Math.abs(x - getStreamX(z));
      const shd = Math.hypot(x - SHED_POS.x, z - SHED_POS.z);
      const fd = Math.hypot(x - FACTORY_POS.x, z - FACTORY_POS.z);

      if (pd < 1.85 && z > -42 && z < 46) tmp.lerp(cPath, (1 - THREE.MathUtils.smoothstep(pd, 0.55, 1.85)) * 0.92);
      if (sd < 3.4 && z > -46 && z < 36)  tmp.lerp(cRock, (1 - THREE.MathUtils.smoothstep(sd, 0.9, 3.4)) * 0.88);
      if (shd < 6.2) tmp.lerp(cPath, (1 - THREE.MathUtils.smoothstep(shd, 2.2, 6.2)) * 0.85);
      if (fd < 15.0) tmp.lerp(cRock, (1 - THREE.MathUtils.smoothstep(fd, 6.0, 15.0)) * 0.72);

      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();

    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, map: createSoilGrainTexture(), roughness: 0.93 })
    );
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Animated rushing Jhora mountain spring stream
    const sVerts = [], sUvs = [], sIdx = [];
    let row = 0;
    for (let z = 34; z >= -44; z -= 1.2) {
      const sx = getStreamX(z), sy = getTerrainHeight(sx, z) + 0.16;
      sVerts.push(sx - 1.15, sy, z, sx + 1.15, sy, z);
      sUvs.push(0, row * 0.3, 1, row * 0.3);
      if (row > 0) { const a = (row - 1) * 2; sIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      row++;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sVerts, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(sUvs, 2));
    sg.setIndex(sIdx);
    sg.computeVertexNormals();

    scene.add(new THREE.Mesh(sg, new THREE.ShaderMaterial({
      uniforms: { uTime: sharedUniforms.uTime, uSunCol: sharedUniforms.uSunColor },
      transparent: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uSunCol; varying vec2 vUv;
        void main() {
          float flow = sin(vUv.y * 8.0 - uTime * 5.2 + sin(vUv.x * 9.0) * 1.4);
          float foam = smoothstep(0.54, 0.96, flow) + smoothstep(0.38, 0.5, abs(vUv.x - 0.5)) * 0.45;
          gl_FragColor = vec4(mix(vec3(0.28, 0.52, 0.62), vec3(0.95, 0.98, 1.0) * uSunCol, clamp(foam, 0.0, 1.0)), 0.85);
        }
      `
    })));

    // Mossy Himalayan boulders along stream & terrace outcrops
    const rockMat = new THREE.MeshStandardMaterial({ map: stoneWallTex, color: 0xaab4a5, roughness: 0.92 });
    const rockGeo = new THREE.DodecahedronGeometry(0.65, 1);
    for (let z = 30; z >= -38; z -= 2.4) {
      for (const side of [-1, 1]) {
        const rx = getStreamX(z) + side * (1.25 + rand() * 0.75);
        const r = new THREE.Mesh(rockGeo, rockMat);
        r.position.set(rx, getTerrainHeight(rx, z) + 0.1, z);
        r.scale.set(0.6 + rand() * 0.9, 0.45 + rand() * 0.6, 0.6 + rand() * 0.9);
        r.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        r.castShadow = true; r.receiveShadow = true;
        scene.add(r);
      }
    }

    // Cedar Footbridge crossing the Jhora stream at z = -7
    const bridgeX = getStreamX(-7), bridgeY = getTerrainHeight(bridgeX, -7) + 1.05;
    const bridgeWood = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x8f745c, roughness: 0.88 });
    const bridge = new THREE.Group();
    bridge.position.set(bridgeX, bridgeY, -7);
    for (let i = -5; i <= 5; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 1.65), bridgeWood);
      plank.position.set(i * 0.42, Math.cos((i / 5) * 1.1) * 0.16, 0);
      plank.castShadow = true; plank.receiveShadow = true;
      bridge.add(plank);
    }
    for (const rz of [-0.78, 0.78]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.07, 0.07), bridgeWood);
      rail.position.set(0, 0.85, rz); bridge.add(rail);
      for (const rx of [-2.0, 0, 2.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.95, 6), bridgeWood);
        post.position.set(rx, 0.44, rz); bridge.add(post);
      }
    }
    scene.add(bridge);

    // Traditional Himalayan schist stone steps along the winding footpath
    const stepMat = new THREE.MeshStandardMaterial({ map: stoneWallTex, roughness: 0.9 });
    for (let z = -22; z <= 28; z += 1.2) {
      const px = getPathX(z);
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.68), stepMat);
      step.position.set(px, getTerrainHeight(px, z) - 0.04, z);
      step.rotation.y = Math.atan2(getPathX(z + 0.5) - px, 0.5);
      step.receiveShadow = true;
      scene.add(step);
    }

    // Weathered Bamboo & Cedar Safety Railings on steep northern footpath bends
    const railMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x9b8264, roughness: 0.88 });
    const railPts = [];
    for (let z = -18; z <= 4; z += 2.2) {
      const rx = getPathX(z) - 1.25;
      const ry = getTerrainHeight(rx, z);
      railPts.push(new THREE.Vector3(rx, ry + 0.85, z));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.05, 6), railMat);
      post.position.set(rx, ry + 0.45, z);
      post.castShadow = true;
      scene.add(post);
    }
    const railBar = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 24, 0.036, 6, false), railMat);
    railBar.castShadow = true;
    scene.add(railBar);

    // Carved Heritage Darjeeling Estate Milestone near starting bend
    const mX = getPathX(7.5) + 1.5, mZ = 7.5, mY = getTerrainHeight(mX, mZ);
    const milestone = new THREE.Group();
    milestone.position.set(mX, mY, mZ);
    milestone.rotation.y = -0.35;
    const mStone = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.05, 0.24), stepMat);
    mStone.position.y = 0.48; mStone.castShadow = true; milestone.add(mStone);
    const mPlaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.24),
      new THREE.MeshStandardMaterial({ map: createSignTexture('HAPPY VALLEY', '2,100M · EST. 1854'), roughness: 0.6 })
    );
    mPlaque.position.set(0, 0.68, 0.13); milestone.add(mPlaque);
    scene.add(milestone);

    // Dry-stone terrace retaining wall below the Tola Ghar clearing
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 0.85), stepMat);
    wall.position.set(SHED_POS.x, SHED_POS.y - 0.85, SHED_POS.z - 3.6);
    wall.rotation.y = -0.32; wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);

    // DEEP PLAYABLE FOREGROUND DETAIL: 320 Lush Roadside Ferns & Golden Marigolds!
    const fernMat = new THREE.MeshStandardMaterial({
      map: fernTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.72
    });
    enhanceFoliageMaterial(fernMat, sharedUniforms, 'roadside-fern', 0.06, 0.52, true);
    const fernSpots = [];
    for (let z = -28; z <= 28; z += 0.95) {
      for (const side of [-1, 1]) {
        if (rand() < 0.78) {
          const fx = getPathX(z) + side * (1.15 + rand() * 0.75);
          fernSpots.push({ x: fx, y: getTerrainHeight(fx, z), z: z + (rand() - 0.5) * 0.4, s: 0.65 + rand() * 0.65 });
        }
        if (rand() < 0.55) {
          const sx = getStreamX(z) + side * (1.35 + rand() * 1.4);
          fernSpots.push({ x: sx, y: getTerrainHeight(sx, z), z: z + (rand() - 0.5) * 0.4, s: 0.85 + rand() * 0.85 });
        }
      }
    }
    for (const t of SHADE_TREES) {
      for (let k = 0; k < 5; k++) {
        const a = rand() * Math.PI * 2, d = 0.75 + rand() * 1.1;
        const fx = t.x + Math.cos(a) * d, fz = t.z + Math.sin(a) * d;
        fernSpots.push({ x: fx, y: getTerrainHeight(fx, fz), z: fz, s: 0.8 + rand() * 0.7 });
      }
    }
    const fernMesh = new THREE.InstancedMesh(createCrossedPlantGeo(0.75, 0.68), fernMat, fernSpots.length);
    const fDummy = new THREE.Object3D();
    fernSpots.forEach((f, i) => {
      fDummy.position.set(f.x, f.y - 0.05, f.z);
      fDummy.rotation.set(0, rand() * Math.PI * 2, 0);
      fDummy.scale.set(f.s, f.s, f.s);
      fDummy.updateMatrix();
      fernMesh.setMatrixAt(i, fDummy.matrix);
    });
    fernMesh.instanceMatrix.needsUpdate = true;
    fernMesh.receiveShadow = true;
    scene.add(fernMesh);
  }

  // -----------------------------------------------------------------------
  // C. DETAILED FEATHERY ALBIZIA SHADE TREES, DHUPI CEDAR-PINES & SUNBEAMS
  //    (Replaced solid plastic blobs & cones with layered alpha foliage!)
  // -----------------------------------------------------------------------
  {
    const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.94 });

    const albCardMat = new THREE.MeshStandardMaterial({
      map: albiziaTex, alphaTest: 0.34, side: THREE.DoubleSide, roughness: 0.72
    });
    enhanceFoliageMaterial(albCardMat, sharedUniforms, 'albizia-feathery', 0.05, 0.65, false);

    const dhupiCardMat = new THREE.MeshStandardMaterial({
      map: dhupiTex, alphaTest: 0.34, side: THREE.DoubleSide, roughness: 0.80
    });
    enhanceFoliageMaterial(dhupiCardMat, sharedUniforms, 'dhupi-bough', 0.028, 0.36, false);

    // Upward-biased painterly leaf plane geometry so tree canopies catch soft sunlight
    const makeFoliageCardGeo = (size) => {
      const g = new THREE.PlaneGeometry(size, size);
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      return g;
    };
    const albCardGeo = makeFoliageCardGeo(3.6);
    const dhupiCardGeo = makeFoliageCardGeo(3.4);

    // Volumetric sunbeam shafts
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uSunCol: sharedUniforms.uSunColor },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunCol; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          float edge = pow(abs(dot(vN, vV)), 1.6);
          float fade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.25, vUv.y);
          gl_FragColor = vec4(uSunCol, edge * fade * 0.072);
        }
      `
    });

    for (const t of SHADE_TREES) {
      const g = new THREE.Group();
      const ty = getTerrainHeight(t.x, t.z);
      g.position.set(t.x, ty - 0.25, t.z);

      if (t.type === 'albizia') {
        // Tapered gnarled trunk + flared buttress roots
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.42 * (rand() - 0.5), 3.1 * t.s, 0.42 * (rand() - 0.5)),
          new THREE.Vector3(0.75 * (rand() - 0.5), 6.2 * t.s, 0.65 * (rand() - 0.5))
        ]);
        const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.24 * t.s, 8, false), barkMat);
        trunk.castShadow = true; trunk.receiveShadow = true;
        g.add(trunk);

        // Buttress roots gripping hillside
        for (let r = 0; r < 4; r++) {
          const ra = (r / 4) * Math.PI * 2 + rand() * 0.5;
          const root = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * t.s, 0.16 * t.s, 1.1 * t.s, 6), barkMat);
          root.position.set(Math.cos(ra) * 0.32 * t.s, 0.35 * t.s, Math.sin(ra) * 0.32 * t.s);
          root.rotation.set(Math.sin(ra) * 0.45, 0, -Math.cos(ra) * 0.45);
          g.add(root);
        }

        // 5 spreading boughs crowned with 40 feathery layered leaf clusters!
        const boughs = [
          [2.8, 7.2, 1.4], [-2.7, 6.8, -1.5], [0.4, 8.2, -2.2], [-0.5, 7.6, 2.4], [0.0, 8.7, 0.0]
        ];
        const forkBase = curve.getPoint(0.76);
        for (const [bx, by, bz] of boughs) {
          const tip = new THREE.Vector3(bx * t.s, by * t.s, bz * t.s);
          const mid = forkBase.clone().lerp(tip, 0.55).add(new THREE.Vector3(0, 0.45 * t.s, 0));
          const limb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([forkBase, mid, tip]), 6, 0.095 * t.s, 6, false), barkMat);
          limb.castShadow = true;
          g.add(limb);

          // Airy cloud of 8 crossed feathery Albizia leaf-cards around each limb tip
          for (let c = 0; c < 8; c++) {
            const card = new THREE.Mesh(albCardGeo, albCardMat);
            card.position.set(
              tip.x + (rand() - 0.5) * 3.1 * t.s,
              tip.y + (rand() - 0.3) * 1.45 * t.s,
              tip.z + (rand() - 0.5) * 3.1 * t.s
            );
            // Mostly horizontal umbrella canopy tilt + crossed vertical volume cards
            card.rotation.set(
              (c % 2 === 0 ? -Math.PI * 0.42 : 0.25) + (rand() - 0.5) * 0.65,
              rand() * Math.PI * 2,
              (rand() - 0.5) * 0.55
            );
            const sc = (0.72 + rand() * 0.58) * t.s;
            card.scale.set(sc, sc, sc);
            card.castShadow = c % 2 === 0;
            g.add(card);
          }
        }

        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 3.6, 16, 12, 1, true), beamMat);
        beam.position.set(t.x, ty + 4.8, t.z);
        scene.add(beam);
        sunbeamMeshes.push(beam);
      } else {
        // Tall Himalayan Dhupi cedar-pine built from 28 feathery layered bough tiers!
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * t.s, 0.36 * t.s, 14.0 * t.s, 8), barkMat);
        trunk.position.y = 7.0 * t.s; trunk.castShadow = true;
        g.add(trunk);

        for (let tier = 0; tier < 14; tier++) {
          const frac = tier / 13;
          const yTier = (3.4 + frac * 10.2) * t.s;
          const radius = (2.1 - frac * 1.55) * t.s;
          for (let b = 0; b < 2; b++) {
            const card = new THREE.Mesh(dhupiCardGeo, dhupiCardMat);
            const a = tier * 1.35 + b * Math.PI;
            card.position.set(Math.cos(a) * radius * 0.35, yTier, Math.sin(a) * radius * 0.35);
            card.rotation.set(-Math.PI * 0.44 + (rand() - 0.5) * 0.3, a, (rand() - 0.5) * 0.25);
            const sc = (1.35 - frac * 0.92) * t.s;
            card.scale.set(sc, sc, sc);
            card.castShadow = b === 0;
            g.add(card);
          }
        }
      }
      scene.add(g);
    }
  }

  // -----------------------------------------------------------------------
  // D. 1854 HAPPY VALLEY TEA FACTORY & DARJEELING BUSTY COTTAGES
  // -----------------------------------------------------------------------
  {
    const whiteWall = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.88 });
    const darkTrim  = new THREE.MeshStandardMaterial({ color: 0x243e2e, roughness: 0.8 });
    const greenRoof = new THREE.MeshStandardMaterial({
      map: createCorrugatedTinTexture('#2d5a43', '#6b4228'), roughness: 0.52, metalness: 0.42
    });
    const warmWin = new THREE.MeshBasicMaterial({ color: 0xffd591 });
    const fac = new THREE.Group();
    fac.position.copy(FACTORY_POS); fac.rotation.y = -0.35;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(20, 3.2, 11.5), new THREE.MeshStandardMaterial({ map: stoneWallTex, roughness: 0.92 }));
    plinth.position.y = 1.0; plinth.receiveShadow = true; fac.add(plinth);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(19, 6.8, 10.5), whiteWall);
    hall.position.y = 5.8; hall.castShadow = true; hall.receiveShadow = true; fac.add(hall);
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(20.6, 0.22, 6.4), greenRoof);
      slope.position.set(0, 10.4, side * 2.7); slope.rotation.x = side * 0.44; slope.castShadow = true; fac.add(slope);
    }
    const loft = new THREE.Mesh(new THREE.BoxGeometry(14, 1.4, 2.2), darkTrim); loft.position.y = 11.7; fac.add(loft);
    for (let wx = -7.2; wx <= 7.2; wx += 2.4) {
      for (const wy of [4.4, 7.2]) {
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.65, 0.16), darkTrim); fr.position.set(wx, wy, -5.26); fac.add(fr);
        const pn = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.35), warmWin); pn.position.set(wx, wy, -5.36); pn.rotation.y = Math.PI; fac.add(pn);
      }
    }
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 1.85, 0.14),
      new THREE.MeshStandardMaterial({ map: createSignTexture('HAPPY VALLEY TEA ESTATE', 'DARJEELING · EST. 1854 · 2,100M'), roughness: 0.6 })
    );
    sign.position.set(0, 9.2, -5.32); sign.rotation.y = Math.PI; fac.add(sign);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.68, 15.5, 8), new THREE.MeshStandardMaterial({ color: 0x7a4236, roughness: 0.92 }));
    chim.position.set(8.2, 8.8, -1.8); chim.castShadow = true; fac.add(chim);
    scene.add(fac);

    const steamMat = new THREE.MeshBasicMaterial({ map: steamTex, transparent: true, depthWrite: false });
    const chimTop = new THREE.Vector3(8.2, 16.8, -1.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.35).add(FACTORY_POS);
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), steamMat);
      p.userData = { origin: chimTop.clone(), phase: i / 9 }; scene.add(p); factorySteamPuffs.push(p);
    }

    for (const cc of [
      { x: -12, z: 42, col: 0xd9c5a0, roof: '#8f3b2e', rot: 0.25 },
      { x: -24, z: 38, col: 0x99bfb8, roof: '#2d5575', rot: 0.42 },
      { x:  -2, z: 46, col: 0xe6d4b3, roof: '#346346', rot: -0.15 },
      { x:  42, z: 30, col: 0xd9a87c, roof: '#803a35', rot: -0.58 }
    ]) {
      const cg = new THREE.Group(); cg.position.set(cc.x, getTerrainHeight(cc.x, cc.z), cc.z); cg.rotation.y = cc.rot;
      const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.5, 4.4), new THREE.MeshStandardMaterial({ map: stoneWallTex, roughness: 0.9 })); base.position.y = 0.7; cg.add(base);
      const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.2, 4.1), new THREE.MeshStandardMaterial({ color: cc.col, roughness: 0.85 })); body.position.y = 3.2; body.castShadow = true; cg.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), new THREE.MeshStandardMaterial({ map: createCorrugatedTinTexture(cc.roof, '#593722'), roughness: 0.55, metalness: 0.35 }));
      roof.rotation.y = Math.PI / 4; roof.position.y = 5.7; roof.castShadow = true; cg.add(roof);
      const wp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), warmWin); wp.position.set(0, 3.4, -2.08); wp.rotation.y = Math.PI; cg.add(wp);
      scene.add(cg);
    }
  }

  // -----------------------------------------------------------------------
  // E. DETAILED DARJEELING RANGEET VALLEY ROPEWAY (Lattice Towers & Cabins)
  // -----------------------------------------------------------------------
  const ropewayCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(78, 12, -52),
    new THREE.Vector3(24, -22, -128),
    new THREE.Vector3(-42, -48, -210)
  ]);
  {
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b484f, roughness: 0.55, metalness: 0.65 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x203542, roughness: 0.15, metalness: 0.75 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.5 });

    // Proper 4-leg tapered steel lattice pylon towers with pulley wheels
    for (const pt of [ropewayCurve.points[0], ropewayCurve.points[2]]) {
      const tw = new THREE.Group();
      tw.position.set(pt.x, pt.y - 18, pt.z);
      for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
        const legCurve = new THREE.LineCurve3(new THREE.Vector3(lx, 0, lz), new THREE.Vector3(lx * 0.28, 18.2, lz * 0.28));
        tw.add(new THREE.Mesh(new THREE.TubeGeometry(legCurve, 2, 0.12, 5, false), steelMat));
      }
      for (const h of [5, 10, 15]) {
        const s = THREE.MathUtils.lerp(2.4, 0.9, h / 18);
        tw.add(new THREE.Mesh(new THREE.BoxGeometry(s, 0.18, s), steelMat).translateY(h));
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.65, 0.75), steelMat);
      bar.position.y = 18.0; tw.add(bar);
      for (const sx of [-2.2, 2.2]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.22, 12), steelMat);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(sx, 18.1, 0); tw.add(wheel);
      }
      scene.add(tw);
    }

    for (const off of [-2.2, 2.2]) {
      const pts = ropewayCurve.getPoints(36).map((v) => v.clone().add(new THREE.Vector3(off, 0, 0)));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a3136 })));
    }

    // Vintage Windowed Darjeeling Cable Cars (color body + panoramic glass + roof cap)
    const carCols = [0xc93b32, 0xe2a82e, 0x2b76a3, 0x35824c, 0xcf672f];
    for (let i = 0; i < 5; i++) {
      const pivot = new THREE.Group();
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.4, 6), steelMat);
      hanger.position.y = -1.2; pivot.add(hanger);

      const paintMat = new THREE.MeshStandardMaterial({ color: carCols[i], roughness: 0.42, metalness: 0.25 });
      const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 2.45), paintMat);
      lowerBody.position.y = -3.85; pivot.add(lowerBody);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.16, 2.48), creamMat);
      stripe.position.y = -3.28; pivot.add(stripe);
      const windows = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.88, 2.36), glassMat);
      windows.position.y = -2.82; pivot.add(windows);
      const roofCap = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.22, 2.58), creamMat);
      roofCap.position.y = -2.32; pivot.add(roofCap);

      scene.add(pivot);
      ropewayCars.push({
        pivot, t: i / 5, dir: i % 2 === 0 ? 1 : -1,
        lane: i % 2 === 0 ? -2.2 : 2.2, angle: 0, angVel: 0
      });
    }
  }

  // -----------------------------------------------------------------------
  // F. TOLA WEIGHING SHED + PENDULUM BRASS SCALE + VERLET PRAYER FLAGS
  // -----------------------------------------------------------------------
  {
    const shed = new THREE.Group();
    shed.position.copy(SHED_POS); shed.rotation.y = -0.32;

    const woodMat  = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x80634b, roughness: 0.9 });
    const tinMat   = new THREE.MeshStandardMaterial({ map: createCorrugatedTinTexture('#4d5f63', '#6e452a'), roughness: 0.54, metalness: 0.42 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xe0b558, roughness: 0.3, metalness: 0.82 });
    const dokoMat  = new THREE.MeshStandardMaterial({ map: bambooTex, roughness: 0.86, side: THREE.DoubleSide });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.38, 4.0), woodMat);
    deck.position.y = 0.19; deck.receiveShadow = true; shed.add(deck);
    for (const [px, pz] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.25, 7), woodMat);
      post.position.set(px, 1.75, pz); post.castShadow = true; shed.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.16, 4.9), tinMat);
    roof.position.y = 3.45; roof.rotation.x = 0.16; roof.castShadow = true; shed.add(roof);

    const scalePivot = new THREE.Group(); scalePivot.position.set(0, 3.35, 0.32);
    scalePivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.1, 6), brassMat).translateY(-0.55));
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12), brassMat);
    dial.rotation.x = Math.PI / 2; dial.position.y = -0.82; scalePivot.add(dial);
    scalePivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.24, 0.18, 14), brassMat).translateY(-1.22));
    shed.add(scalePivot); scalePendulum.group = scalePivot;

    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd999 }));
    lantern.position.set(1.6, 2.75, 1.2); shed.add(lantern);

    const moundMat = new THREE.MeshStandardMaterial({ color: 0x5aa838, roughness: 0.78 });
    for (const [dx, dz, tilt, full] of [[-1.45, 0.55, 0.08, true], [-1.95, -0.45, -0.14, false], [1.55, -0.75, 0.06, true]]) {
      const b = new THREE.Group(); b.position.set(dx, 0.86, dz); b.rotation.z = tilt;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.14, 0.94, 14, 1, true), dokoMat); cone.castShadow = true; b.add(cone);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.028, 6, 16), woodMat); rim.rotation.x = Math.PI / 2; rim.position.y = 0.47; b.add(rim);
      if (full) { const hp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), moundMat); hp.scale.set(1, 0.48, 1); hp.position.y = 0.35; b.add(hp); }
      shed.add(b);
    }
    scene.add(shed);

    const bambooMat = new THREE.MeshStandardMaterial({ color: 0xb68d52, roughness: 0.88 });
    const flagTexs = ['#3268ab', '#eeeae0', '#c73e32', '#388549', '#e3b33b'].map(createPrayerFlagTexture);
    const addVerletFlagSpan = (a, b, count) => {
      const nodes = [];
      for (let i = 0; i <= count; i++) {
        const p = new THREE.Vector3().lerpVectors(a, b, i / count); p.y -= Math.sin((i / count) * Math.PI) * 0.72;
        nodes.push({ pos: p.clone(), old: p.clone(), pinned: i === 0 || i === count });
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(nodes.map((n) => n.pos)), new THREE.LineBasicMaterial({ color: 0x8f8575 }));
      scene.add(line);
      const flags = [], fGeo = new THREE.PlaneGeometry(0.42, 0.50); fGeo.translate(0, -0.25, 0);
      for (let i = 1; i < count; i++) {
        const mesh = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ map: flagTexs[i % flagTexs.length], roughness: 0.9, side: THREE.DoubleSide }));
        mesh.userData = { phase: i * 0.7 }; scene.add(mesh); flags.push({ mesh, nodeIdx: i });
      }
      verletRopes.push({ nodes, segLen: (a.distanceTo(b) / count) * 1.035, line, flags });
    };

    const poleA = new THREE.Vector3(SHED_POS.x - 10.5, getTerrainHeight(SHED_POS.x - 10.5, SHED_POS.z - 3), SHED_POS.z - 3);
    const pmA = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 5.5, 6), bambooMat); pmA.position.set(poleA.x, poleA.y + 2.65, poleA.z); scene.add(pmA);
    addVerletFlagSpan(new THREE.Vector3(SHED_POS.x - 1.9, SHED_POS.y + 3.35, SHED_POS.z - 0.5), new THREE.Vector3(poleA.x, poleA.y + 5.2, poleA.z), 17);

    const p1 = new THREE.Vector3(-17, getTerrainHeight(-17, -6) + 4.4, -6), p2 = new THREE.Vector3(-27, getTerrainHeight(-27, -9) + 4.6, -9);
    for (const pp of [p1, p2]) { const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.8, 6), bambooMat); pm.position.set(pp.x, pp.y - 2.2, pp.z); scene.add(pm); }
    addVerletFlagSpan(p1, p2, 15);
  }

  // -----------------------------------------------------------------------
  // G. DRIFTING RANGEET VALLEY MIST CLOUDS
  // -----------------------------------------------------------------------
  {
    const mistMat = new THREE.MeshBasicMaterial({
      map: mistTex, transparent: true, depthWrite: false, opacity: 0.48, side: THREE.DoubleSide
    });
    for (let i = 0; i < 42; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(110 + rand() * 195, 36 + rand() * 62), mistMat);
      card.position.set((rand() - 0.5) * 560, -34 + rand() * 52, -75 - rand() * 440);
      card.userData.speed = 0.75 + rand() * 1.8;
      scene.add(card);
      mistCards.push(card);
    }
  }

  return {
    peakWorldPositions, spindriftPlumes, sunbeamMeshes, factorySteamPuffs,
    ropewayCars, ropewayCurve, scalePendulum, verletRopes, mistCards, bambooTex
  };
}