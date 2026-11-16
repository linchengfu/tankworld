// Every texture in the game is painted on a canvas at boot. No image files.
import * as THREE from 'three';
import { makeRng } from '../core/util.js';

export const CJK = "'Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Source Han Sans SC','WenQuanYi Micro Hei',sans-serif";

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? 8;
  return t;
}

// Tileable value noise: lattice of `period` cells wrapping around.
function makeNoise(seed) {
  const r = makeRng(seed), P = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) P[i] = r();
  const h = (x, y) => P[((x & 63) + (y & 63) * 64) & 4095];
  const n2 = (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const m = (a) => ((a % period) + period) % period;
    const a = h(m(xi), m(yi)), b = h(m(xi + 1), m(yi)), c = h(m(xi), m(yi + 1)), d = h(m(xi + 1), m(yi + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // fbm over the unit square; tiles exactly when x,y wrap at 1
  return (x, y, base = 4, oct = 4) => { let s = 0, amp = 0.5, f = base, tot = 0; for (let o = 0; o < oct; o++) { s += n2(x * f + o * 7.3, y * f + o * 3.1, f) * amp; tot += amp; amp *= 0.5; f *= 2; } return s / tot; };
}
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

function pixels(size, fn) {
  const [c, g] = canvas(size, size), img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const k = fn(x / size, y / size, x, y), i = (y * size + x) * 4; d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = k.length > 3 ? k[3] : 255; }
  g.putImageData(img, 0, 0);
  return [c, g];
}

// ---------------------------------------------------------------- tank textures
const camoCache = new Map();
export function camoTexture(camo) {
  const key = camo.type + camo.colors.join();
  if (camoCache.has(key)) return camoCache.get(key);
  const cols = camo.colors.map(hex), n1 = makeNoise(11), n2 = makeNoise(29), n3 = makeNoise(53), size = 512, r = makeRng(7);
  let seeds = null;
  if (camo.type === 'splinter') seeds = Array.from({ length: 22 }, (_, i) => [r(), r(), i % 4]);
  const [c] = pixels(size, (u, v, x, y) => {
    let k;
    if (camo.type === 'digital') {
      const q = 1 / 48, cu = Math.floor(u / q) * q, cv = Math.floor(v / q) * q, jit = (((Math.floor(u / q) * 73856093) ^ (Math.floor(v / q) * 19349663)) >>> 0) % 100 / 100;
      const a = n1(cu, cv, 3, 3) + (jit - 0.5) * 0.16, b = n2(cu, cv, 4, 2) + (jit - 0.5) * 0.1;
      k = a > 0.6 ? cols[1] : b > 0.6 ? cols[2] : a < 0.36 ? cols[3] : cols[0];
    } else if (camo.type === 'nato3' || camo.type === 'blotch') {
      const a = n1(u, v, 3, 3), b = n2(u, v, 3, 3);
      k = b > 0.63 ? cols[2] : a > 0.55 ? cols[1] : cols[0];
      if (camo.type === 'blotch' && a < 0.3) k = cols[3];
    } else if (camo.type === 'splinter') {
      let best = 9, bi = 0;
      for (const s of seeds) { let dx = Math.abs(u - s[0]), dy = Math.abs(v - s[1]); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy); const d = dx + dy * 1.3; if (d < best) { best = d; bi = s[2]; } }
      k = cols[bi];
    } else {
      const a = n1(u, v, 3, 4);
      k = a > 0.6 ? cols[2] : a < 0.38 ? cols[1] : cols[0];
    }
    // weathering: dust, grime, chipped speckles
    const dust = n3(u, v, 8, 4), fine = n2(u, v, 32, 2), m = 0.82 + dust * 0.3 + (fine - 0.5) * 0.12, chip = fine > 0.86 ? 0.75 : 1;
    return [k[0] * m * chip + dust * 14, k[1] * m * chip + dust * 12, k[2] * m * chip + dust * 8];
  });
  const t = tex(c); camoCache.set(key, t); return t;
}

let _track;
export function trackTexture() {
  if (_track) return _track;
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#1c1b1a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3d3a36'; g.fillRect(2, 6, 60, 22); g.fillRect(2, 38, 60, 22);
  g.fillStyle = '#55504a'; g.fillRect(6, 10, 22, 14); g.fillRect(36, 10, 22, 14); g.fillRect(6, 42, 22, 14); g.fillRect(36, 42, 22, 14);
  g.fillStyle = '#0e0e0e'; g.fillRect(28, 0, 8, 64);
  g.fillStyle = '#6a645c'; g.fillRect(29, 12, 6, 10); g.fillRect(29, 44, 6, 10);
  return (_track = tex(c, { aniso: 4 }));
}

