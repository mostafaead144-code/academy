// Rebuilds the shared runtime bundle from v22/live.js and points every page at it.
// Usage: npm install && npm run build
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/build');

const result = await build({
  entryPoints: [join(root, 'v22/live.js')],
  minify: true,
  charset: 'utf8',
  target: 'es2020',
  write: false,
  logLevel: 'error',
});
const code = result.outputFiles[0].contents;
const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
const name = `runtime.${hash}.js`;

const old = readdirSync(outDir).filter((f) => /^runtime\.[0-9a-f]{12}\.js$/.test(f) && f !== name);
writeFileSync(join(outDir, name), code);

for (const page of readdirSync(root).filter((f) => f.endsWith('.html'))) {
  const file = join(root, page);
  const html = readFileSync(file, 'utf8');
  const next = html.replace(/assets\/build\/runtime\.[0-9a-f]{12}\.js/g, `assets/build/${name}`);
  if (next !== html) { writeFileSync(file, next); console.log(`updated ${page}`); }
}
for (const f of old) unlinkSync(join(outDir, f));
console.log(`built assets/build/${name} (${code.length} bytes)`);
