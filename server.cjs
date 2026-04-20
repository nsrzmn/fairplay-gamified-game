const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || 4173);
const rawBackendTarget = (process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000').trim();
const backendTarget = /^https?:\/\//i.test(rawBackendTarget)
  ? rawBackendTarget
  : `http://${rawBackendTarget}`;
const backendUrl = new URL(backendTarget);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 500, 'Failed to read file');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  });
}

function resolveAsset(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (!cleanPath || cleanPath === 'index.html') {
    return path.join(distDir, 'index.html');
  }
  const filePath = path.join(distDir, cleanPath);
  if (filePath.startsWith(distDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (!fs.existsSync(distDir)) {
    send(res, 503, 'Build artifacts not found. Run npm run build first.');
    return;
  }

  if ((req.url || '').startsWith('/api')) {
    const apiPath = (req.url || '/api').replace(/^\/api/, '') || '/';
    const upstreamPath = `${backendUrl.pathname.replace(/\/$/, '')}${apiPath}`;
    const client = backendUrl.protocol === 'https:' ? https : http;
    const upstreamReq = client.request(
      {
        protocol: backendUrl.protocol,
        hostname: backendUrl.hostname,
        port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: upstreamPath,
        headers: {
          ...req.headers,
          host: backendUrl.host,
        },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on('error', () => {
      send(res, 502, 'Bad gateway: failed to reach backend');
    });

    req.pipe(upstreamReq);
    return;
  }

  if (req.url === '/health') {
    send(res, 200, JSON.stringify({ ok: true, hasBuildArtifacts: true }), 'application/json; charset=utf-8');
    return;
  }

  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, 'Method not allowed');
    return;
  }

  const assetPath = resolveAsset(req.url || '/');
  if (assetPath) {
    serveFile(res, assetPath);
    return;
  }

  serveFile(res, path.join(distDir, 'index.html'));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`FairPlay Click Game listening on http://0.0.0.0:${port}`);
  console.log(`Proxying /api to ${backendUrl.origin}${backendUrl.pathname}`);
});