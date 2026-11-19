import * as THREE from 'three';
import { getPathX, getStreamX, getTerrainHeight, getTerrainNormal } from './geo.js';
import { createDetailedShootGeo } from './foliage.js';

// =========================================================================
// 120HZ SUB-STEPPED PHYSICS ENGINE
// - Terrain slope gravity, load mass & surface traction (stone vs moss)
// - Cedar footbridge deck support over the Jhora stream
// - Verlet rope & cloth integration for Tibetan Lungta prayer flags
// - Damped spherical pendulum + vertical spring for Tola Brass Scale
// - Pendulum inertia for Darjeeling Rangeet Ropeway gondolas
// - Aerodynamic rigid-body trajectories for tossed shoots & dew bursts
// =========================================================================
export class PhysicsWorld {
  constructor(scene, world, sharedUniforms, audio, callbacks = {}) {
    this.scene = scene;
    this.world = world;
    this.sharedUniforms = sharedUniforms;
    this.audio = audio;
    this.onLeafLanded = callbacks.onLeafLanded || (() => {});

    // Player physical body state
    const startX = getPathX(10);
    this.playerPos = new THREE.Vector3(startX, getTerrainHeight(startX, 10), 10);
    this.playerVel = new THREE.Vector3();
    this.terrainNormal = new THREE.Vector3(0, 1, 0);
    this.slopeAngleDeg = 0;
    this.stamina = 1.0;

    // Stride & spring-damped Doko sway state
    this.walkBobPhase = 0;
    this.lastStepSign = 1;
    this.dokoSpringAngle = 0;
    this.dokoSpringVel = 0;

    // Dynamic 3D mountain wind vector
    this.currentWind = new THREE.Vector3(1.8, 0, 0.7);

    // Fixed-timestep accumulator (120Hz)
    this.accum = 0;
    this.FIXED_DT = 1 / 120;

    // Reusable aerodynamic particle geometries
    this.aeroBodies = [];
    this.tossShootGeo = createDetailedShootGeo();
    this.tossShootGeo.scale(0.86, 0.86, 0.86);
    this.dewGeo = new THREE.SphereGeometry(0.018, 5, 5);
    this.dewMat = new THREE.MeshBasicMaterial({ color: 0xfff8cc });

    // Precompute Jhora cedar footbridge anchor
    this.bridgeX = getStreamX(-7);
    this.bridgeBaseY = getTerrainHeight(this.bridgeX, -7) + 1.08;
  }

  // Ground height including arched cedar footbridge deck over the Jhora stream
  getSupportHeight(x, z) {
    let groundY = getTerrainHeight(x, z);
    const dx = x - this.bridgeX;
    const dz = z - (-7);
    if (Math.abs(dx) < 2.35 && Math.abs(dz) < 0.95) {
      const arch = Math.cos((dx / 2.35) * 1.1) * 0.18;
      groundY = Math.max(groundY, this.bridgeBaseY + arch);
    }
    return groundY;
  }

  // Trigger physical drop impulse on the Tola Shed brass weighing pan
  impulseWeighScale() {
    const sp = this.world.scalePendulum;
    sp.dipVel = -2.45;
    sp.velZ += 1.25;
    sp.velX += (Math.random() - 0.5) * 0.7;
  }

  // Trigger GPU spring-recoil ripple on tea bushes at the snapped shoot position
  triggerBushRecoil(pos) {
    this.sharedUniforms.uPluckPulse.value.set(pos.x, pos.y, pos.z, 1.0);
  }

