// In-battle overlay. Plain DOM for text and bars, three small canvases (status x-ray, hit camera, minimap).
import * as THREE from 'three';
import { fmtTime, clamp } from '../core/util.js';
import { CREW_LABEL, SHELL_SHORT, SHELL_LABEL } from '../data/tanks.js';
import { drawXray } from './xray.js';
import { CJK } from '../gfx/textures.js';

export const ZONE = { ufp: '车体首上', lfp: '车体首下', hside: '车体侧面', hrear: '车体后部', htop: '车体顶部', hbot: '车底', tfront: '炮塔正面', mant: '炮盾', tside: '炮塔侧面', trear: '炮塔后部', ttop: '炮塔顶部', trackL: '左履带', trackR: '右履带', barrel: '炮管', splash: '近失弹' };
export const REASON = { ammo: '弹药架殉爆', crew: '乘员失去战斗力', fire: '车辆烧毁' };
const _v = new THREE.Vector3();
const $ = (id) => document.getElementById(id);

const HTML = `
<div id="hud">
  <div id="scope"><span id="zoomlbl"></span></div>
  <div id="markers"></div>
  <div id="reticle"><i></i><i></i><i></i><i></i></div>
  <div id="range"></div>
  <div id="gunmark"><svg viewBox="0 0 60 60"><circle id="reloadarc" cx="30" cy="30" r="27" stroke-dasharray="170" stroke-dashoffset="0"/></svg><div class="ring"></div><div class="dot"></div><div class="info" id="peninfo"></div></div>
  <div id="dmgdir"><i></i></div>
  <div id="tally"><div class="t-side ally" id="pips-a"></div><div class="t-mid plate"><span class="t-score a" id="sc-a">0</span><span id="clock">8:00</span><span class="t-score e" id="sc-e">0</span></div><div class="t-side enemy" id="pips-e"></div></div>
  <div id="cap"><span class="lbl" id="caplbl"></span><div class="bar"><i id="capbar"></i></div></div>
  <div id="banner"></div>
  <div id="hitmsg"></div>
  <div id="hitcam" class="plate"><h4><b id="hc-name"></b><span id="hc-res"></span></h4><canvas id="hc-cv" width="460" height="340"></canvas><p id="hc-num"></p><ul id="hc-list"></ul></div>
  <div id="feed"></div>
  <div id="status" class="plate"><h4><b id="st-name"></b><span id="st-ext"></span></h4><canvas id="xray" width="380" height="300"></canvas><div id="crew"></div><div id="tags"></div></div>
  <div id="repair"><span id="repairlbl">战地维修中</span><div class="bar"><i id="repairbar"></i></div></div>
  <div id="hint"></div>
  <div id="ammo"><div id="shells" style="display:flex;gap:6px"></div><div id="drive" class="plate"><span id="speed" class="num">0</span><small>km/h</small><span id="reloadtxt"></span></div></div>
  <div id="mapbox" class="plate"><canvas id="minimap" width="400" height="400"></canvas></div>
  <div id="dead"><b>座车被击毁</b><span id="deadwhy"></span></div>
  <div id="touch"><div id="stick"><i></i></div><button class="tbtn" id="tb-fire">开火</button><button class="tbtn" id="tb-zoom">瞄准</button><button class="tbtn" id="tb-shell">弹种</button><button class="tbtn" id="tb-fix">维修</button><button class="tbtn" id="tb-pause">暂停</button></div>
</div>`;

export class Hud {
  constructor(root) {
    root.insertAdjacentHTML('beforeend', HTML);
    this.el = $('hud'); this.markers = []; this.t = { xray: 0, map: 0, pen: 0 }; this.hcT = 0; this.bannerT = 0; this.hintT = 0; this.dirT = 0; this.capOn = false;
    this.xr = $('xray').getContext('2d'); this.hc = $('hc-cv').getContext('2d'); this.mm = $('minimap').getContext('2d'); this.mapLayer = null;
    this.gun = $('gunmark'); this.ring = this.gun.querySelector('.ring'); this.arc = $('reloadarc'); this.last = {};
  }
  show(on) { this.el.classList.toggle('on', on); }
  set(id, key, val) { const k = id + key; if (this.last[k] !== val) { this.last[k] = val; const e = $(id); if (key === 'text') e.textContent = val; else if (key === 'html') e.innerHTML = val; else if (key === 'cls') e.className = val; else e.style.setProperty(key, val); } }

