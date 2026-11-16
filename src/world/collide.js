// Static collision world: axis-aligned building footprints and round columns, each with a height.
// The map is small (a few hundred solids), so every query is brute force with an early reject.
export class Colliders {
  constructor(bound) { this.boxes = []; this.circles = []; this.bound = bound; }
  addBox(x0, x1, z0, z1, h, tag) { const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h, tag }; this.boxes.push(b); return b; }
  addCircle(x, z, r, h, tag) { const c = { x, z, r, h, tag }; this.circles.push(c); return c; }

  // Push a circle (x, z, r) out of every solid. Mutates p; returns the contact normal or null.
  pushOut(p, r) {
    let hit = null;
    for (const b of this.boxes) {
      if (p.x < b.x0 - r || p.x > b.x1 + r || p.z < b.z0 - r || p.z > b.z1 + r) continue;
      const cx = p.x < b.x0 ? b.x0 : p.x > b.x1 ? b.x1 : p.x, cz = p.z < b.z0 ? b.z0 : p.z > b.z1 ? b.z1 : p.z;
      let dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); dx /= d; dz /= d; p.x = cx + dx * r; p.z = cz + dz * r; hit = { x: dx, z: dz }; }
      else { // centre inside the box: leave through the nearest face
        const l = p.x - b.x0, rr = b.x1 - p.x, n = p.z - b.z0, f = b.z1 - p.z, m = Math.min(l, rr, n, f);
        if (m === l) { p.x = b.x0 - r; hit = { x: -1, z: 0 }; } else if (m === rr) { p.x = b.x1 + r; hit = { x: 1, z: 0 }; } else if (m === n) { p.z = b.z0 - r; hit = { x: 0, z: -1 }; } else { p.z = b.z1 + r; hit = { x: 0, z: 1 }; }
      }
    }
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4; p.x = c.x + (dx / d) * rr; p.z = c.z + (dz / d) * rr; hit = { x: dx / d, z: dz / d };
    }
    const B = this.bound;
    if (p.x < -B + r) { p.x = -B + r; hit = { x: 1, z: 0 }; } else if (p.x > B - r) { p.x = B - r; hit = { x: -1, z: 0 }; }
    if (p.z < -B + r) { p.z = -B + r; hit = { x: 0, z: 1 }; } else if (p.z > B - r) { p.z = B - r; hit = { x: 0, z: -1 }; }
    return hit;
  }

  // 3D ray against the solids (prisms of height h). Returns { t, nx, ny, nz } of the nearest hit within maxT, or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, out = null;
    for (const b of this.boxes) {
      let t0 = 0, t1 = best, nx = 0, nz = 0;
      if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; }
      else { let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx, sn = -1; if (a > c) { const s = a; a = c; c = s; sn = 1; } if (a > t0) { t0 = a; nx = sn; nz = 0; } if (c < t1) t1 = c; if (t0 > t1) continue; }
      if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; }
      else { let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz, sn = -1; if (a > c) { const s = a; a = c; c = s; sn = 1; } if (a > t0) { t0 = a; nx = 0; nz = sn; } if (c < t1) t1 = c; if (t0 > t1) continue; }
      const y0 = oy + dy * t0;
      if (y0 <= b.h) { if (t0 < best && (y0 >= 0 || dy > 0)) { best = t0; out = { t: t0, nx, ny: 0, nz }; } }
      else if (dy < 0) { const tt = (b.h - oy) / dy; if (tt > t0 && tt < t1 && tt < best) { best = tt; out = { t: tt, nx: 0, ny: 1, nz: 0 }; } }
    }
    for (const c of this.circles) {
      const fx = ox - c.x, fz = oz - c.z, a = dx * dx + dz * dz; if (a < 1e-9) continue;
      const bq = fx * dx + fz * dz, cq = fx * fx + fz * fz - c.r * c.r, disc = bq * bq - a * cq; if (disc < 0) continue;
      const t = (-bq - Math.sqrt(disc)) / a; if (t < 0 || t >= best) continue;
      const y = oy + dy * t; if (y > c.h) continue;
      best = t; out = { t, nx: (fx + dx * t) / c.r, ny: 0, nz: (fz + dz * t) / c.r };
    }
    return out;
  }

  // Line of sight in plan view (anything shorter than `minH` is ignored).
  los(ax, az, bx, bz, minH = 3) {
    const dx = bx - ax, dz = bz - az;
    for (const b of this.boxes) {
      if (b.h < minH) continue;
      if ((ax < b.x0 && bx < b.x0) || (ax > b.x1 && bx > b.x1) || (az < b.z0 && bz < b.z0) || (az > b.z1 && bz > b.z1)) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) > 1e-9) { let a = (b.x0 - ax) / dx, c = (b.x1 - ax) / dx; if (a > c) { const s = a; a = c; c = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); } else if (ax < b.x0 || ax > b.x1) continue;
      if (Math.abs(dz) > 1e-9) { let a = (b.z0 - az) / dz, c = (b.z1 - az) / dz; if (a > c) { const s = a; a = c; c = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); } else if (az < b.z0 || az > b.z1) continue;
      if (t0 <= t1) return false;
    }
    const len2 = dx * dx + dz * dz;
    for (const c of this.circles) {
      if (c.h < minH) continue;
      let t = ((c.x - ax) * dx + (c.z - az) * dz) / (len2 || 1); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
      if (px * px + pz * pz < c.r * c.r) return false;
    }
    return true;
  }
}