  // Spawn sparkling sunlit morning dew droplets bursting from a crisp snap
  spawnDewBurst(origin, count = 8) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.dewGeo, this.dewMat);
      mesh.position.copy(origin);
      this.scene.add(mesh);
      this.aeroBodies.push({
        mesh,
        kind: 'dew',
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 1.9,
          0.85 + Math.random() * 1.45,
          (Math.random() - 0.5) * 1.9
        ),
        angVel: new THREE.Vector3(),
        drag: 1.85,
        life: 0,
        maxLife: 0.62 + Math.random() * 0.36
      });
    }
  }

  // Launch cupped handful backward over shoulder into the woven bamboo Doko
  launchShoulderToss(items, yaw) {
    if (!items || items.length === 0) return;
    this.audio.playTossWhoosh();

    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const startBase = this.playerPos.clone()
      .add(new THREE.Vector3(0, 1.38, 0))
      .addScaledVector(fwd, 0.34)
      .addScaledVector(right, -0.18);

    const flightT = 0.56;
    const targetPos = this.playerPos.clone()
      .addScaledVector(fwd, -0.46)
      .add(new THREE.Vector3(0, 1.15, 0));

    const g = -9.81;
    items.forEach((item, idx) => {
      const mat = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.44 });
      const mesh = new THREE.Mesh(this.tossShootGeo, mat);
      const start = startBase.clone().add(new THREE.Vector3((idx - 2) * 0.04, idx * 0.02, 0));
      mesh.position.copy(start);
      this.scene.add(mesh);

      // Exact ballistic launch velocity compensating for player velocity & gravity
      const vx = (targetPos.x - start.x) / flightT + (Math.random() - 0.5) * 0.32 + this.playerVel.x;
      const vz = (targetPos.z - start.z) / flightT + (Math.random() - 0.5) * 0.32 + this.playerVel.z;
      const vy = (targetPos.y - start.y - 0.5 * g * flightT * flightT) / flightT + 0.36 + idx * 0.08;

      this.aeroBodies.push({
        mesh,
        kind: 'shoot',
        vel: new THREE.Vector3(vx, vy, vz),
        angVel: new THREE.Vector3(7 + Math.random() * 6, 5 + Math.random() * 5, 6 + Math.random() * 5),
        drag: 0.52,
        life: 0,
        maxLife: flightT + 0.12,
        weight: item.weight,
        landed: false,
        batchSize: items.length,
        isLast: idx === items.length - 1
      });
    });
  }

  // Advance physics using fixed 120Hz substeps for stability
  update(dt, elapsed, inputState) {
    this.accum += Math.min(dt, 0.05);
    while (this.accum >= this.FIXED_DT) {
      this.substep(this.FIXED_DT, elapsed, inputState);
      this.accum -= this.FIXED_DT;
    }

    // Sync visual transforms for Verlet prayer flags, brass scale & ropeway cars
    this.syncVisualMeshes(dt, elapsed);
  }

  substep(fdt, elapsed, state) {
    const { active, isResting, yaw, moveF, moveR, sprinting, dokoWeight, dokoTargetKg } = state;

    // 1) Dynamic 3D Himalayan Wind Field
    const gust = 0.55 + 0.45 * Math.sin(elapsed * 0.42) * Math.cos(elapsed * 0.19);
    this.currentWind.set(1.4 + gust * 2.6, Math.sin(elapsed * 0.8) * 0.24, 0.5 + gust * 1.1);
    this.sharedUniforms.uWindVec.value.set(this.currentWind.x * 0.42, this.currentWind.z * 0.42);

    // Decay GPU tea-bush pluck recoil spring
    if (this.sharedUniforms.uPluckPulse.value.w > 0) {
      this.sharedUniforms.uPluckPulse.value.w = Math.max(0, this.sharedUniforms.uPluckPulse.value.w - fdt * 2.6);
    }

    // 2) Player Slope Gravity, Doko Mass Load & Surface Traction
    if (active && !isResting) {
      getTerrainNormal(this.playerPos.x, this.playerPos.z, this.terrainNormal);
      this.slopeAngleDeg = THREE.MathUtils.radToDeg(
        Math.acos(THREE.MathUtils.clamp(this.terrainNormal.y, -1, 1))
      );

      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const rgt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const wish = new THREE.Vector3().addScaledVector(fwd, moveF).addScaledVector(rgt, moveR);
      const hasInput = wish.lengthSq() > 0.001;
      if (hasInput) wish.normalize();

      // Carried bamboo doko load physically increases mass & slope resistance
      const massRatio = 1.0 + (dokoWeight / dokoTargetKg) * 0.42;
      const canSprint = sprinting && this.stamina > 0.12;
      const maxSpeed = (canSprint ? 4.75 : 3.05) / Math.pow(massRatio, 0.65) * (0.70 + 0.30 * this.stamina);

      // Downhill gravitational slope acceleration projected onto XZ plane
      const slopePushX = this.terrainNormal.x * 5.2 * massRatio;
      const slopePushZ = this.terrainNormal.z * 5.2 * massRatio;

      // Surface traction: stone path & cedar bridge grip firmer than grassy slopes
      const onPath = Math.abs(this.playerPos.x - getPathX(this.playerPos.z)) < 1.65;
      const onBridge = Math.abs(this.playerPos.x - this.bridgeX) < 2.35 && Math.abs(this.playerPos.z + 7) < 0.95;
      const friction = (onPath || onBridge) ? 10.6 : 8.2;

      if (hasInput) {
        const accel = friction * maxSpeed;
        this.playerVel.x += (wish.x * accel + slopePushX * 0.42) * fdt;
        this.playerVel.z += (wish.z * accel + slopePushZ * 0.42) * fdt;
      } else if (this.slopeAngleDeg > 26 && !onBridge) {
        this.playerVel.x += slopePushX * 0.22 * fdt;
        this.playerVel.z += slopePushZ * 0.22 * fdt;
      }

      const damp = Math.exp(-friction * fdt);
      this.playerVel.x *= damp;
      this.playerVel.z *= damp;

      const prevY = this.playerPos.y;
      this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x + this.playerVel.x * fdt, -38, 38);
      this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z + this.playerVel.z * fdt, -32, 34);
      this.playerPos.y = this.getSupportHeight(this.playerPos.x, this.playerPos.z);

      const speed = Math.hypot(this.playerVel.x, this.playerVel.z);
      const climbing = (this.playerPos.y - prevY) > 0.002;

      if (speed > 0.22) {
        const drain = (climbing ? 0.088 : 0.024) * massRatio * (canSprint ? 1.75 : 0.72);
        this.stamina = Math.max(0.08, this.stamina - drain * fdt);

        this.walkBobPhase += fdt * (2.5 + speed * 1.8);
        const sign = Math.sin(this.walkBobPhase) >= 0 ? 1 : -1;
        if (sign !== this.lastStepSign && sign < 0) {
          this.audio.playFootstep(onPath || onBridge);
        }
        this.lastStepSign = sign;
      } else {
        this.stamina = Math.min(1.0, this.stamina + 0.16 * fdt);
      }

      // Spring-damper physical sway of the bamboo Doko behind the collector's back
      const dokoTarget = THREE.MathUtils.clamp(speed * 0.04, 0, 0.25) + Math.sin(this.walkBobPhase) * 0.06;
      this.dokoSpringVel += ((dokoTarget - this.dokoSpringAngle) * 34.0 - this.dokoSpringVel * 5.5) * fdt;
      this.dokoSpringAngle += this.dokoSpringVel * fdt;
    } else {
      this.playerVel.multiplyScalar(Math.exp(-9.0 * fdt));
      if (isResting) {
        this.stamina = Math.min(1.0, this.stamina + 0.36 * fdt);
      }
    }

    // 3) Verlet Integration for Tibetan Lungta Prayer Flag Ropes
    for (const rope of this.world.verletRopes) {
      for (const n of rope.nodes) {
        if (n.pinned) continue;
        const vx = (n.pos.x - n.old.x) * 0.985;
        const vy = (n.pos.y - n.old.y) * 0.985;
        const vz = (n.pos.z - n.old.z) * 0.985;
        n.old.copy(n.pos);
        n.pos.x += vx + this.currentWind.x * 0.12 * fdt * fdt;
        n.pos.y += vy - 9.81 * 0.38 * fdt * fdt;
        n.pos.z += vz + this.currentWind.z * 0.12 * fdt * fdt;
      }

      // 4 distance constraint relaxation passes
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < rope.nodes.length - 1; i++) {
          const a = rope.nodes[i], b = rope.nodes[i + 1];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const dz = b.pos.z - a.pos.z;
          const dist = Math.hypot(dx, dy, dz) || 0.0001;
          const diff = (dist - rope.segLen) / dist;

          if (!a.pinned && !b.pinned) {
            a.pos.x += dx * 0.5 * diff; a.pos.y += dy * 0.5 * diff; a.pos.z += dz * 0.5 * diff;
            b.pos.x -= dx * 0.5 * diff; b.pos.y -= dy * 0.5 * diff; b.pos.z -= dz * 0.5 * diff;
          } else if (!a.pinned) {
            a.pos.x += dx * diff; a.pos.y += dy * diff; a.pos.z += dz * diff;
          } else if (!b.pinned) {
            b.pos.x -= dx * diff; b.pos.y -= dy * diff; b.pos.z -= dz * diff;
          }
        }
      }
    }

    // 4) Hanging Brass Weighing Scale Spherical Pendulum + Vertical Spring
    const sp = this.world.scalePendulum;
    const windTorque = Math.sin(elapsed * 2.1) * this.currentWind.x * 0.08;
    sp.velX += (-14.0 * sp.angleX - 1.1 * sp.velX + windTorque) * fdt;
    sp.velZ += (-14.0 * sp.angleZ - 1.1 * sp.velZ + windTorque * 0.6) * fdt;
    sp.angleX += sp.velX * fdt;
    sp.angleZ += sp.velZ * fdt;
    sp.dipVel += (-38.0 * sp.dipY - 4.2 * sp.dipVel) * fdt;
    sp.dipY += sp.dipVel * fdt;

    // 5) Aerodynamic Rigid-Body Leaf Tosses & Sparkling Dew Droplets
    for (let i = this.aeroBodies.length - 1; i >= 0; i--) {
      const b = this.aeroBodies[i];
      b.life += fdt;

      const relVx = b.vel.x - this.currentWind.x * 0.18;
      const relVz = b.vel.z - this.currentWind.z * 0.18;
      b.vel.x -= relVx * b.drag * fdt;
      b.vel.z -= relVz * b.drag * fdt;
      b.vel.y += (-9.81 - b.vel.y * b.drag * 0.45) * fdt;

      b.mesh.position.addScaledVector(b.vel, fdt);
      b.mesh.rotation.x += b.angVel.x * fdt;
      b.mesh.rotation.y += b.angVel.y * fdt;
      b.mesh.rotation.z += b.angVel.z * fdt;

      if (b.life >= b.maxLife) {
        if (b.kind === 'shoot' && !b.landed) {
          b.landed = true;
          this.dokoSpringVel += 1.6; // tactile recoil kick inside the woven doko
          this.onLeafLanded(b.weight, b.isLast, b.batchSize);
        }
        this.scene.remove(b.mesh);
        if (b.kind === 'shoot') b.mesh.material.dispose();
        this.aeroBodies.splice(i, 1);
      }
    }
  }

  syncVisualMeshes(dt, elapsed) {
    // Update Verlet prayer flag rope geometry & wind-fluttering banners
    for (const rope of this.world.verletRopes) {
      const pa = rope.line.geometry.attributes.position;
      for (let i = 0; i < rope.nodes.length; i++) {
        const p = rope.nodes[i].pos;
        pa.setXYZ(i, p.x, p.y, p.z);
      }
      pa.needsUpdate = true;

      for (const f of rope.flags) {
        const a = rope.nodes[f.nodeIdx].pos;
        const b = rope.nodes[f.nodeIdx + 1].pos;
        f.mesh.position.copy(a);
        f.mesh.lookAt(b.x, a.y, b.z);
        f.mesh.rotateY(Math.PI / 2);
        f.mesh.rotation.z =
          Math.sin(elapsed * 6.5 + f.mesh.userData.phase) * 0.28 +
          0.16 * this.currentWind.x * 0.25;
      }
    }

    // Update Tola Ghar hanging brass scale pendulum
    const sp = this.world.scalePendulum;
    if (sp.group) {
      sp.group.rotation.x = sp.angleX;
      sp.group.rotation.z = sp.angleZ;
      sp.group.position.y = 3.35 + sp.dipY * 0.18;
    }

    // Update Darjeeling Rangeet Valley Ropeway gondolas with pendulum sway
    for (const car of this.world.ropewayCars) {
      car.t += car.dir * dt * 0.018;
      if (car.t > 1) { car.t = 1; car.dir = -1; }
      if (car.t < 0) { car.t = 0; car.dir = 1; }
      const pt = this.world.ropewayCurve.getPointAt(car.t);
      car.pivot.position.set(pt.x + car.lane, pt.y, pt.z);
      const windPush = Math.sin(elapsed * 1.4 + car.t * 8.0) * 0.08 * this.currentWind.x;
      car.angVel += (-9.5 * car.angle - 1.2 * car.angVel + windPush) * dt;
      car.angle += car.angVel * dt;
      car.pivot.rotation.z = car.angle;
    }
  }
}