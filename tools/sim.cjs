// Headless logic soak: run whole battles with rendering stubbed out and report what happened.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
  await p.goto('file://' + process.cwd() + '/dist/index.html');
  await p.waitForFunction(() => window.__dbg, null, { timeout: 180000 });
  const runs = +(process.argv[2] || 2), auto = process.argv[3] === 'auto';
  for (let r = 0; r < runs; r++) {
    const out = await p.evaluate(([r, auto]) => {
      const g = __dbg.game, log = [];
      __dbg.gfx.render = () => {};
      __dbg.settings.tank = ['ztz99a', 'm1a2', 't90m', 'leo2a7', 't14', 'cr3', 'leclerc'][r % 7]; __dbg.settings.size = [5, 7, 3][r % 3]; __dbg.settings.diff = ['normal', 'hard', 'easy'][r % 3];
      g.start(); g.count = 0.01;
      const feed = document.getElementById('feed'); let lastFeed = '';
      const t0 = performance.now(); let steps = 0, maxStuck = 0, stuckWho = '';
      const prev = g.tanks.map((t) => [t.x, t.z]), still = g.tanks.map(() => 0);
      try {
        while (!g.shown && steps < 30 * 500) {
          if (auto && g.player.alive) { const I = __dbg.input; I.keys.add('KeyW'); if (steps % 200 < 20) I.keys.add('KeyA'); else I.keys.delete('KeyA'); I.fire = steps % 90 === 0; g.cam.yaw = g.player.heading; }
          g.update(1 / 30); steps++;
          if (steps % 30 === 0) g.tanks.forEach((t, i) => { const d = Math.hypot(t.x - prev[i][0], t.z - prev[i][1]); prev[i] = [t.x, t.z]; if (t.alive && d < 0.3 && (auto || !t.isPlayer)) still[i]++; else still[i] = 0; if (still[i] > maxStuck) { maxStuck = still[i]; const ai = g.ais.find((a) => a.t === t); stuckWho = t.name + ' ' + (ai ? ai.role + ' ' + ai.mode + ' tgt:' + (ai.target ? ai.target.name : '-') + ' goal:' + (ai.goal ? ai.goal.x.toFixed(0) + ',' + ai.goal.z.toFixed(0) : '-') + ' drive:' + t.canDrive() + ' rep:' + !!t.repair : 'player') + ' @' + t.x.toFixed(0) + ',' + t.z.toFixed(0); } });
          const f = feed.textContent; if (f !== lastFeed) { lastFeed = f; log.push(g.time.toFixed(0) + 's ' + (feed.lastChild ? feed.lastChild.textContent : '')); }
        }
      } catch (e) { return { err: e.message + '\n' + e.stack }; }
      return { steps, simTime: g.time.toFixed(1), ms: Math.round(performance.now() - t0), outcome: g.result && g.result.outcome, why: g.result && g.result.why, cap: g.cap, maxStuck, stuckWho, log, tanks: g.tanks.map((t) => `${t.team}:${t.name}:${t.def.id}:${t.alive ? 'alive' : t.deadReason} k${t.stats.kills} s${t.stats.shots} h${t.stats.hits} p${t.stats.pens} @${t.x.toFixed(0)},${t.z.toFixed(0)}`) };
    }, [r, auto]);
    console.log(JSON.stringify(out, null, 1));
    await p.evaluate(() => { document.getElementById('btn-back').click(); });
  }
  console.log(errs.slice(0, 10).join('\n') || 'no console errors');
  await b.close();
})();