// ---------------------------------------------------------------- ground
export function asphaltTexture() {
  const n1 = makeNoise(3), n2 = makeNoise(5), n3 = makeNoise(9);
  const [c, g] = pixels(512, (u, v) => {
    const a = n1(u, v, 6, 5), b = n2(u, v, 64, 2), p = n3(u, v, 3, 2);
    let k = 46 + a * 22 + (b - 0.5) * 22 + (p > 0.6 ? -7 : 0);
    return [k * 1.0, k * 1.0, k * 1.04];
  });
  const r = makeRng(77);
  g.strokeStyle = 'rgba(12,12,13,.55)'; g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) { let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += r.range(-26, 26); y += r.range(-26, 26); g.lineTo(x, y); } g.stroke(); }
  return tex(c);
}
export function pavingTexture(tone = 0) {
  const n1 = makeNoise(21 + tone), r = makeRng(5 + tone), [c, g] = canvas(512, 512), base = tone === 1 ? [168, 160, 148] : tone === 2 ? [128, 108, 92] : [132, 132, 130], T = tone === 1 ? 4 : 8, s = 512 / T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const k = r.range(0.86, 1.06); g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    const off = tone === 2 && y % 2 ? s / 2 : 0;
    g.fillRect(x * s + off, y * s, s - 2, s - 2); if (off) g.fillRect(x * s + off - 512, y * s, s - 2, s - 2);
  }
  const img = g.getImageData(0, 0, 512, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % 512, y = (i / 4 / 512) | 0, m = 0.8 + n1(x / 512, y / 512, 8, 4) * 0.4; d[i] *= m; d[i + 1] *= m; d[i + 2] *= m; }
  g.putImageData(img, 0, 0);
  return tex(c);
}
export function grassTexture() {
  const n1 = makeNoise(31), n2 = makeNoise(37);
  const [c] = pixels(256, (u, v) => { const a = n1(u, v, 4, 4), b = n2(u, v, 48, 2); return [40 + a * 30 + b * 14, 56 + a * 34 + b * 18, 30 + a * 14 + b * 8]; });
  return tex(c);
}