  setup(G) {
    const p = G.player; this.last = {};
    $('pips-a').innerHTML = G.tanks.filter((t) => t.team === 0).map((t) => `<i class="t-pip" data-id="${t.id}"></i>`).join('');
    $('pips-e').innerHTML = G.tanks.filter((t) => t.team === 1).map((t) => `<i class="t-pip" data-id="${t.id}"></i>`).join('');
    const M = $('markers'); M.innerHTML = ''; this.markers = [];
    for (const t of G.tanks) { if (t === p) continue; const e = document.createElement('div'); e.className = 'mk ' + (t.team === 0 ? 'ally' : 'enemy'); e.innerHTML = `<div class="inner"><b>${t.name}</b><span></span></div>`; M.appendChild(e); this.markers.push({ t, e, d: e.querySelector('span'), dist: -1 }); }
    $('shells').innerHTML = p.def.shells.map((s, i) => `<button class="shell" data-i="${i}" id="sh${i}"><span class="k">${i + 1}</span><span class="ty">${SHELL_SHORT[s.type]}</span><span class="nm">${s.name}</span><span class="ct num" id="shc${i}"></span></button>`).join('');
    $('st-name').textContent = p.def.name;
    $('crew').innerHTML = p.mods.filter((m) => m.d.kind === 'crew').map((m) => `<i id="cw-${m.d.id}">${CREW_LABEL[m.d.role]}</i>`).join('');
    $('feed').innerHTML = ''; $('hitcam').classList.remove('on'); $('dead').classList.remove('on'); $('banner').classList.remove('on'); $('cap').classList.remove('on');
    this.buildMap(G.world); this.hcT = 0;
  }

  buildMap(W) {
    const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d'), S = 400 / (2 * W.size), P = (v) => (v + W.size) * S;
    g.fillStyle = '#39413d'; g.fillRect(0, 0, 400, 400);
    for (const b of W.map.blocks) { g.fillStyle = b.type === 'park' ? '#3d5a40' : b.type === 'promenade' ? '#4a4638' : '#59615b'; g.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * S, (b.z1 - b.z0) * S); }
    g.fillStyle = '#3d5a40'; g.beginPath(); g.arc(P(-130), P(0), 26 * S, 0, 6.3); g.fill();
    g.fillStyle = '#1b2220'; for (const r of W.map.rects) g.fillRect(P(r[0]), P(r[2]), (r[1] - r[0]) * S, (r[3] - r[2]) * S);
    for (const cc of W.map.circles) { g.beginPath(); g.arc(P(cc[0]), P(cc[1]), Math.max(1.2, cc[2] * S), 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(90,140,170,.9)'; g.lineWidth = 5; g.strokeRect(0, 0, 0.1, 400); g.beginPath(); g.moveTo(1, 0); g.lineTo(1, 400); g.moveTo(0, 1); g.lineTo(400, 1); g.stroke();
    g.font = `600 15px ${CJK}`; g.textAlign = 'center'; g.fillStyle = 'rgba(233,229,214,.8)';
    for (const l of W.labels) g.fillText(l.name, P(l.x), P(l.z) + 5);
    this.mapLayer = c;
  }

  feed(html) { const f = $('feed'), d = document.createElement('div'); d.innerHTML = html; f.appendChild(d); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => d.remove(), 9000); }
  banner(text, sub = '', dur = 3) { $('banner').innerHTML = text + (sub ? `<small>${sub}</small>` : ''); $('banner').classList.add('on'); this.bannerT = dur; }
  hint(html, dur = 4) { $('hint').innerHTML = html; $('hint').classList.add('on'); this.hintT = dur; }
  dead(reason, by) { $('deadwhy').textContent = `${REASON[reason] || ''}${by ? ' · 击毁者 ' + by.name : ''} — 点击切换观察友军`; $('dead').classList.add('on'); }
  damageDir(angle) { const e = $('dmgdir').firstChild; e.style.transform = `rotate(${angle}rad)`; e.classList.add('on'); this.dirT = 0.25; }

