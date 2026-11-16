// Keyboard + mouse (pointer lock when available) and a touch layout: left stick drives, drag anywhere else aims.
export class Input {
  constructor(canvas) {
    this.canvas = canvas; this.keys = new Set(); this.dx = 0; this.dy = 0; this.fire = false; this.free = false; this.events = []; this.touch = false; this.locked = false; this.active = false;
    this.stick = { id: null, x: 0, y: 0 }; this.lookId = null; this.lx = 0; this.ly = 0; this.quietUntil = 0;
    const on = (t, e, f, o) => t.addEventListener(e, f, o);
    on(window, 'keydown', (e) => {
      if (e.repeat) return; const k = e.code; this.keys.add(k);
      if (!this.active) { if (k === 'Escape') this.events.push(['pause']); return; }
      if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') this.events.push(['shell', +k.slice(5) - 1]);
      else if (k === 'ShiftLeft' || k === 'ShiftRight') this.events.push(['zoom']);
      else if (k === 'KeyF') this.events.push(['repair']); else if (k === 'Escape' || k === 'KeyP') this.events.push(['pause']);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => { this.keys.clear(); this.fire = false; this.free = false; });
    // browsers can report one wild delta as the lock engages, so look input goes quiet for a moment
    on(document, 'pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === canvas; this.quietUntil = performance.now() + 250; if (was && !this.locked && this.active) this.events.push(['pause']); });
    on(canvas, 'mousedown', (e) => { if (!this.active || this.touch) return; if (!this.locked) this.lock(); if (e.button === 0) { this.fire = true; this.events.push(['click']); } else if (e.button === 2) this.free = true; });
    on(window, 'mouseup', (e) => { if (e.button === 0) this.fire = false; else if (e.button === 2) this.free = false; });
    on(window, 'mousemove', (e) => { if (!this.active || this.touch) return; if (performance.now() < this.quietUntil) return; if (this.locked || e.target === canvas) { const c = (v) => Math.max(-400, Math.min(400, v || 0)); this.dx += c(e.movementX); this.dy += c(e.movementY); } });
    on(canvas, 'wheel', (e) => { if (this.active) { this.events.push(['wheel', e.deltaY < 0 ? 1 : -1]); e.preventDefault(); } }, { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    // touch
    on(window, 'touchstart', () => { if (!this.touch) { this.touch = true; document.getElementById('app').classList.add('touch'); } }, { passive: true });
    on(canvas, 'pointerdown', (e) => { if (e.pointerType !== 'touch' || this.lookId !== null) return; this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY; this.events.push(['click']); });
    on(window, 'pointermove', (e) => {
      if (e.pointerId === this.lookId) { this.dx += (e.clientX - this.lx) * 1.6; this.dy += (e.clientY - this.ly) * 1.6; this.lx = e.clientX; this.ly = e.clientY; }
      else if (e.pointerId === this.stick.id) this.moveStick(e);
    });
    const up = (e) => { if (e.pointerId === this.lookId) this.lookId = null; if (e.pointerId === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; this.knob.style.transform = ''; } };
    on(window, 'pointerup', up); on(window, 'pointercancel', up);
  }
  bindTouch() {
    const $ = (id) => document.getElementById(id); this.pad = $('stick'); this.knob = this.pad.firstChild;
    this.pad.addEventListener('pointerdown', (e) => { this.stick.id = e.pointerId; this.moveStick(e); e.preventDefault(); });
    const hold = (id, down, up) => { const b = $(id); b.addEventListener('pointerdown', (e) => { down(); e.preventDefault(); e.stopPropagation(); }); if (up) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, up); };
    hold('tb-fire', () => { this.fire = true; }, () => { this.fire = false; }); hold('tb-zoom', () => this.events.push(['zoom'])); hold('tb-shell', () => this.events.push(['shell', -1]));
    hold('tb-fix', () => this.events.push(['repair'])); hold('tb-pause', () => this.events.push(['pause']));
    document.getElementById('shells').addEventListener('click', (e) => { const b = e.target.closest('.shell'); if (b) this.events.push(['shell', +b.dataset.i]); });
  }
  moveStick(e) {
    const r = this.pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, m = r.width / 2;
    let x = (e.clientX - cx) / m, y = (e.clientY - cy) / m; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    this.stick.x = x; this.stick.y = y; this.knob.style.transform = `translate(${x * m * 0.6}px,${y * m * 0.6}px)`;
  }
  lock() { try { const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* optional */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  axes() {
    const K = this.keys; let t = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0), s = (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0) - (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0);
    if (this.stick.id !== null) { const dead = (v) => (Math.abs(v) < 0.18 ? 0 : v); t = -dead(this.stick.y); s = -dead(this.stick.x) * (t < -0.1 ? -1 : 1); }
    return { throttle: t, steer: s, brake: K.has('Space') };
  }
  take() { const e = this.events; this.events = []; return e; }
  look() { const r = [this.dx, this.dy]; this.dx = this.dy = 0; return r; }
}
