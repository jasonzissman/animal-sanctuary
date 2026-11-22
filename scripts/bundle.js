#!/usr/bin/env node
// Classroom bundler: turns index.html + every local <script src> / <link rel="stylesheet"> into ONE standalone
// HTML file (dist/santuario.html). Zero dependencies, deterministic (no timestamps, no absolute paths, LF newlines),
// so two runs give byte-identical output. The bundle sets window.SA_CLASSROOM = true BEFORE any game script, which
// makes game/telemetry.js never call fetch (local stats keep working).
//   node scripts/bundle.js [--out path]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'dist', 'santuario.html');
const SCRIPT_RE = /<script\b([^>]*?)\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)>\s*<\/script>/gi;
const LINK_RE = /<link\b[^>]*>/gi;
const REMOTE_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

function resolveLocal(root, ref) {
  if (REMOTE_RE.test(ref) || /^(?:data|blob|javascript):/i.test(ref)) {
    throw new Error(`bundle: external reference not allowed: ${ref}`);
  }
  const abs = path.resolve(root, ref.split(/[?#]/)[0]);
  if (path.relative(root, abs).startsWith('..')) throw new Error(`bundle: reference escapes project: ${ref}`);
  if (!fs.existsSync(abs)) throw new Error(`bundle: missing file: ${ref}`);
  return abs;
}

/** Keep inlined code from ending its own <script>/<style> element early. */
const safeJs = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const safeCss = (s) => s.replace(/<\/(style)/gi, '<\\/$1');

/** Returns the bundled HTML text for `<root>/<entry>`. Pure apart from reading files. */
export function buildBundle({ root = ROOT, entry = 'index.html', classroom = true } = {}) {
  let html = readText(path.join(root, entry));
  html = html.replace(SCRIPT_RE, (_m, pre, dq, sq, post) => {
    const attrs = `${pre} ${post}`;
    if (/\btype\s*=\s*["']?module/i.test(attrs)) throw new Error('bundle: ES modules are not supported');
    const code = safeJs(readText(resolveLocal(root, dq ?? sq)).replace(/\n+$/, ''));
    return `<script>\n${code}\n</script>`;
  });
  html = html.replace(LINK_RE, (tag) => {
    const rel = /\brel\s*=\s*["']?([^"'\s>]+)/i.exec(tag);
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (!rel || !href) return tag;
    if (rel[1].toLowerCase() !== 'stylesheet') throw new Error(`bundle: unsupported <link rel=${rel[1]}>`);
    const css = safeCss(readText(resolveLocal(root, href[1] ?? href[2])).replace(/\n+$/, ''));
    return `<style>\n${css}\n</style>`;
  });
  if (classroom) {
    const flag = '<script>window.SA_CLASSROOM = true;</script>\n';
    const first = html.search(/<script>/i);
    if (first < 0) throw new Error('bundle: no scripts found in the entry page');
    html = html.slice(0, first) + flag + html.slice(first);
  }
  return html;
}

/** Writes the bundle to `out` (creating its folder). Returns the byte length. */
export function writeBundle({ root = ROOT, out = DEFAULT_OUT, ...opts } = {}) {
  const html = buildBundle({ root, ...opts });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return Buffer.byteLength(html);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : DEFAULT_OUT;
  const bytes = writeBundle({ out });
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${(bytes / 1024).toFixed(0)} KB)`);
}
