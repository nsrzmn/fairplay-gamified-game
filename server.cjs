const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || 4173);

function parseTarget(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) {
    return null;
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return new URL(normalized);
}

const primaryBackendUrl =
  parseTarget(process.env.BACKEND_INTERNAL_URL) ||
  parseTarget(process.env.BACKEND_PUBLIC_URL) ||
  parseTarget('http://localhost:8000');

const fallbackBackendUrl = (() => {
  const candidate = parseTarget(process.env.BACKEND_PUBLIC_URL);
  if (!candidate) {
    return null;
  }

  if (candidate.origin === primaryBackendUrl.origin && candidate.pathname === primaryBackendUrl.pathname) {
    return null;
  }

  return candidate;
})();

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

function forwardApiRequest({ req, res, targetUrl, bodyBuffer }) {
  return new Promise((resolve, reject) => {
    const apiPath = (req.url || '/api').replace(/^\/api/, '') || '/';
    const upstreamPath = `${targetUrl.pathname.replace(/\/$/, '')}${apiPath}`;
    const client = targetUrl.protocol === 'https:' ? https : http;

    const upstreamReq = client.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: upstreamPath,
        headers: {
          ...req.headers,
          host: targetUrl.host,
          'content-length': String(bodyBuffer.length),
        },
      },
      (upstreamRes) => {
        if (!res.headersSent) {
          res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        }

        upstreamRes.pipe(res);
        upstreamRes.on('end', resolve);
        upstreamRes.on('error', reject);
      }
    );

    upstreamReq.setTimeout(12000, () => {
      upstreamReq.destroy(new Error('upstream timeout'));
    });

    upstreamReq.on('error', reject);

    if (bodyBuffer.length > 0 && req.method !== 'GET' && req.method !== 'HEAD') {
      upstreamReq.write(bodyBuffer);
    }

    upstreamReq.end();
  });
}

const server = http.createServer((req, res) => {
  if (!fs.existsSync(distDir)) {
    send(res, 503, 'Build artifacts not found. Run npm run build first.');
    return;
  }

  if ((req.url || '').startsWith('/api')) {
    const bodyChunks = [];
    req.on('data', (chunk) => bodyChunks.push(Buffer.from(chunk)));
    req.on('error', () => {
      if (!res.writableEnded) {
        send(res, 400, 'Bad request');
      }
    });
    req.on('end', async () => {
      const bodyBuffer = Buffer.concat(bodyChunks);

      try {
        await forwardApiRequest({ req, res, targetUrl: primaryBackendUrl, bodyBuffer });
      } catch (primaryError) {
        if (fallbackBackendUrl) {
          try {
            await forwardApiRequest({ req, res, targetUrl: fallbackBackendUrl, bodyBuffer });
            return;
          } catch (fallbackError) {
            if (!res.writableEnded) {
              send(
                res,
                502,
                `Bad gateway: failed to reach backend (${primaryBackendUrl.host}, ${fallbackBackendUrl.host})`
              );
            }
            return;
          }
        }

        if (!res.writableEnded) {
          send(res, 502, `Bad gateway: failed to reach backend (${primaryBackendUrl.host})`);
        }
      }
    });

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
  console.log(`Primary /api target: ${primaryBackendUrl.origin}${primaryBackendUrl.pathname}`);
  if (fallbackBackendUrl) {
    console.log(`Fallback /api target: ${fallbackBackendUrl.origin}${fallbackBackendUrl.pathname}`);
  }
});