  // the player's shell did something to an enemy
  hitResult(res) {
    const e = $('hitmsg'), z = ZONE[res.zone] || '';
    let head, cls = 'good', sub = '';
    const hurt = res.dmg.filter((d) => d.after < d.before).map((d) => d.label + (d.after <= 0 ? '✕' : '')).slice(0, 5).join(' · ');
    if (res.killed) { head = '击毁'; cls = 'kill'; sub = REASON[res.tank.deadReason] || ''; }
    else if (res.kind === 'pen') { head = '击穿'; sub = hurt || z; }
    else if (res.kind === 'nopen') { head = '未击穿'; cls = 'bad'; sub = `${z} 等效 ${Math.round(res.eff)}mm ＞ 穿深 ${Math.round(res.pen)}mm`; }
    else if (res.kind === 'ricochet') { head = '跳弹'; cls = 'bad'; sub = `${z} 入射角 ${Math.round(res.angle)}°`; }
    else if (res.kind === 'track') { head = '命中履带'; sub = hurt; } else if (res.kind === 'barrel') { head = '命中炮管'; sub = hurt; }
    else { head = '高爆命中'; cls = hurt ? 'good' : 'bad'; sub = hurt || '未造成损伤'; }
    e.className = ''; void e.offsetWidth; e.className = 'show ' + cls; e.innerHTML = `${head}<small>${sub}</small>`;
  }
  hitCam(res) {
    const t = res.tank; $('hc-name').textContent = t.def.name;
    const r = $('hc-res'); r.textContent = res.killed ? '击毁' : res.kind === 'pen' ? '击穿' : res.kind === 'ricochet' ? '跳弹' : res.kind === 'nopen' ? '未击穿' : '命中'; r.className = res.killed ? 'kill' : res.kind === 'pen' ? '' : 'bad';
    const hot = new Set(res.dmg.map((d) => d.id));
    drawXray(this.hc, t.def, t, 460, 340, { tight: true, rays: res.rays, hot, entry: res.lp ? { space: res.part, p: [res.lp.x, res.lp.y, res.lp.z], d: [res.ld.x, res.ld.y, res.ld.z], ok: res.kind === 'pen' } : null });
    $('hc-num').textContent = res.eff ? `${ZONE[res.zone] || ''} · 等效 ${Math.round(res.eff)}mm · 穿深 ${Math.round(res.pen)}mm · ${Math.round(res.range)}m` : `${ZONE[res.zone] || ''} · ${Math.round(res.range)}m`;
    $('hc-list').innerHTML = res.dmg.filter((d) => d.after < d.before).map((d) => `<li class="${d.after <= 0 ? 'd' : 'h'}">${d.label}${d.after <= 0 ? (d.kind === 'crew' ? ' 阵亡' : ' 损毁') : ' 受损'}</li>`).join('') + (res.killed ? `<li class="d">${REASON[t.deadReason]}</li>` : res.blowout ? '<li class="d">弹药殉爆 · 泄压板开启</li>' : '') + (res.fire && !res.killed ? '<li class="h">起火</li>' : '');
    $('hitcam').classList.add('on'); this.hcT = 5;
  }

  project(x, y, z, cam, W, H) { _v.set(x, y, z).project(cam); return _v.z < 1 && _v.z > -1 ? [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H] : null; }

