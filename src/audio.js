// All sound is synthesised with WebAudio: diesel/turbine engine loop, track clatter, cannon reports with a
// city-canyon echo, armour clangs, explosions and UI ticks. Nothing is loaded from disk.
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

  buildEngine() {
    const c = this.ctx, g = (this.engGain = c.createGain()); g.gain.value = 0;
    const lp = (this.engLP = c.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 1.2;
    this.eng = [0, 1, 2].map((i) => { const o = c.createOscillator(); o.type = i === 2 ? 'square' : 'sawtooth'; o.frequency.value = 40; const og = c.createGain(); og.gain.value = [0.5, 0.35, 0.16][i]; o.connect(og); og.connect(lp); o.start(); return o; });
    const lfo = (this.engLfo = c.createOscillator()); lfo.frequency.value = 11; const lg = c.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    lp.connect(this.shaper(2.2)).connect(g); g.connect(this.master);
    // rumble + track clatter from noise
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true; n.start();
    const rb = c.createBiquadFilter(); rb.type = 'lowpass'; rb.frequency.value = 120; this.rumble = c.createGain(); this.rumble.gain.value = 0; n.connect(rb); rb.connect(this.rumble); this.rumble.connect(this.master);
    const tb = c.createBiquadFilter(); tb.type = 'bandpass'; tb.frequency.value = 1100; tb.Q.value = 0.8; this.trackG = c.createGain(); this.trackG.gain.value = 0; n.connect(tb); tb.connect(this.trackG); this.trackG.connect(this.master);
    const tl = (this.trackLfo = c.createOscillator()); tl.type = 'square'; tl.frequency.value = 8; const tg = (this.trackLfoG = c.createGain()); tg.gain.value = 0; tl.connect(tg); tg.connect(this.trackG.gain); tl.start();
    // turbine whine (Abrams) and turret traverse hum
    this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 1800; this.whineG = c.createGain(); this.whineG.gain.value = 0; this.whine.connect(this.whineG); this.whineG.connect(this.master); this.whine.start();
    this.hum = c.createOscillator(); this.hum.type = 'triangle'; this.hum.frequency.value = 170; this.humG = c.createGain(); this.humG.gain.value = 0; this.hum.connect(this.humG); this.humG.connect(this.master); this.hum.start();
  }
  // per-frame: follow the player's tank (or silence when t is null)
  engine(t, dt) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, tc = 0.08;
    if (!t || !t.alive) { for (const g of [this.engGain, this.rumble, this.trackG, this.whineG, this.humG, this.trackLfoG]) g.gain.setTargetAtTime(0, now, 0.2); return; }
    const maxF = t.def.vmax / 3.6, sp = Math.abs(t.speed) / maxF, load = clamp(Math.abs(t.ctl.throttle) * (1 - sp * 0.5) + Math.abs(t.yawRate) * 0.8, 0, 1), on = t.engineK() > 0 ? 1 : 0;
    const rpm = 0.22 + ((sp * 3.2) % 1) * 0.22 + sp * 0.35 + load * 0.25, f = 34 + rpm * 78;
    this.eng[0].frequency.setTargetAtTime(f, now, tc); this.eng[1].frequency.setTargetAtTime(f * 1.503, now, tc); this.eng[2].frequency.setTargetAtTime(f * 0.5, now, tc);
    this.engLfo.frequency.setTargetAtTime(7 + rpm * 16, now, tc);
    this.engLP.frequency.setTargetAtTime(210 + rpm * 520 + load * 380, now, tc);
    this.engGain.gain.setTargetAtTime(on * (t.def.turbine ? 0.1 : 0.2 + load * 0.1), now, tc);
    this.rumble.gain.setTargetAtTime(on * (0.35 + load * 0.3), now, tc);
    this.whine.frequency.setTargetAtTime(1500 + rpm * 2300, now, 0.25); this.whineG.gain.setTargetAtTime(on * (t.def.turbine ? 0.035 + load * 0.02 : 0.004), now, tc);
    const tv = clamp(Math.abs(t.speed) / 12 + Math.abs(t.yawRate) * 0.5, 0, 1);
    this.trackG.gain.setTargetAtTime(tv * 0.07, now, tc); this.trackLfoG.gain.setTargetAtTime(tv * 0.05, now, tc); this.trackLfo.frequency.setTargetAtTime(5 + Math.abs(t.speed) * 2.4, now, tc);
    this.humG.gain.setTargetAtTime(clamp(t.turretRate * 0.12, 0, 0.045), now, 0.05);
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
    if (!this.ready) return; const a = own ? { g: 1, lp: 16000, dl: 0, pan: 0 } : this.at(p), t0 = this.ctx.currentTime + a.dl, o = this.out(a, own ? 0.6 : 0.7);
    this.burst(o, t0, 0.09, 6000, 900, own ? 1.3 : 1.1, 0.5);           // crack
    this.burst(o, t0, own ? 0.9 : 1.2, 1800, 60, own ? 1.2 : 1.0, 0.6); // body
    this.tone(o, t0, 0.5, 95, 28, own ? 1.3 : 0.9);                      // chest thump
    this.burst(o, t0 + 0.12, 1.6, 420, 70, 0.4, 0.4);                    // rolling tail
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