// ---------------------------------------------------------------- building facades
// Each style returns { map, rm (roughness in G, metalness in B), em (emissive: lit rooms) } covering 12 m x 12 m.
const FACADES = [
  { name: 'blueGlass', glass: [70, 112, 150], mull: [150, 160, 168], band: [48, 70, 92], bays: 8, floors: 3, bandH: 0.2 },
  { name: 'tealGlass', glass: [62, 122, 128], mull: [176, 182, 180], band: [36, 66, 70], bays: 6, floors: 3, bandH: 0.3 },
  { name: 'bronze', glass: [58, 48, 40], mull: [150, 122, 70], band: [34, 28, 24], bays: 8, floors: 3, bandH: 0.14 },
  { name: 'stone', glass: [44, 58, 72], mull: [186, 172, 150], band: [186, 172, 150], bays: 4, floors: 3, bandH: 0.42, punch: 0.36 },
  { name: 'fins', glass: [40, 56, 72], mull: [214, 214, 208], band: [56, 66, 76], bays: 12, floors: 3, bandH: 0.1, fin: 0.42 },
  { name: 'silver', glass: [86, 108, 126], mull: [170, 176, 182], band: [150, 156, 162], bays: 4, floors: 4, bandH: 0.46 },
  { name: 'skyGlass', glass: [96, 138, 168], mull: [120, 140, 156], band: [70, 100, 124], bays: 10, floors: 4, bandH: 0.1 },
  { name: 'gold', glass: [120, 92, 44], mull: [88, 66, 34], band: [70, 52, 26], bays: 8, floors: 3, bandH: 0.16 },
];
export const FACADE_COUNT = FACADES.length;
export function facadeTextures(i) {
  const f = FACADES[i], S = 512, r = makeRng(100 + i), [c, g] = canvas(S, S), [c2, g2] = canvas(S, S), [c3, g3] = canvas(S, S);
  const bw = S / f.bays, fh = S / f.floors, rgb = (k, m = 1) => `rgb(${k[0] * m | 0},${k[1] * m | 0},${k[2] * m | 0})`;
  g.fillStyle = rgb(f.mull); g.fillRect(0, 0, S, S);
  g2.fillStyle = 'rgb(0,170,20)'; g2.fillRect(0, 0, S, S); // frame: rough, slightly metallic
  g3.fillStyle = '#000'; g3.fillRect(0, 0, S, S);
  for (let fl = 0; fl < f.floors; fl++) for (let b = 0; b < f.bays; b++) {
    const x = b * bw, y = fl * fh, mw = f.fin ? bw * f.fin : f.punch ? bw * f.punch : Math.max(2, bw * 0.06), bh = fh * f.bandH;
    // spandrel band
    g.fillStyle = rgb(f.band, r.range(0.92, 1.06)); g.fillRect(x + (f.punch ? 0 : mw / 2), y, bw - (f.punch ? 0 : mw), bh);
    // glass pane with a vertical sky gradient and per-pane variation
    const m = r.range(0.8, 1.15), gx = x + mw / 2, gw = bw - mw, gy = y + bh, gh = fh - bh - (f.punch ? fh * 0.1 : 1.5);
    const gr = g.createLinearGradient(0, gy, 0, gy + gh); gr.addColorStop(0, rgb(f.glass, m * 1.18)); gr.addColorStop(1, rgb(f.glass, m * 0.8));
    g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
    g2.fillStyle = `rgb(0,${r.int(22, 46)},${f.name === 'stone' ? 150 : 235})`; g2.fillRect(gx, gy, gw, gh); // glass: smooth + metallic → mirrors the sky
    if (r.chance(0.07)) { g3.fillStyle = r.chance(0.7) ? 'rgb(255,214,150)' : 'rgb(210,230,255)'; g3.globalAlpha = r.range(0.35, 0.9); g3.fillRect(gx + 1, gy + 1, gw - 2, gh - 2); g3.globalAlpha = 1; }
    if (r.chance(0.12)) { g.fillStyle = 'rgba(230,230,220,.16)'; g.fillRect(gx, gy, gw, gh * r.range(0.2, 0.7)); } // blinds
  }
  return { map: tex(c), rm: tex(c2, { linear: true }), em: tex(c3) };
}

