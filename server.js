import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'pitch.js', 'confirmation.js', 'keep-awake.js', 'version.js', 'pwa.js', 'sw.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/dm-sans.ttf', 'fonts/manrope.ttf', 'fonts/dmsans-LICENSE.txt', 'fonts/manrope-LICENSE.txt']);
http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!publicFiles.has(name)) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to serve this file'); }
}).listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Attune is running at http://localhost:${process.env.PORT || 3000}`));
