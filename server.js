'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8088);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const COLLECTIONS = ['projects', 'batches', 'persons', 'daily', 'qc', 'attendance', 'settings'];
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function emptyData() {
  return Object.fromEntries(COLLECTIONS.map((name) => [name, []]));
}

function emptyStore() {
  return { rev: 0, data: emptyData(), tombstones: {} };
}

function normalizeStore(input) {
  const store = emptyStore();
  if (!input || typeof input !== 'object') return store;
  store.rev = Number.isFinite(Number(input.rev)) ? Number(input.rev) : 0;
  for (const name of COLLECTIONS) {
    store.data[name] = Array.isArray(input.data?.[name]) ? input.data[name] : [];
    store.tombstones[name] = input.tombstones?.[name] || {};
  }
  return store;
}

function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('读取数据失败，将使用空数据：', error.message);
    return emptyStore();
  }
}

let store = loadStore();

function persistStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempFile, DATA_FILE);
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function itemTime(item) {
  const value = Number(item?.updatedAt);
  return Number.isFinite(value) ? value : 0;
}

function mergeChanges(payload) {
  let changed = false;
  for (const name of COLLECTIONS) {
    const items = new Map(store.data[name].filter((item) => item?.id).map((item) => [String(item.id), item]));
    const tombstones = store.tombstones[name] || (store.tombstones[name] = {});

    const updates = payload.upd?.[name];
    if (updates && typeof updates === 'object') {
      for (const [id, candidate] of Object.entries(updates)) {
        if (!candidate || typeof candidate !== 'object') continue;
        const incoming = { ...candidate, id };
        const incomingTime = itemTime(incoming);
        const currentTime = itemTime(items.get(id));
        const deletedTime = Number(tombstones[id]) || 0;
        if (incomingTime >= currentTime && incomingTime >= deletedTime) {
          items.set(id, incoming);
          delete tombstones[id];
          changed = true;
        }
      }
    }

    const deletions = payload.del?.[name];
    if (deletions && typeof deletions === 'object') {
      for (const [id, rawTime] of Object.entries(deletions)) {
        const deletedTime = Number(rawTime) || Date.now();
        const currentTime = itemTime(items.get(id));
        if (deletedTime >= currentTime && deletedTime >= (Number(tombstones[id]) || 0)) {
          items.delete(id);
          tombstones[id] = deletedTime;
          changed = true;
        }
      }
    }

    store.data[name] = Array.from(items.values());
  }

  if (changed) {
    store.rev += 1;
    persistStore();
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求数据超过 5 MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('JSON 格式无效'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function serveStatic(req, res, pathname) {
  let relative = pathname === '/' || pathname === '/标注项目管理工具.html' ? 'index.html' : pathname.slice(1);
  try {
    relative = decodeURIComponent(relative);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  const publicPath = relative.replaceAll('\\', '/');
  if (publicPath !== 'index.html' && !publicPath.startsWith('assets/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('未找到页面');
    return;
  }
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('未找到页面');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health' && req.method === 'GET') {
    json(res, 200, { ok: true, rev: store.rev });
    return;
  }
  if (url.pathname === '/api/data' && req.method === 'GET') {
    json(res, 200, { ok: true, rev: store.rev, data: store.data });
    return;
  }
  if (url.pathname === '/api/data' && req.method === 'POST') {
    try {
      const payload = await readJsonBody(req);
      mergeChanges(payload);
      json(res, 200, { ok: true, rev: store.rev, data: store.data });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD, POST' }).end();
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`\nAIGC 标注项目管理工具已启动，端口 ${PORT}`);
  console.log(`本机访问：http://127.0.0.1:${PORT}/`);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const address of entries || []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      const first = Number(address.address.split('.')[0]);
      const second = Number(address.address.split('.')[1]);
      const isTailscale = first === 100 && second >= 64 && second <= 127;
      if (!isTailscale) console.log(`局域网访问：http://${address.address}:${PORT}/`);
    }
  }
  console.log('保持此窗口运行，其他同一 Wi-Fi 电脑即可同步使用。\n');
});
