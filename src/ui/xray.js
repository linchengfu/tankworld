// Top-down x-ray of a tank: hull tub, tracks, turret outline, every module and crew member tinted by condition.
// Used by the status panel, the hit camera and the garage. Forward is up; the tank's left is screen-left.
import { solidsFor } from '../tank/geom.js';

const COL = { ok: 'rgba(196,214,204,.16)', okS: 'rgba(206,222,212,.55)', hurt: '#e8c547', bad: '#f07a3a', dead: '#0c0c0c', deadS: '#f0523c', crew: 'rgba(233,229,214,.75)' };
function tint(r) { return r >= 0.999 ? [COL.ok, COL.okS] : r > 0.5 ? ['rgba(232,197,71,.5)', COL.hurt] : r > 0 ? ['rgba(240,122,58,.6)', COL.bad] : [COL.dead, COL.deadS]; }

// state: { mods:[{d,hp}], ext:{trackL,trackR,barrel}, turretYaw } or null for a pristine tank
export function drawXray(ctx, def, state, w, h, o = {}) {
  const g = def.geo, S = solidsFor(def), T = g.turret, yaw = o.yaw ?? state?.turretYaw ?? 0, span = o.tight ? g.L + 2.6 : Math.max(g.L + 1.2, (T.z + g.gun.z + g.gun.len) + g.L / 2 + 0.6);
  const s = Math.min((w - 8) / (g.W + 1.4), (h - 8) / span) * (o.zoom || 1), cx = w / 2, cy = h / 2 + ((span - g.L) / 2 - 0.3) * s * 0.5;
  const X = (x) => cx - x * s, Y = (z) => cy - z * s, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const tp = (x, z) => [X(x * cs + z * sn), Y(-x * sn + z * cs + T.z)]; // turret space → screen
  ctx.clearRect(0, 0, w, h); ctx.lineJoin = 'round'; ctx.lineWidth = 1;
  const hp = (id, max) => (state ? state.ext[id].hp / max : 1);
  // tracks
  for (const [id, sgn] of [['trackL', 1], ['trackR', -1]]) { const [f, st] = tint(hp(id, 200)), x = sgn * (g.W / 2 - g.trackW / 2); ctx.fillStyle = f; ctx.strokeStyle = st; ctx.beginPath(); ctx.rect(X(x + g.trackW / 2), Y(g.L / 2 - 0.1), g.trackW * s, (g.L - 0.15) * s); ctx.fill(); ctx.stroke(); }
  // hull tub
  ctx.strokeStyle = 'rgba(233,229,214,.5)'; ctx.fillStyle = 'rgba(20,26,23,.5)'; ctx.beginPath(); ctx.rect(X(S.hw), Y(g.L / 2), S.hw * 2 * s, g.L * s); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(233,229,214,.22)'; ctx.beginPath(); ctx.moveTo(X(S.hw), Y(g.L / 2 - g.glacisLen)); ctx.lineTo(X(-S.hw), Y(g.L / 2 - g.glacisLen)); ctx.stroke();
  const hot = o.hot || null;
  const box = (m, pts, round) => {
    const r = state ? m.hp / m.d.hpMax : 1, [f, st] = tint(r), isHot = hot && hot.has(m.d.id);
    if (m.d.kind === 'wall') { ctx.strokeStyle = 'rgba(233,229,214,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.stroke(); ctx.lineWidth = 1; return; }
    ctx.fillStyle = m.d.kind === 'crew' && r >= 0.999 ? COL.crew : f; ctx.strokeStyle = st; ctx.lineWidth = isHot ? 2 : 1;
    ctx.beginPath();
    if (m.d.kind === 'crew') { const mx = (pts[0][0] + pts[2][0]) / 2, my = (pts[0][1] + pts[2][1]) / 2; ctx.arc(mx, my, 0.24 * s, 0, 6.3); }
    else { ctx.moveTo(...pts[0]); for (let i = 1; i < 4; i++) ctx.lineTo(...pts[i]); ctx.closePath(); }
    ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
  };
  const mods = state ? state.mods : def.modules.map((d) => ({ d, hp: d.hpMax }));
  for (const m of mods) if (m.d.space === 'hull') { const a = m.d.min, b = m.d.max; box(m, [[X(a[0]), Y(a[2])], [X(b[0]), Y(a[2])], [X(b[0]), Y(b[2])], [X(a[0]), Y(b[2])]]); }
  // turret outline + barrel
  ctx.strokeStyle = 'rgba(233,229,214,.7)'; ctx.fillStyle = 'rgba(30,38,34,.45)'; ctx.beginPath(); S.turretFull.forEach(([z, x], i) => { const p = tp(x, z); if (i) ctx.lineTo(...p); else ctx.moveTo(...p); }); ctx.closePath(); ctx.fill(); ctx.stroke();
  { const [, st] = tint(hp('barrel', 170)), a = tp(0, g.gun.z + 0.3), b = tp(0, g.gun.z + g.gun.len); ctx.strokeStyle = st; ctx.lineWidth = Math.max(2, g.gun.r * 2.6 * s); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.lineWidth = 1; }
  for (const m of mods) if (m.d.space === 'turret') { const a = m.d.min, b = m.d.max; box(m, [tp(a[0], a[2]), tp(b[0], a[2]), tp(b[0], b[2]), tp(a[0], b[2])]); }
  // shell path + spall
  if (o.rays) for (const r of o.rays) {
    const t = r.space === 'turret', p0 = t ? tp(r.o[0], r.o[2]) : [X(r.o[0]), Y(r.o[2])], e = [r.o[0] + r.d[0] * r.len, r.o[2] + r.d[2] * r.len], p1 = t ? tp(e[0], e[1]) : [X(e[0]), Y(e[1])];
    ctx.strokeStyle = r.main ? '#ffd27a' : 'rgba(255,150,70,.55)'; ctx.lineWidth = r.main ? 2 : 1; ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke();
  }
  if (o.entry) { // incoming round: line from outside to the impact point
    const t = o.entry.space === 'turret', p = o.entry.p, d = o.entry.d, a = t ? tp(p[0] - d[0] * 3, p[2] - d[2] * 3) : [X(p[0] - d[0] * 3), Y(p[2] - d[2] * 3)], b = t ? tp(p[0], p[2]) : [X(p[0]), Y(p[2])];
    ctx.strokeStyle = o.entry.ok ? '#ffd27a' : '#9fb0a8'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = o.entry.ok ? '#ffd27a' : '#9fb0a8'; ctx.beginPath(); ctx.arc(b[0], b[1], 3, 0, 6.3); ctx.fill();
  }
  ctx.lineWidth = 1;
}
