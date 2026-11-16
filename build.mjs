// Bundles src/ into one self-contained HTML file (three.js inlined, no external assets except Google Fonts).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const dev = process.argv.includes('--dev');
const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: !dev, write: false,
  target: 'es2020', legalComments: 'none', loader: { '.glsl': 'text', '.jpg': 'dataurl', '.hdr': 'dataurl' },
  define: { __DEV__: dev ? 'true' : 'false' },
});
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = readFileSync('src/ui/style.css', 'utf8');
const body = readFileSync('src/ui/body.html', 'utf8');
const head = `<title>浦东铁流</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@400;500;600;700;800&family=Share+Tech+Mono&display=swap">
<style>
${css}
</style>`;
const page = `${head}\n${body}\n<script>\n${js}\n</script>\n`;
mkdirSync('dist', { recursive: true });
// artifact.html: fragment for publishing (the host wraps it in a document skeleton)
writeFileSync('dist/artifact.html', page);
// index.html: standalone document for local / static hosting
writeFileSync('dist/index.html', `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${head}
</head><body>
${body}
<script>
${js}
</script>
</body></html>
`);
console.log('built', (page.length / 1024).toFixed(0) + ' KB');
