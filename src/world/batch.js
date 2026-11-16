// FacadeBatch collects curtain-wall quads for one facade texture. UVs are in metres / 12 so the window grid
// keeps its real size on any building. Walls come from "lofts" between two plan polygons.
import * as THREE from 'three';

export class FacadeBatch {
  constructor(tileU = 12, tileV = 12) { this.pos = []; this.nor = []; this.uv = []; this.tu = tileU; this.tv = tileV; }
  quad(a, b, c, d, ua, ub, flip) {
    // a,b bottom; c,d top (c above b, d above a). Each point [x, y, z].
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const P = flip ? [a, d, c, a, c, b] : [a, b, c, a, c, d], U = flip ? [ua, ua, ub, ua, ub, ub] : [ua, ub, ub, ua, ub, ua];
    for (let i = 0; i < 6; i++) { const p = P[i]; this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.uv.push(U[i], p[1] / this.tv + (this.vOff || 0)); }
  }
  // bot/top: arrays of [x, z]; y0/y1: number or per-vertex array. Outward normals are found from the centroid.
  loft(bot, y0, top, y1, o = {}) {
    const n = bot.length; let cx = 0, cz = 0; for (const p of bot) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    const Y0 = (i) => (Array.isArray(y0) ? y0[i] : y0), Y1 = (i) => (Array.isArray(y1) ? y1[i] : y1);
    let u = o.u0 || 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = [bot[i][0], Y0(i), bot[i][1]], b = [bot[j][0], Y0(j), bot[j][1]], c = [top[j][0], Y1(j), top[j][1]], d = [top[i][0], Y1(i), top[i][1]];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]), du = o.uPer ? o.uPer : len / this.tu;
      // outward test in plan view
      const ex = b[0] - a[0], ez = b[2] - a[2], mx = (a[0] + b[0]) / 2 - cx, mz = (a[2] + b[2]) / 2 - cz;
      const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      const outward = nx * mx + nz * mz > 0, ox = outward ? nx : -nx, oz = outward ? nz : -nz;
      // u must grow to the viewer's right when the wall is seen from outside, or signs read mirrored
      if (ex * oz - ez * ox > 0) this.quad(a, b, c, d, u, u + du, !outward); else this.quad(a, b, c, d, -u, -(u + du), !outward);
      u += du;
    }
    return this;
  }
  prism(pts, y0, y1, o) { return this.loft(pts, y0, pts, y1, o); }
  box(x0, x1, z0, z1, y0, y1, o) { return this.prism([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, o); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

export const rectPts = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
export const ngon = (cx, cz, r, n, rot = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + (i / n) * Math.PI * 2) * r, cz + Math.sin(rot + (i / n) * Math.PI * 2) * r]);
export const scalePts = (pts, cx, cz, s) => pts.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s]);
export const chamfer = (cx, cz, hx, hz, k) => [[cx - hx + k, cz - hz], [cx + hx - k, cz - hz], [cx + hx, cz - hz + k], [cx + hx, cz + hz - k], [cx + hx - k, cz + hz], [cx - hx + k, cz + hz], [cx - hx, cz + hz - k], [cx - hx, cz - hz + k]];
