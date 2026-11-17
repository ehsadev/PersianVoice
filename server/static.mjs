import { extname, sep } from 'node:path';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

export function staticHeaders(pathname, target) {
  const extension = extname(target);
  const cacheControl = target.endsWith(`${sep}sw.js`) || extension === '.html' ? 'no-store' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  return {
    'Content-Type': `${types[extension] || 'application/octet-stream'}; charset=utf-8`,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}
