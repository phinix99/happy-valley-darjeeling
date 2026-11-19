import * as THREE from 'three';

// =========================================================================
// PROCEDURAL HIMALAYAN WEB AUDIO SOUNDSCAPE
// Zero external MP3s: mountain wind, Jhora stream, Raag Pahadi chimes,
// crisp stem snaps, woven bamboo doko thumps, whistling thrushes, and
// distant Darjeeling Himalayan Railway ("Toy Train") steam whistle echoes.
// =========================================================================
export class Soundscape {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.volume = 0.85;

    this.masterGain = null;
    this.echoSend = null;
    this.windFilter = null;
    this.windGain = null;
    this.streamGain = null;
    this.padGain = null;
    this.noiseBuffer = null;

    this.birdTimer = 3.5;
    this.trainTimer = 28.0;
  }

  init() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.started = true;

    // Master output bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);

    // Subtle Rangeet Valley Echo / Delay bus (for birds, chimes & distant Toy Train)
    this.echoSend = this.ctx.createGain();
    this.echoSend.gain.value = 0.42;
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.36;
    const echoFilter = this.ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 1150;
    const echoFeedback = this.ctx.createGain();
    echoFeedback.gain.value = 0.34;

    this.echoSend.connect(delay);
    delay.connect(echoFilter);
    echoFilter.connect(this.masterGain);
    echoFilter.connect(echoFeedback);
    echoFeedback.connect(delay);

    // Reusable 4-second warm pink-noise buffer
    const len = this.ctx.sampleRate * 4;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.296;
      b2 = 0.570 * b2 + w * 1.052;
      data[i] = (b0 + b1 + b2 + w * 0.18) * 0.055;
    }

    // 1) Continuous Himalayan Ridge Wind
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 310;
    this.windFilter.Q.value = 0.85;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.22;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSrc.start();

    // 2) Proximity-Based Jhora Mountain Stream (Western Rocky Hollow)
    const streamSrc = this.ctx.createBufferSource();
    streamSrc.buffer = this.noiseBuffer;
    streamSrc.loop = true;
    const streamFilter = this.ctx.createBiquadFilter();
    streamFilter.type = 'bandpass';
    streamFilter.frequency.value = 1480;
    streamFilter.Q.value = 0.6;
    this.streamGain = this.ctx.createGain();
    this.streamGain.gain.value = 0.015;
    streamSrc.connect(streamFilter);
    streamFilter.connect(this.streamGain);
    this.streamGain.connect(this.masterGain);
    streamSrc.start();

    // 3) Warm Raag Pahadi Mountain Drone (D3, A3, D4, F#4 — blooms during Rest & Gaze)
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.012;
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 540;
    this.padGain.connect(padFilter);
    padFilter.connect(this.masterGain);

    [146.83, 220.0, 293.66, 369.99].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = idx === 0 ? 0.34 : 0.15 / idx;
      osc.connect(g);
      g.connect(this.padGain);
      osc.start();
    });
  }

  setVolume(v) {
    this.volume = THREE.MathUtils.clamp(v, 0, 1);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  }

  update(dt, windStrength, isResting, distToStream) {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;

    this.windFilter.frequency.setTargetAtTime(210 + windStrength * 360, now, 0.35);
    this.windGain.gain.setTargetAtTime((isResting ? 0.30 : 0.16) + windStrength * 0.11, now, 0.4);
    this.padGain.gain.setTargetAtTime(isResting ? 0.098 : 0.012, now, 1.15);

    const streamVol = THREE.MathUtils.clamp(1 - distToStream / 22, 0, 1) * 0.15;
    this.streamGain.gain.setTargetAtTime(streamVol, now, 0.22);

    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 7.0 + Math.random() * 11.5;
      this.playWhistlingThrush();
    }

    this.trainTimer -= dt;
    if (this.trainTimer <= 0) {
      this.trainTimer = 38.0 + Math.random() * 28.0;
      this.playDistantToyTrainWhistle();
    }
  }

  // Soft botanical contact rustle when fingers close onto a tea shoot
  playPinchStart() {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.055);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2600;
    const g = this.ctx.createGain();
    g.gain.value = 0.032;
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  // Crisp Node Snap + Ascending Raag Pahadi Santoor/Bansuri harmonic chime
  playCrispSnap(streak, isCrisp, isFine, isDew) {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 1) Tactile tender stem snap vs coarse woody crunch
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = isFine ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(isCrisp ? 940 : (isFine ? 660 : 220), now);
    osc.frequency.exponentialRampToValueAtTime(isFine ? 215 : 75, now + 0.055);
    g.gain.setValueAtTime(isFine ? 0.17 : 0.13, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.068);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.075);

    // 2) Musical Raag Pahadi pentatonic scale ascending with flow streak
    if (isFine) {
      const scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51];
      const note = scale[streak % scale.length];

      const ch = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      ch.type = 'sine';
      ch.frequency.setValueAtTime(note, now + 0.015);
      cg.gain.setValueAtTime(isCrisp ? 0.058 : 0.025, now + 0.015);
      cg.gain.exponentialRampToValueAtTime(0.0005, now + (isCrisp ? 0.62 : 0.34));
      ch.connect(cg);
      cg.connect(this.masterGain);
      if (isCrisp) cg.connect(this.echoSend);
      ch.start(now + 0.015);
      ch.stop(now + 0.65);

      // Extra crystalline dewdrop shimmer on Dew-Kissed Silver Tips
      if (isDew) {
        const sp = this.ctx.createOscillator();
        const sg = this.ctx.createGain();
        sp.type = 'sine';
        sp.frequency.value = note * 1.5;
        sg.gain.setValueAtTime(0.044, now + 0.07);
        sg.gain.exponentialRampToValueAtTime(0.0004, now + 0.72);
        sp.connect(sg);
        sg.connect(this.masterGain);
        sg.connect(this.echoSend);
        sp.start(now + 0.07);
        sp.stop(now + 0.75);
      }
    }
  }

  // Arm-sweep air whoosh when tossing cupped handful over shoulder
  playTossWhoosh() {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.22);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(480, now);
    f.frequency.exponentialRampToValueAtTime(1480, now + 0.2);
    const g = this.ctx.createGain();
    g.gain.value = 0.095;
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  // Hollow woven-bamboo Doko thump + fresh tea-leaf rustle on landing
  playDokoLand(count = 1) {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;

    const tap = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    tap.type = 'sine';
    tap.frequency.setValueAtTime(215 + Math.random() * 35, now);
    tap.frequency.exponentialRampToValueAtTime(108, now + 0.075);
    tg.gain.setValueAtTime(0.068, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    tap.connect(tg);
    tg.connect(this.masterGain);
    tap.start(now);
    tap.stop(now + 0.095);

    const len = Math.floor(this.ctx.sampleRate * 0.17);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2150;
    f.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(0.115, 0.045 + count * 0.016);
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  // Subtle earthy terrace step vs crisp Himalayan schist stone step
  playFootstep(onStone) {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.085);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.3);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = onStone ? 960 : 400 + Math.random() * 140;
    const g = this.ctx.createGain();
    g.gain.value = onStone ? 0.10 : 0.075;
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  // Himalayan Blue Whistling Thrush echoing across the valley
  playWhistlingThrush() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = 1820 + Math.random() * 720;
    [0, 0.22, 0.43].forEach((off, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const mult = idx === 0 ? 1.0 : (idx === 1 ? 1.24 : 0.94);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * mult, now + off);
      osc.frequency.exponentialRampToValueAtTime(base * mult * (idx === 1 ? 1.14 : 0.85), now + off + 0.16);
      g.gain.setValueAtTime(0.0001, now + off);
      g.gain.linearRampToValueAtTime(0.015, now + off + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.19);
      osc.connect(g);
      g.connect(this.masterGain);
      g.connect(this.echoSend);
      osc.start(now + off);
      osc.stop(now + off + 0.21);
    });
  }

  // Distant Darjeeling Himalayan Railway ("Toy Train") twin-tone steam whistle echo
  playDistantToyTrainWhistle() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Iconic narrow-gauge steam whistle minor-third harmonic pair, softly low-passed by distance
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 920;
    lp.connect(this.masterGain);
    lp.connect(this.echoSend);

    [587.33, 698.46].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 0.992, now + 1.45);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.014, now + 0.18);
      g.gain.setValueAtTime(0.012, now + 1.05);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
      osc.connect(g);
      g.connect(lp);
      osc.start(now);
      osc.stop(now + 1.7);
    });
  }

  // Resonant brass weighing-scale bell chord at the Tola Ghar
  playBrassScaleBell() {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    [587.33, 880.0, 1174.66].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.075 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0004, now + 2.6);
      osc.connect(g);
      g.connect(this.masterGain);
      g.connect(this.echoSend);
      osc.start(now);
      osc.stop(now + 2.7);
    });
  }
}