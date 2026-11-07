#!/usr/bin/env node
/*
 * Academy front-end build.
 * Concatenates the v20-ui / v22 sources listed in tools/bundles.json, minifies them with
 * esbuild, writes content-hashed files to assets/build/, and rewrites the references in the
 * portal HTML pages. Old bundles are left in place; delete them only through the release notes.
 *
 * Usage:  npm install   (once)   then   npm run build
 *         npm run build -- --check   (build to memory and report which bundles would change)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipe = JSON.parse(readFileSync(join(root, 'tools/bundles.json'), 'utf8'));
const pages = ['index.html', 'admin.html', 'teacher.html', 'parent.html'];
const checkOnly = process.argv.includes('--check');

const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const read = file => {
  const full = join(root, file);
  if (!existsSync(full)) throw new Error(`Missing source file: ${file}`);
  return readFileSync(full, 'utf8');
};

async function bundle(name, files, loader) {
  // Each JS source is a self-contained IIFE; the separator keeps ASI from merging them.
  let source = files.map(read).join(loader === 'js' ? '\n;\n' : '\n');
  if (loader === 'css') {
    // @import is only valid at the top of a stylesheet; hoist imports found in later source files.
    const imports = [];
    source = source.replace(/@import\s+(?:url\()?["'][^"']+["']\)?[^;]*;/g, m => { imports.push(m); return ''; });
    source = [...new Set(imports)].join('\n') + '\n' + source;
  }
  const { code } = await transform(source, { loader, minify: true, target: 'es2020', charset: 'utf8', legalComments: 'none' });
  return { name, ext: loader, code, file: `assets/build/${name}.${hash(code)}.${loader}` };
}

const outputs = [];
for (const [name, files] of Object.entries(recipe.js)) if (!name.startsWith('_')) outputs.push(await bundle(name, files, 'js'));
for (const [name, files] of Object.entries(recipe.css)) if (!name.startsWith('_')) outputs.push(await bundle(name, files, 'css'));

let changed = 0;
for (const out of outputs) {
  const exists = existsSync(join(root, out.file));
  if (!exists) changed++;
  console.log(`${exists ? 'unchanged' : 'NEW      '}  ${out.file}  (${(out.code.length / 1024).toFixed(1)} KB)`);
  if (!checkOnly && !exists) writeFileSync(join(root, out.file), out.code);
}

if (!checkOnly) {
  for (const page of pages) {
    const full = join(root, page);
    let html = readFileSync(full, 'utf8');
    const before = html;
    for (const out of outputs) {
      const pattern = new RegExp(`assets/build/${out.name}\\.[0-9a-f]{12}\\.${out.ext}`, 'g');
      html = html.replace(pattern, out.file);
    }
    if (html !== before) { writeFileSync(full, html); console.log(`updated    ${page}`); }
  }
}
console.log(checkOnly ? `${changed} bundle(s) would change.` : 'Build complete.');
