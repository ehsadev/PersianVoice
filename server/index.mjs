import { createServer } from 'node:http';
import { existsSync, createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envPath = resolve(root, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_APIKEY || '';
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT || 5173);
const vite = dev ? await import('vite').then(({ createServer: createVite }) => createVite({ root, server: { middlewareMode: true }, appType: 'spa' })) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res, { apiKey })) return;
    if (vite) return vite.middlewares(req, res);
    const dist = resolve(root, 'dist');
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const file = resolve(dist, '.' + pathname);
    const target = file === dist || file === resolve(dist, 'index.html') ? resolve(dist, 'index.html') : file;
    if (!target.startsWith(dist + sep) || !existsSync(target)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': `${types[extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    createReadStream(target).pipe(res);
  } catch (error) {
    console.error('Request failed:', error instanceof Error ? error.message : String(error));
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal server error');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Ava running at http://127.0.0.1:${port}/ (${dev ? 'development' : 'production'})`));
process.on('SIGINT', () => { vite?.close(); server.close(); });