  update(G, dt) {
    const p = G.view, me = G.player, cam = G.gfx.camera, W = this.el.clientWidth, H = this.el.clientHeight, T = this.t;
    // timers
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $('banner').classList.remove('on');
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) $('hint').classList.remove('on');
    if (this.hcT > 0 && (this.hcT -= dt) <= 0) $('hitcam').classList.remove('on');
    if (this.dirT > 0 && (this.dirT -= dt) <= 0) $('dmgdir').firstChild.classList.remove('on');
    // tally + clock + capture
    let a = 0, e = 0;
    for (const t of G.tanks) { if (t.alive) { if (t.team === 0) a++; else e++; } }
    this.set('sc-a', 'text', String(a)); this.set('sc-e', 'text', String(e)); this.set('clock', 'text', fmtTime(G.timeLeft));
    const dk = G.tanks.map((t) => (t.alive ? 1 : 0)).join('');
    if (dk !== this.last.dk) { this.last.dk = dk; for (const t of G.tanks) { const el = this.el.querySelector(`.t-pip[data-id="${t.id}"]`); if (el) el.classList.toggle('dead', !t.alive); } }
    const cap = G.cap, capOn = cap.pts > 0.5;
    if (capOn !== this.capOn) { this.capOn = capOn; $('cap').classList.toggle('on', capOn); }
    if (capOn) { this.set('cap', 'cls', 'on' + (cap.team === 1 ? ' enemy' : '')); this.set('caplbl', 'text', (cap.team === 0 ? '我方正在占领据点 ' : '敌方正在占领据点 ') + Math.floor(cap.pts) + '%' + (cap.contested ? ' · 争夺中' : '')); this.set('capbar', 'width', cap.pts.toFixed(1) + '%'); }
    // markers
    for (const m of this.markers) {
      const t = m.t; let s = null;
      if (t.alive && (t.team === 0 || G.time - t.seenT < 1.5) && t !== p) s = this.project(t.x, t.y + 3.7, t.z, cam, W, H);
      if (s) { m.e.style.transform = `translate(${s[0].toFixed(1)}px,${(s[1] - 34).toFixed(1)}px)`; const d = Math.round(Math.hypot(t.x - cam.position.x, t.z - cam.position.z)); if (d !== m.dist) { m.dist = d; m.d.textContent = t.def.name + ' · ' + d + 'm'; } m.on = true; }
      else if (m.on) { m.on = false; m.e.style.transform = 'translate(-999px,-999px)'; }
    }
    // gun marker, aiming circle, reload arc
    const alive = p === me && me.alive;
    this.set('gunmark', 'display', alive ? 'block' : 'none'); this.set('reticle', 'display', alive ? 'block' : 'none'); this.set('range', 'display', alive ? 'block' : 'none');
    if (alive) {
      const s = this.project(G.gunPoint.x, G.gunPoint.y, G.gunPoint.z, cam, W, H);
      if (s) this.gun.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px)`;
      const px = clamp((Math.tan(p.disp * 0.001) / Math.tan((cam.fov * Math.PI) / 360)) * H, 7, 240);
      this.ring.style.width = this.ring.style.height = px.toFixed(1) + 'px';
      const k = p.reloadT > 0 ? p.reloadT / p.reloadTotal : 0; this.arc.style.strokeDashoffset = (170 * (1 - k)).toFixed(1); this.arc.style.opacity = k > 0 ? 1 : 0;
      this.set('range', 'text', G.aimDist < 590 ? Math.round(G.aimDist) + ' m' : '');
      this.set('gunmark', 'cls', G.pen ? G.pen.v : ''); this.set('peninfo', 'text', G.pen && G.pen.eff ? `${ZONE[G.pen.zone] || ''} ${Math.round(G.pen.eff)}mm` : G.pen && G.pen.rico ? '跳弹角度' : '');
      this.set('reloadtxt', 'text', !p.gunOk() ? '火炮故障' : p.reloadT > 0 ? p.reloadT.toFixed(1) + ' s' : '装填完毕'); this.set('reloadtxt', 'cls', p.reloadT > 0 || !p.gunOk() ? '' : 'ready');
      this.set('speed', 'text', String(Math.round(Math.abs(p.speed) * 3.6)));
      for (let i = 0; i < 3; i++) { this.set('shc' + i, 'text', '×' + p.ammo[i]); this.set('sh' + i, 'cls', 'shell' + (i === p.loaded ? ' sel' : '') + (p.ammo[i] <= 0 ? ' empty' : '')); }
    }
    this.set('scope', 'cls', G.cam.sniper && alive ? 'on' : ''); if (G.cam.sniper) this.set('zoomlbl', 'text', '×' + G.cam.zoomX());
    // status panel
    if ((T.xray -= dt) <= 0 && p) {
      T.xray = 0.2; drawXray(this.xr, p.def, p, 380, 300);
      this.set('st-name', 'text', p.def.name + (p === me ? '' : ' · ' + p.name)); this.set('st-ext', 'text', '灭火器 ' + p.extinguishers);
      if (p === me) for (const m of p.mods) if (m.d.kind === 'crew') this.set('cw-' + m.d.id, 'cls', m.hp <= 0 ? 'dead' : m.hp < 60 ? 'hurt' : '');
      const tg = [];
      if (p.fire) tg.push('<i>起火</i>'); if (!p.tracksOk()) tg.push('<i>履带断裂</i>'); if (p.engineK() === 0) tg.push('<i>发动机损毁</i>'); else if (p.engineK() < 1) tg.push('<i class="warn">发动机受损</i>');
      if (p.byId.trans.hp <= 0) tg.push('<i>传动损毁</i>'); if (p.byId.breech.hp <= 0) tg.push('<i>炮闩损毁</i>'); if (p.ext.barrel.hp <= 0) tg.push('<i>炮管损毁</i>');
      if (p.byId.tdrive.hp <= 0) tg.push('<i class="warn">炮塔驱动损毁</i>'); if (p.gunnerOut > 0) tg.push('<i class="warn">炮手换位 ' + Math.ceil(p.gunnerOut) + 's</i>'); if (p.driverOut > 0) tg.push('<i class="warn">驾驶员换位 ' + Math.ceil(p.driverOut) + 's</i>');
      if (p.blowoutT > 0) tg.push('<i>弹药殉爆·已泄压</i>');
      this.set('tags', 'html', tg.join(''));
      const rep = p.repair; this.set('repair', 'cls', rep ? 'on' : ''); if (rep) this.set('repairbar', 'width', ((rep.t / rep.total) * 100).toFixed(0) + '%');
      if (p === me && p.alive && !rep && !p.fire && p.needsRepair() && this.hintT <= 0) this.hint(G.input.touch ? '车辆受损：停车后点“维修”' : '车辆受损：停车后按 <kbd>F</kbd> 战地维修', 1.2);
    }
    // minimap
    if ((T.map -= dt) <= 0) { T.map = 0.08; this.drawMap(G); }
  }

  drawMap(G) {
    const g = this.mm, W = G.world, S = 400 / (2 * W.size), P = (v) => (v + W.size) * S;
    g.drawImage(this.mapLayer, 0, 0);
    const cap = G.cap; g.lineWidth = 3; g.strokeStyle = cap.pts > 0.5 ? (cap.team === 0 ? '#5fd693' : '#f0523c') : '#f2b33d'; g.fillStyle = cap.pts > 0.5 ? (cap.team === 0 ? 'rgba(95,214,147,.25)' : 'rgba(240,82,60,.25)') : 'rgba(242,179,61,.18)';
    g.beginPath(); g.arc(P(W.cap.x), P(W.cap.z), W.cap.r * S, 0, 6.3); g.fill(); g.stroke();
    const p = G.view;
    if (p) { // view cone
      const x = P(p.x), y = P(p.z), a = G.cam.yaw; g.fillStyle = 'rgba(233,229,214,.14)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 90, Math.PI / 2 - a - 0.45, Math.PI / 2 - a + 0.45); g.closePath(); g.fill();
    }
    for (const t of G.tanks) {
      const seen = t.team === 0 || G.time - t.seenT < 4; if (!seen) continue;
      const x = P(t.team === 0 || t.alive === false ? t.x : t.lastX), y = P(t.team === 0 || t.alive === false ? t.z : t.lastZ);
      g.save(); g.translate(x, y);
      if (!t.alive) { g.strokeStyle = t.team === 0 ? 'rgba(95,214,147,.6)' : 'rgba(240,82,60,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-5, -5); g.lineTo(5, 5); g.moveTo(5, -5); g.lineTo(-5, 5); g.stroke(); g.restore(); continue; }
      g.rotate(-t.heading + Math.PI); g.fillStyle = t === p ? '#ffd27a' : t.team === 0 ? '#5fd693' : '#f0523c'; g.strokeStyle = '#0b0d0c'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 4); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
}
