// All sound is synthesised with WebAudio; nothing is loaded from disk or sampled from another game.
// Engine: a loop of individual firing pulses (V12 diesel) or a whine-and-roar stack (gas turbine), pitched by rpm,
// with turbo whistle and gearbox whine. Tracks: a link-by-link click train plus squeal in turns. Cannon: crack,
// boom, breech clank and slap-back echoes off the street canyon. Reload: the breech and loader working through the cycle.
import { clamp, rand } from './core/util.js';

export class Audio {
  constructor() { this.ctx = null; this.vol = 0.8; this.listener = { x: 0, y: 0, z: 0 }; this.ready = false; }
  // must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(c.destination);
    // noise source shared by everything
    const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // echo: a decaying noise impulse stands in for the street canyon
    const il = c.sampleRate * 2.6, ir = c.createBuffer(2, il, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < il; i++) { const t = i / il; a[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (1 + 0.8 * Math.sin(i * 0.0007 + ch)); } }
    this.verb = c.createConvolver(); this.verb.buffer = ir; this.verbGain = c.createGain(); this.verbGain.gain.value = 0.5; this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    this.shaper = (k) => { const n = 256, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * k); } const w = c.createWaveShaper(); w.curve = curve; return w; };
    this.buildEngine(); this.ready = true;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  suspend(on) { if (this.ctx) { if (on) this.ctx.suspend(); else this.ctx.resume(); } }

  // A loop of discrete firing pulses: 8 engine cycles of 12 cylinders with an uneven bank, so it lopes instead of buzzing.
  pulseLoop() {
    const c = this.ctx, sr = c.sampleRate, cyc = 0.17, n = 8, len = Math.floor(sr * cyc * n), b = c.createBuffer(1, len, sr), d = b.getChannelData(0), amp = [1, 0.6, 0.82, 0.55, 0.92, 0.6, 0.76, 0.5, 0.96, 0.62, 0.7, 0.55];
    for (let k = 0; k < n * 12; k++) {
      const t0 = Math.floor(((k + (k % 2 ? 0.08 : 0)) / 12) * cyc * sr), a = amp[k % 12] * rand(0.85, 1.1), f = rand(82, 96), tau = 0.011 * sr, m = Math.floor(0.05 * sr);
      for (let i = 0; i < m; i++) { const j = (t0 + i) % len, e = Math.exp(-i / tau); d[j] += a * e * (Math.sin((6.2832 * f * i) / sr) * 0.9 + (Math.random() * 2 - 1) * 0.35 * Math.exp(-i / (tau * 0.3))); }
    }
    return b;
  }
  // Track links meeting the sprocket: one click per link at 1 m/s, each a short metallic ring.
  linkLoop() {
    const c = this.ctx, sr = c.sampleRate, n = 12, len = Math.floor((sr * n) / 6.06), b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (let k = 0; k < n; k++) { const t0 = Math.floor((k / n) * len + rand(-0.004, 0.004) * sr), a = rand(0.6, 1), f1 = rand(1500, 2100), f2 = rand(2800, 3600), m = Math.floor(0.03 * sr); for (let i = 0; i < m; i++) { const j = (t0 + i + len) % len, e = Math.exp(-i / (0.006 * sr)); d[j] += a * e * (Math.sin((6.2832 * f1 * i) / sr) * 0.5 + Math.sin((6.2832 * f2 * i) / sr) * 0.3 + (Math.random() * 2 - 1) * 0.5); } }
    return b;
  }
  buildEngine() {
    const c = this.ctx, g = (this.engGain = c.createGain()); g.gain.value = 0;
    const lp = (this.engLP = c.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.9;
    const src = (this.engSrc = c.createBufferSource()); src.buffer = this.pulseLoop(); src.loop = true; src.start();
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 110; body.Q.value = 1.1; body.gain.value = 9;
    src.connect(body); body.connect(lp); lp.connect(this.shaper(1.8)).connect(g); g.connect(this.master);
    // exhaust rumble and broadband roar from noise
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true; n.start();
    const rb = c.createBiquadFilter(); rb.type = 'lowpass'; rb.frequency.value = 110; this.rumble = c.createGain(); this.rumble.gain.value = 0; n.connect(rb); rb.connect(this.rumble); this.rumble.connect(this.master);
    const ro = (this.roarF = c.createBiquadFilter()); ro.type = 'bandpass'; ro.frequency.value = 900; ro.Q.value = 0.5; this.roar = c.createGain(); this.roar.gain.value = 0; n.connect(ro); ro.connect(this.roar); this.roar.connect(this.master);
    // tracks: click train + squeal
    const tk = (this.trackSrc = c.createBufferSource()); tk.buffer = this.linkLoop(); tk.loop = true; tk.start();
    const tb = c.createBiquadFilter(); tb.type = 'highpass'; tb.frequency.value = 700; this.trackG = c.createGain(); this.trackG.gain.value = 0; tk.connect(tb); tb.connect(this.trackG); this.trackG.connect(this.master);
    const sq = c.createBiquadFilter(); sq.type = 'bandpass'; sq.frequency.value = 3100; sq.Q.value = 9; this.squeal = c.createGain(); this.squeal.gain.value = 0; n.connect(sq); sq.connect(this.squeal); this.squeal.connect(this.master);
    // turbo / turbine whine, gearbox whine, turret traverse
    this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 1800; this.whineG = c.createGain(); this.whineG.gain.value = 0; this.whine.connect(this.whineG); this.whineG.connect(this.master); this.whine.start();
    this.gear = c.createOscillator(); this.gear.type = 'triangle'; this.gear.frequency.value = 300; this.gearG = c.createGain(); this.gearG.gain.value = 0; this.gear.connect(this.gearG); this.gearG.connect(this.master); this.gear.start();
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 170; const hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 900; hf.Q.value = 2; this.humG = c.createGain(); this.humG.gain.value = 0; this.hum.connect(hf); hf.connect(this.humG); this.humG.connect(this.master); this.hum.start();
    this.rpm = 0.2;
  }
  // per-frame: follow the player's tank (or silence when t is null)
  engine(t, dt) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, tc = 0.08;
    if (!t || !t.alive) { for (const g of [this.engGain, this.rumble, this.roar, this.trackG, this.squeal, this.whineG, this.gearG, this.humG]) g.gain.setTargetAtTime(0, now, 0.2); return; }
    const maxF = t.def.vmax / 3.6, sp = Math.abs(t.speed) / maxF, load = clamp(Math.abs(t.ctl.throttle) * (1 - sp * 0.5) + Math.abs(t.yawRate) * 0.8, 0, 1), on = t.engineK() > 0 ? 1 : 0, turb = !!t.def.turbine;
    // revs climb through each gear and drop on the shift; they lag the throttle like a heavy flywheel
    const target = 0.16 + ((sp * 3.4) % 1) * 0.3 + sp * 0.3 + load * 0.28; this.rpm += (target - this.rpm) * Math.min(1, dt * (target > this.rpm ? 2.2 : 1.3)); const rpm = this.rpm;
    this.engSrc.playbackRate.setTargetAtTime(0.85 + rpm * 2.3, now, tc);
    this.engLP.frequency.setTargetAtTime(260 + rpm * 900 + load * 700, now, tc);
    this.engGain.gain.setTargetAtTime(on * (turb ? 0.05 : 0.3 + load * 0.16), now, tc);
    this.rumble.gain.setTargetAtTime(on * (0.3 + load * 0.35), now, tc);
    this.roarF.frequency.setTargetAtTime(turb ? 1500 + rpm * 1800 : 600 + rpm * 900, now, tc); this.roar.gain.setTargetAtTime(on * (turb ? 0.05 + rpm * 0.09 : load * 0.035), now, tc);
    this.whine.frequency.setTargetAtTime(turb ? 2600 + rpm * 4200 : 3200 + rpm * 4800 + load * 1500, now, 0.3); this.whineG.gain.setTargetAtTime(on * (turb ? 0.03 + rpm * 0.03 : load * rpm * 0.016), now, 0.15);
    this.gear.frequency.setTargetAtTime(180 + Math.abs(t.speed) * 52, now, tc); this.gearG.gain.setTargetAtTime(on * clamp(sp * 0.03, 0, 0.022), now, tc);
    const v = Math.abs(t.speed) + Math.abs(t.yawRate) * 2.2;
    this.trackSrc.playbackRate.setTargetAtTime(clamp(v, 0.3, 22), now, tc); this.trackG.gain.setTargetAtTime(clamp(v / 9, 0, 1) * 0.11, now, tc);
    this.squeal.gain.setTargetAtTime(clamp(Math.abs(t.yawRate) * (0.4 + sp) * 0.05, 0, 0.03), now, 0.12);
    this.hum.frequency.setTargetAtTime(150 + t.turretRate * 90, now, 0.05); this.humG.gain.setTargetAtTime(clamp(t.turretRate * 0.2, 0, 0.06), now, 0.05);
  }
  // distance model: returns { gain, lp cutoff, delay }
  at(p) {
    if (!p) return { g: 1, lp: 16000, dl: 0, pan: 0 };
    const dx = p.x - this.listener.x, dy = p.y - this.listener.y, dz = p.z - this.listener.z, d = Math.hypot(dx, dy, dz);
    return { g: 1 / (1 + (d / 45) ** 1.6), lp: clamp(15000 / (1 + d / 60), 500, 16000), dl: Math.min(d / 340, 1.2), pan: clamp((dx * this.listener.rx + dz * this.listener.rz) / (d + 8), -1, 1) };
  }
  out(a, wet = 0.4) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = a.lp;
    let node = lp; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = a.pan * 0.8; lp.connect(p); node = p; }
    node.connect(g); g.connect(this.master); if (wet) { const w = c.createGain(); w.gain.value = wet; node.connect(w); w.connect(this.verb); }
    g.gain.value = a.g; return lp;
  }
  burst(dst, t0, dur, f0, f1, gain, q = 0.7, type = 'lowpass') {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rand(0.8, 1.2);
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dst); s.start(t0, rand(0, 1.5)); s.stop(t0 + dur + 0.05);
  }
  tone(dst, t0, dur, f0, f1, gain, type = 'sine') {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dst); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  cannon(p, own) {
    if (!this.ready) return; const a = own ? { g: 1, lp: 16000, dl: 0, pan: 0 } : this.at(p), t0 = this.ctx.currentTime + a.dl, o = this.out(a, own ? 0.55 : 0.75);
    this.burst(o, t0, 0.035, 9000, 2500, own ? 1.6 : 1.2, 0.4, 'highpass');   // muzzle crack
    this.burst(o, t0, own ? 0.75 : 1.1, 2200, 55, own ? 1.3 : 1.05, 0.6);     // blast body
    this.tone(o, t0, 0.65, 130, 26, own ? 1.6 : 1.0);                         // pressure thump
    this.tone(o, t0, 0.22, 62, 40, own ? 0.9 : 0.4);
    if (own) { this.clang(o, t0 + 0.045, 0.3, true); this.burst(o, t0 + 0.06, 0.18, 700, 120, 0.7); }          // breech slams back, hull rocks
    // the report coming back off the towers: discrete slaps, each duller and later, then the wash
    for (const [dl, g, f] of [[0.19, 0.42, 1500], [0.41, 0.3, 1000], [0.74, 0.2, 700], [1.2, 0.12, 480]]) this.burst(o, t0 + dl * rand(0.9, 1.1), 0.5, f, 70, g * (own ? 1 : 0.8), 0.5);
    this.burst(o, t0 + 0.1, 2.4, 380, 60, 0.38, 0.4);
    if (own && this.engGain) { const n = this.ctx.currentTime; for (const g of [this.engGain, this.rumble, this.trackG]) { g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(g.gain.value * 0.25, n, 0.01); } }   // the blast swamps everything for a moment
  }
  // The gun being served after a shot, spread over the reload: breech opens, the case goes, the loader (or the machine)
  // brings the next round up and rams it, the breech closes. Ends just before reloaded() calls it ready.
  reloadStart(auto, dur) {
    if (!this.ready || !(dur > 1.5)) return; const t0 = this.ctx.currentTime, o = this.out({ g: 0.55, lp: 8000, dl: 0, pan: 0 }, 0.06);
    this.clang(o, t0 + 0.32, 0.22, true); this.burst(o, t0 + 0.32, 0.07, 2600, 500, 0.5);                                             // breech block drops
    this.burst(o, t0 + 0.62, 0.22, 5200, 2600, 0.16, 4, 'bandpass'); this.tone(o, t0 + 0.66, 0.3, 2300, 1900, 0.05, 'triangle');      // case clatters out
    if (auto) {
      const c = this.ctx, w = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(), a0 = t0 + 0.95, a1 = t0 + dur - 1.25; if (a1 > a0 + 0.3) { w.type = 'sawtooth'; w.frequency.setValueAtTime(140, a0); w.frequency.linearRampToValueAtTime(210, a0 + 0.3); w.frequency.setValueAtTime(210, a1 - 0.25); w.frequency.linearRampToValueAtTime(120, a1); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 1.5; g.gain.setValueAtTime(0.0001, a0); g.gain.linearRampToValueAtTime(0.11, a0 + 0.15); g.gain.setValueAtTime(0.11, a1 - 0.15); g.gain.linearRampToValueAtTime(0.0001, a1); w.connect(f); f.connect(g); g.connect(o); w.start(a0); w.stop(a1 + 0.05); }
      for (let k = 0; a0 + 0.5 + k * 0.42 < a1; k++) this.burst(o, a0 + 0.5 + k * 0.42, 0.03, 3200, 1400, 0.18);                      // carousel indexing
      this.burst(o, t0 + dur - 1.1, 0.5, 1400, 300, 0.3, 1.2, 'bandpass'); this.tone(o, t0 + dur - 0.62, 0.1, 150, 60, 0.5, 'square');    // rammer runs out and seats the round
    } else {
      this.burst(o, t0 + dur * 0.38, 0.45, 2400, 900, 0.14, 1.5, 'bandpass');                                                           // round slides from the rack
      this.burst(o, t0 + dur - 1.0, 0.3, 1800, 400, 0.3, 1.2, 'bandpass'); this.tone(o, t0 + dur - 0.72, 0.09, 170, 70, 0.5, 'square'); // rammed home
    }
    this.clang(o, t0 + dur - 0.3, 0.3, true); this.burst(o, t0 + dur - 0.3, 0.06, 3000, 600, 0.55);                                    // breech closes
  }
  impact(p, kind) {
    if (!this.ready) return; const a = this.at(p), t0 = this.ctx.currentTime + a.dl, o = this.out(a, 0.3);
    if (kind === 'he') { this.burst(o, t0, 0.7, 2600, 70, 1.0); this.tone(o, t0, 0.4, 80, 30, 0.8); }
    else if (kind === 'wall') { this.burst(o, t0, 0.3, 3500, 300, 0.7); this.burst(o, t0 + 0.05, 0.8, 5000, 1800, 0.12, 2, 'bandpass'); }
    else if (kind === 'dirt') { this.burst(o, t0, 0.3, 1600, 150, 0.6); }
    else this.clang(o, t0, 0.7);
  }
  clang(o, t0, gain, low = false) {
    for (const [f, d, g] of [[low ? 310 : 520, 0.5, 0.5], [low ? 740 : 1170, 0.35, 0.35], [1890, 0.25, 0.22], [2760, 0.2, 0.16], [4100, 0.12, 0.1]]) this.tone(o, t0, d, f * rand(0.96, 1.04), f * 0.985, g * gain, 'triangle');
    this.burst(o, t0, 0.06, 8000, 2000, gain * 0.9, 0.5);
  }
  // shell meeting armour, heard from outside (p) or from inside the player's own tank (own)
  armour(p, kind, own) {
    if (!this.ready) return; const a = own ? { g: 1, lp: 16000, dl: 0, pan: 0 } : this.at(p), t0 = this.ctx.currentTime + a.dl, o = this.out(a, 0.3);
    if (kind === 'ricochet') { this.clang(o, t0, 0.8); this.tone(o, t0 + 0.02, 0.5, 2400, 700, 0.25, 'sawtooth'); }
    else if (kind === 'pen') { this.clang(o, t0, 0.6, true); this.burst(o, t0 + 0.02, 0.5, 1400, 80, 0.9); this.tone(o, t0, 0.35, 120, 40, 0.8); }
    else if (kind === 'he') { this.burst(o, t0, 0.7, 2600, 70, 1.0); this.tone(o, t0, 0.4, 80, 30, 0.8); }
    else this.clang(o, t0, 0.9, own);
    if (own) { this.tone(o, t0, 0.9, 3100, 3000, 0.05); this.burst(o, t0, 0.25, 300, 60, 0.9); }
  }
  explosion(p, big = 1) {
    if (!this.ready) return; const a = this.at(p), t0 = this.ctx.currentTime + a.dl, o = this.out(a, 0.8);
    this.burst(o, t0, 0.12, 5000, 600, 1.2); this.burst(o, t0, 1.8 * big, 1500, 40, 1.3, 0.5); this.tone(o, t0, 1.1 * big, 70, 22, 1.4); this.burst(o, t0 + 0.3, 2.6, 300, 50, 0.5, 0.4);
  }
  crunch(p, kind) {
    if (!this.ready) return; const a = this.at(p), t0 = this.ctx.currentTime, o = this.out(a, 0.1);
    if (kind === 'tree') { this.burst(o, t0, 0.35, 2200, 300, 0.4, 1.5, 'bandpass'); this.tone(o, t0, 0.12, 300, 90, 0.3, 'square'); }
    else if (kind === 'car' || kind === 'bus') { this.burst(o, t0, 0.4, 3000, 200, 0.6); this.clang(o, t0, 0.25, true); this.burst(o, t0 + 0.08, 0.5, 7000, 3500, 0.12, 3, 'bandpass'); }
    else { this.burst(o, t0, 0.25, 900, 120, 0.5); this.clang(o, t0, 0.12, true); }
  }
  reloaded(auto) {
    if (!this.ready) return; const t0 = this.ctx.currentTime, o = this.out({ g: 0.6, lp: 9000, dl: 0, pan: 0 }, 0.05);
    if (auto) { this.tone(o, t0, 0.22, 240, 420, 0.1, 'sawtooth'); this.burst(o, t0 + 0.22, 0.05, 3000, 900, 0.5); this.tone(o, t0 + 0.22, 0.08, 180, 90, 0.4, 'square'); }
    else { this.burst(o, t0, 0.05, 2500, 700, 0.5); this.tone(o, t0 + 0.09, 0.09, 150, 70, 0.45, 'square'); this.burst(o, t0 + 0.09, 0.07, 4000, 1200, 0.4); }
  }
  ui(kind) {
    if (!this.ready) return; const t0 = this.ctx.currentTime, o = this.out({ g: 0.5, lp: 12000, dl: 0, pan: 0 }, 0);
    if (kind === 'click') this.tone(o, t0, 0.05, 900, 600, 0.25, 'square');
    else if (kind === 'select') { this.tone(o, t0, 0.07, 520, 520, 0.22, 'triangle'); this.tone(o, t0 + 0.06, 0.1, 780, 780, 0.22, 'triangle'); }
    else if (kind === 'warn') { this.tone(o, t0, 0.12, 880, 880, 0.3, 'square'); this.tone(o, t0 + 0.18, 0.12, 880, 880, 0.3, 'square'); }
    else if (kind === 'cap') this.tone(o, t0, 0.08, 660, 660, 0.14, 'sine');
    else if (kind === 'kill') { this.tone(o, t0, 0.1, 440, 440, 0.25, 'triangle'); this.tone(o, t0 + 0.09, 0.1, 660, 660, 0.25, 'triangle'); this.tone(o, t0 + 0.18, 0.22, 880, 880, 0.25, 'triangle'); }
    else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => this.tone(o, t0 + i * 0.16, 0.5, f, f, 0.25, 'triangle'));
    else if (kind === 'lose') [392, 349, 311, 262].forEach((f, i) => this.tone(o, t0 + i * 0.22, 0.6, f, f, 0.25, 'triangle'));
    else if (kind === 'zoom') this.tone(o, t0, 0.06, 1400, 1700, 0.08, 'sine');
  }
}
