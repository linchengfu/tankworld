// usage: node tools/modelshot.cjs <tankId|all> [outDir] [mode] [json opts]  — renders the viewer sheet for one or every tank
const { chromium } = require('playwright'); const { buildSync } = require('esbuild'); const fs = require('fs'); const path = require('path');
(async () => {
  const id = process.argv[2] || 'all', out = process.argv[3] || '.', mode = process.argv[4] || 'sheet', opts = JSON.parse(process.argv[5] || '{}');
  const js = buildSync({ entryPoints: [path.join(__dirname, 'viewer.js')], bundle: true, format: 'iife', write: false, define: { __DEV__: 'true' } }).outputFiles[0].text;
  const html = path.join(out, '_viewer.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><body><script>' + js.replace(/<\/script/g, '<\\/script') + '</script>');
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await p.goto('file://' + path.resolve(html)); await p.waitForFunction(() => window.ready, null, { timeout: 60000 }).catch(() => errs.push('viewer did not start'));
  const ids = id === 'all' ? ['ztz99a', 't14', 't90m', 'm1a2', 'leo2a7', 'cr3', 'leclerc'] : id.split(',');
  for (const t of ids) {
    const info = await p.evaluate(([t, mode, opts]) => window.show(t, mode, opts), [t, mode, opts]).catch((e) => 'ERR ' + e.message);
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, `mv_${t}${mode === 'sheet' ? '' : '_p'}.png`), timeout: 120000 }); console.log(t, JSON.stringify(info));
  }
  console.log(errs.slice(0, 8).join('\n') || 'no errors'); await b.close(); fs.unlinkSync(html);
})();
