// Occupancy grid + A* for the AI crews. Cells are 3 m; anything within a hull half-width of a wall is blocked.
const CELL = 3;

export class Nav {
  constructor(world) {
    const B = world.size; this.B = B; this.n = Math.ceil((2 * B) / CELL); const n = this.n;
    this.blocked = new Uint8Array(n * n); this.cost = new Float32Array(n * n);
    const P = { x: 0, z: 0 }, R = 2.5;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -B + (i + 0.5) * CELL, z = -B + (j + 0.5) * CELL; P.x = x; P.z = z;
      const hit = world.col.pushOut(P, R); this.blocked[j * n + i] = hit && Math.hypot(P.x - x, P.z - z) > 0.05 ? 1 : 0;
    }
    // cells hugging a wall cost more, so tanks keep to the middle of streets
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) { const k = j * n + i; if (this.blocked[k]) continue; let c = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) c += this.blocked[k + dj * n + di]; this.cost[k] = c ? 1.2 + c * 0.3 : 0; }
    this.g = new Float32Array(n * n); this.from = new Int32Array(n * n); this.stamp = new Uint32Array(n * n); this.closed = new Uint32Array(n * n); this.sid = 0;
    this.heap = [];
  }
  ix(x) { return Math.max(0, Math.min(this.n - 1, Math.floor((x + this.B) / CELL))); }
  cx(i) { return -this.B + (i + 0.5) * CELL; }
  free(x, z) { return !this.blocked[this.ix(z) * this.n + this.ix(x)]; }
  nearestFree(x, z) {
    const n = this.n, ci = this.ix(x), cj = this.ix(z); if (!this.blocked[cj * n + ci]) return [ci, cj];
    for (let r = 1; r < 14; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < n && j < n && !this.blocked[j * n + i]) return [i, j]; }
    return [ci, cj];
  }
  // straight line clear of blocked cells?
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), steps = Math.ceil(d / 1.4);
    for (let s = 0; s <= steps; s++) { const t = steps ? s / steps : 0; if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // A* over the grid, then string-pull. Returns [{x, z}, …] or null.
  path(sx, sz, tx, tz) {
    const n = this.n, [si, sj] = this.nearestFree(sx, sz), [ti, tj] = this.nearestFree(tx, tz), start = sj * n + si, goal = tj * n + ti, id = ++this.sid;
    const H = this.heap; H.length = 0;
    const push = (k, f) => { H.push([f, k]); let c = H.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (H[p][0] <= H[c][0]) break; [H[p], H[c]] = [H[c], H[p]]; c = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === c) break; [H[m], H[c]] = [H[c], H[m]]; c = m; } } return top; };
    this.g[start] = 0; this.stamp[start] = id; this.from[start] = -1; push(start, 0);
    let found = false, iter = 0;
    while (H.length && iter++ < 60000) {
      const [, k] = pop(); if (this.closed[k] === id) continue; this.closed[k] = id;
      if (k === goal) { found = true; break; }
      const i = k % n, j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue; const q = b * n + a;
        if (this.blocked[q] || this.closed[q] === id) continue;
        if (di && dj && (this.blocked[j * n + a] || this.blocked[b * n + i])) continue; // no corner cutting
        const g = this.g[k] + (di && dj ? 1.414 : 1) + this.cost[q];
        if (this.stamp[q] !== id || g < this.g[q]) { this.g[q] = g; this.stamp[q] = id; this.from[q] = k; push(q, g + Math.hypot(a - ti, b - tj)); }
      }
    }
    if (!found) return null;
    const raw = []; for (let k = goal; k !== -1; k = this.from[k]) raw.push({ x: this.cx(k % n), z: this.cx((k / n) | 0) }); raw.reverse();
    const out = [raw[0]]; let a = 0;
    while (a < raw.length - 1) { let b = Math.min(raw.length - 1, a + 40); while (b > a + 1 && !this.lineFree(raw[a].x, raw[a].z, raw[b].x, raw[b].z)) b--; out.push(raw[b]); a = b; }
    if (this.free(tx, tz) && this.lineFree(out[out.length - 1].x, out[out.length - 1].z, tx, tz)) out[out.length - 1] = { x: tx, z: tz };
    return out;
  }
}
