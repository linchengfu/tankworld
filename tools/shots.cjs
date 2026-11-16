// usage: node tools/shots.cjs spec.json   — spec: { w, h, setup?: js, shots: [{ name, js, wait }] }
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const S = process.env.SHOTDIR || '.';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: spec.w || 1280, height: spec.h || 720 }, hasTouch: !!spec.touch, isMobile: !!spec.touch, deviceScaleFactor: spec.dpr || 1 });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|WebGL-/.test(m.text()))) errs.push(m.text()); if (m.type() === 'log' && m.text().startsWith('[t]')) console.log(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await p.goto('file://' + process.cwd() + '/dist/index.html' + (spec.hash || ''));
  await p.waitForFunction(() => window.__frames > 2, null, { timeout: 180000 }).catch(() => errs.push('timeout waiting frames'));
  if (spec.setup) { const r = await p.evaluate(spec.setup).catch((e) => 'EVAL ERR ' + e.message); if (r !== undefined) console.log('setup:', JSON.stringify(r)); }
  for (const s of spec.shots) {
    if (s.js) { const r = await p.evaluate(s.js).catch((e) => 'EVAL ERR ' + e.message); if (r !== undefined && r !== null) console.log(s.name + ':', JSON.stringify(r)); }
    if (s.keys) for (const k of s.keys) { if (k.down) await p.keyboard.down(k.down); if (k.up) await p.keyboard.up(k.up); if (k.wait) await p.waitForTimeout(k.wait); }
    await p.waitForTimeout(s.wait ?? 800);
    if (s.name) await p.screenshot({ path: `${S}/${s.name}.png`, timeout: 180000 }).catch((e) => errs.push("shot fail " + s.name));
  }
  console.log(errs.slice(0, 15).join('\n') || 'no console errors');
  await b.close();
})();