const SHOPS = [
  ['浦江便利', '#1f8a5b', '#fff'], ['瑞申咖啡', '#27418f', '#fff'], ['申城银行', '#b3202a', '#ffe9b0'], ['老弄堂面馆', '#7a3b12', '#ffd98a'], ['东方药房', '#0f6e7a', '#fff'],
  ['陆家嘴书局', '#3a3a3a', '#f2e6c8'], ['沪上生煎', '#c2571a', '#fff'], ['地铁 2号线', '#74b530', '#fff'], ['江畔花店', '#a13c6b', '#fff'], ['环球旅行', '#1c5fa8', '#fff'],
  ['金茂茶庄', '#40532a', '#f0e0a8'], ['外滩钟表', '#222', '#d9b56a'],
];
export function shopfrontTexture(seed) {
  const W = 1024, H = 256, [c, g] = canvas(W, H), r = makeRng(900 + seed);
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, W, H);
  const bays = 4, bw = W / bays;
  for (let b = 0; b < bays; b++) {
    const x = b * bw, s = SHOPS[(seed * 4 + b) % SHOPS.length];
    g.fillStyle = '#25272b'; g.fillRect(x, 0, bw, H);
    const gr = g.createLinearGradient(0, 70, 0, H); gr.addColorStop(0, '#31444f'); gr.addColorStop(1, '#151b20');
    g.fillStyle = gr; g.fillRect(x + 10, 74, bw - 20, H - 96);
    g.fillStyle = 'rgba(255,220,160,.12)'; g.fillRect(x + 10, 74, bw - 20, 60);
    g.strokeStyle = '#8a8e92'; g.lineWidth = 3; g.strokeRect(x + 10, 74, bw - 20, H - 96);
    g.beginPath(); g.moveTo(x + bw / 2, 74); g.lineTo(x + bw / 2, H - 22); g.stroke();
    g.fillStyle = '#17181a'; g.fillRect(x, H - 22, bw, 22);
    if (r.chance(0.3)) { g.fillStyle = '#555a60'; for (let k = 0; k < 9; k++) g.fillRect(x + 12, 78 + k * 17, bw - 24, 12); } // roller shutter
    g.fillStyle = s[1]; g.fillRect(x + 6, 10, bw - 12, 56);
    g.fillStyle = s[2]; g.font = `900 38px ${CJK}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s[0], x + bw / 2, 39);
  }
  return tex(c);
}

// Flat sign: text on a coloured plate. Returns a texture (not repeating).
export function signTexture(lines, o = {}) {
  const W = o.w || 512, H = o.h || 128, [c, g] = canvas(W, H);
  g.fillStyle = o.bg || '#1f4fa3'; g.fillRect(0, 0, W, H);
  if (o.border !== false) { g.strokeStyle = o.fg || '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12); }
  g.fillStyle = o.fg || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((ln, i) => { const big = i === 0; g.font = `${big ? 900 : 600} ${big ? (o.size || H * 0.5) : H * 0.2}px ${big ? CJK : "'Saira Condensed',Arial,sans-serif"}`; g.fillText(ln, W / 2, arr.length === 1 ? H / 2 : big ? H * 0.42 : H * 0.8); });
  return tex(c, { clamp: true });
}

export function billboardTexture(i) {
  const W = 512, H = 256, [c, g] = canvas(W, H);
  const ads = [
    ['上海欢迎您', 'WELCOME TO SHANGHAI', ['#0b2a6b', '#1e7fd6'], '#fff'], ['浦东开发开放', 'PUDONG · SINCE 1990', ['#7a0e16', '#d6402a'], '#ffe7a8'],
    ['陆家嘴金融城', 'LUJIAZUI FINANCE CITY', ['#0d3b33', '#1fa37f'], '#eafff6'], ['申城夜跑节', '11 · 28 滨江大道', ['#2a1250', '#8a3fd1'], '#fff'],
    ['东方明珠 观光', 'ORIENTAL PEARL TOWER', ['#5a0f3d', '#e0559a'], '#fff'], ['沪指  3,412.06  ▲', '深成  10,877.4  ▲   恒生  21,040  ▼', ['#04120a', '#0b2a16'], '#49f08a'],
  ][i % 6];
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, ads[2][0]); gr.addColorStop(1, ads[2][1]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.07)'; for (let k = 0; k < 6; k++) g.fillRect(k * 96 - 20, 0, 40, H);
  g.fillStyle = ads[3]; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 78px ${CJK}`; g.fillText(ads[0], W / 2, 108, W - 30);
  g.font = "600 30px 'Saira Condensed',Arial,sans-serif"; g.fillText(ads[1], W / 2, 190, W - 30);
  return tex(c, { clamp: true });
}

// ---------------------------------------------------------------- particles: 2x2 atlas (smoke, fire, glow, debris)
export function particleAtlas() {
  const S = 128, [c, g] = canvas(S * 2, S * 2), n1 = makeNoise(61), n2 = makeNoise(67);
  const img = g.createImageData(S * 2, S * 2), d = img.data;
  for (let y = 0; y < S * 2; y++) for (let x = 0; x < S * 2; x++) {
    const cx = x >= S ? 1 : 0, cy = y >= S ? 1 : 0, u = (x % S) / S - 0.5, v = (y % S) / S - 0.5, rr = Math.sqrt(u * u + v * v) * 2, i = (y * S * 2 + x) * 4;
    let a = 0, k = 255;
    if (!cx && !cy) { const n = n1(u + 0.5, v + 0.5, 5, 4); a = Math.max(0, 1 - rr) ** 1.2 * (0.35 + n * 1.25); k = 190 + n * 65; } // smoke puff
    else if (cx && !cy) { const n = n2(u + 0.5, v + 0.5, 6, 3); a = Math.max(0, 1 - rr * (0.8 + n * 0.6)) ** 1.6 * 1.3; } // fire lick
    else if (!cx && cy) { a = Math.max(0, 1 - rr) ** 2.6; } // soft glow
    else { const n = n1(u + 0.5, v + 0.5, 4, 2); a = rr < 0.55 + n * 0.5 ? 1 : 0; k = 120 + n * 120; } // debris chip
    d[i] = d[i + 1] = d[i + 2] = k; d[i + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, { clamp: true, aniso: 1 }); return t;
}

export function radialTexture(stops) {
  const [c, g] = canvas(128, 128), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, { clamp: true });
}
