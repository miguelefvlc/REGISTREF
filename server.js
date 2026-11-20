// =========================================================================
// REGISTRE DIARI EF — Native Zero-Dependency HTTP Development Server
// =========================================================================
// Servidor ultrarrápido y robusto en Node.js puro + Auto-Sync con GitHub.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { startAutoSync } from './scripts/auto_sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;

const PRIMARY_PORT = parseInt(process.env.PORT || '5173', 10);
const FALLBACK_PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

function getSafeFileStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function resolveRequestFile(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname);
  const relativePath = decodedPath.replace(/^[/\\]+/, '') || 'index.html';
  let filePath = path.resolve(ROOT_DIR, relativePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    filePath = path.join(ROOT_DIR, 'index.html');
  }

  let stat = getSafeFileStat(filePath);
  if (stat && stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    stat = getSafeFileStat(filePath);
  }

  if (!stat || !stat.isFile()) {
    filePath = path.join(ROOT_DIR, 'index.html');
    stat = getSafeFileStat(filePath);
  }

  return { filePath, stat };
}

function requestHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { filePath, stat } = resolveRequestFile(parsedUrl.pathname);

    if (!stat) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const headers = {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    };

    res.writeHead(200, headers);

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
      }
      res.end('Internal Server Error: ' + err.message);
    });
    stream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Server Error: ' + err.message);
  }
}

function openBrowser(url) {
  if (process.argv.includes('--no-open') || process.env.NO_OPEN === '1') return;
  const startCmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(startCmd, () => {});
}

function startServer(port, isPrimary = false) {
  const server = http.createServer(requestHandler);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (isPrimary) {
        console.log(`\x1b[33m[INFO] El servidor ya está activo en el puerto ${port}.\x1b[0m`);
        console.log(`\x1b[32m✔ Abriendo navegador en http://localhost:${port} ...\x1b[0m`);
        openBrowser(`http://localhost:${port}`);
      }
    } else {
      console.error(`[ERROR puerto ${port}]:`, err.message);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    if (isPrimary) {
      console.log('\x1b[32m========================================================\x1b[0m');
      console.log('\x1b[1m\x1b[33m      REGISTRE DIARI EF — EDUCACIÓ FÍSICA\x1b[0m');
      console.log('\x1b[32m========================================================\x1b[0m');
      console.log(` \x1b[32m✔ Servidor activo en:\x1b[0m   \x1b[1m\x1b[36mhttp://localhost:${port}\x1b[0m`);
      console.log(` \x1b[32m✔ Red local:\x1b[0m            \x1b[36mhttp://127.0.0.1:${port}\x1b[0m`);
      console.log(' \x1b[90m--------------------------------------------------------\x1b[0m');
      console.log(' Presiona \x1b[1mCtrl + C\x1b[0m para detener el servidor.');
      console.log('\x1b[32m========================================================\x1b[0m\n');
      openBrowser(`http://localhost:${port}`);
    } else {
      console.log(` \x1b[35m✔ Respaldo OAuth activo en:\x1b[0m http://localhost:${port} (compatibilidad Supabase)`);
    }
  });

  return server;
}

startServer(PRIMARY_PORT, true);

try {
  startAutoSync();
} catch (err) {
  console.warn('[Auto-Sync] No se pudo inicializar auto-sync:', err.message);
}

if (PRIMARY_PORT !== FALLBACK_PORT) {
  startServer(FALLBACK_PORT, false);
}
