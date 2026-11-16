const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
  p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await p.goto('file://' + process.cwd() + '/dist/index.html');
  await p.waitForFunction(() => window.__dbg, null, { timeout: 180000 });
  for (let r = 0; r < +(process.argv[2] || 3); r++) {
    const out = await p.evaluate((r) => {
      const g = __dbg.game; __dbg.gfx.render = () => {}; __dbg.settings.size = 5; __dbg.settings.diff = 'normal';
      g.start(); g.count = 0.01; g.timeLeft = 2000;
      const kinds = {}, zones = {}; const orig = g.onShellHit.bind(g);
      g.onShellHit = (s, res) => { const k = res.by.name; kinds[k] = kinds[k] || {}; kinds[k][res.kind] = (kinds[k][res.kind] || 0) + 1; zones[k] = zones[k] || {}; zones[k][res.zone] = (zones[k][res.zone] || 0) + 1; orig(s, res); };
      let lastKill = 0, kills = 0, steps = 0;
      while (!g.shown && steps < 30 * 900) {
        g.player.ctl.throttle = 0; g.update(1 / 30); steps++;
        const k = g.tanks.filter((t) => !t.alive).length; if (k !== kills) { kills = k; lastKill = g.time; }
        if (g.time - lastKill > 150) break;
      }
      const dump = g.ais.filter((a) => a.t.alive).map((a) => { const t = a.t, e = a.target; return `${t.team}:${t.name} ${t.def.id} role:${a.role} mode:${a.mode} @${t.x.toFixed(0)},${t.z.toFixed(0)} tgt:${e ? e.name + ' d' + Math.hypot(e.x - t.x, e.z - t.z).toFixed(0) : '-'} gunOk:${t.gunOk()} rl:${t.reloadT.toFixed(1)} ammo:${t.ammo} loaded:${t.loaded} disp:${t.disp.toFixed(2)}/${(t.def.disp * a.D.settle).toFixed(2)} drive:${t.canDrive()} rep:${!!t.repair} needs:${t.needsRepair()} pitch:${t.gunPitch.toFixed(3)}/${t.aimPitch.toFixed(3)} shots:${t.stats.shots} ${JSON.stringify(kinds[t.name] || {})} ${JSON.stringify(zones[t.name] || {})} why:${a.why} react:${a.reactT.toFixed(2)} sees:${e ? g.sees(t, e) : '-'} dot:${e ? (() => { const d = Math.hypot(e.x - t.x, e.z - t.z); const mx = e.x - t.muzzle.x, my = e.y + a.aimH + a.errY - t.muzzle.y, mz = e.z - t.muzzle.z, ml = Math.hypot(mx, my, mz); return (Math.acos(Math.min(1, (mx * t.gunDir.x + my * t.gunDir.y + mz * t.gunDir.z) / ml))).toFixed(4) + ' need ' + Math.max(0.0035, 0.7 / ml).toFixed(4) + ' errX ' + a.errX.toFixed(2) + ' yawerr ' + (t.aimYaw - t.heading - t.turretYaw).toFixed(4) + ' hold ' + t.ctl.hold + ' gunnerOut ' + t.gunnerOut.toFixed(1) + ' td ' + t.byId.tdrive.hp; })() : '-'} goal:${a.goal ? a.goal.x.toFixed(0) + ',' + a.goal.z.toFixed(0) : '-'}`; });
      return { time: g.time.toFixed(0), outcome: g.result && g.result.outcome, dump };
    }, r);
    console.log(JSON.stringify(out, null, 1));
    await p.evaluate(() => { document.getElementById('btn-back').click(); });
  }
  await b.close();
})();
