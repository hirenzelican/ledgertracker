/**
 * Resolves the project's `@/` path alias and extensionless TypeScript imports so the
 * domain modules can be unit-tested directly with `node --test`.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);

function withTsExtension(url) {
  if (/\.(ts|tsx|mjs|js|json)$/.test(url.pathname)) return url;
  for (const candidate of ['.ts', '.tsx', '/index.ts']) {
    const attempt = new URL(url.href + candidate);
    if (existsSync(fileURLToPath(attempt))) return attempt;
  }
  return url;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const resolved = withTsExtension(new URL(specifier.slice(2), ROOT));
    return next(resolved.href, context);
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const base = context.parentURL ?? ROOT.href;
    const resolved = withTsExtension(new URL(specifier, base));
    return next(resolved.href, context);
  }
  return next(specifier, context);
}
