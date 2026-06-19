const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

const PUBLIC_DIR     = path.join(__dirname, 'public');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const CERTS_DIR      = path.join(__dirname, 'certs');
const CERT_FILE      = path.join(CERTS_DIR, 'cert.pem');
const KEY_FILE       = path.join(CERTS_DIR, 'key.pem');
const PORT           = process.env.PORT ?? 3000;

fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const cards = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'cards.json'), 'utf8'));
const validCardIds = new Set(cards.map(c => String(c.id)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
};

function ensureCert() {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) return;
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes` +
      ` -keyout "${KEY_FILE}" -out "${CERT_FILE}"` +
      ` -days 3650 -subj "/CN=localhost"`,
      { stdio: 'pipe' }
    );
  } catch {
    console.error('ERROR: openssl not found. Cannot generate TLS certificate.');
    process.exit(1);
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function handlePostRecording(req, res, query) {
  const cardId = query.get('cardId');
  const ext = query.get('ext');

  if (!cardId || !validCardIds.has(cardId)) {
    sendJson(res, 400, { error: 'Invalid or missing cardId' });
    return;
  }
  if (ext !== 'webm' && ext !== 'mp4') {
    sendJson(res, 400, { error: 'ext must be webm or mp4' });
    return;
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const filename = `${cardId}_${timestamp}.${ext}`;
  const filePath = path.join(RECORDINGS_DIR, filename);

  if (!filePath.startsWith(RECORDINGS_DIR + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  const writeStream = fs.createWriteStream(filePath);
  req.pipe(writeStream);

  writeStream.on('finish', () => {
    sendJson(res, 201, { url: `/recordings/${filename}`, filename });
  });

  writeStream.on('error', () => {
    sendJson(res, 500, { error: 'Server error' });
  });
}

function handleGetRecordings(req, res) {
  fs.readdir(RECORDINGS_DIR, (err, files) => {
    if (err) {
      sendJson(res, 500, { error: 'Server error' });
      return;
    }

    const recordings = files
      .filter(f => f.endsWith('.webm') || f.endsWith('.mp4'))
      .map(filename => {
        const parts = filename.replace(/\.(webm|mp4)$/, '').split('_');
        const cardId = parts[0];
        const card = cards.find(c => String(c.id) === cardId);
        return {
          cardId: Number(cardId),
          cardFront: card ? card.front : '',
          filename,
          url: `/recordings/${filename}`,
        };
      })
      .sort((a, b) => a.cardId - b.cardId || b.filename.localeCompare(a.filename));

    sendJson(res, 200, recordings);
  });
}

function handleGetRecordingFile(req, res, filename) {
  if (!/^\d+_\d{8}_\d{6}\.(webm|mp4)$/.test(filename)) {
    sendJson(res, 400, { error: 'Invalid filename' });
    return;
  }

  const filePath = path.join(RECORDINGS_DIR, filename);

  if (!filePath.startsWith(RECORDINGS_DIR + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  const ext = path.extname(filename);
  const contentType = MIME[ext] ?? 'application/octet-stream';

  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const total = stat.size;
    const rangeHeader = req.headers['range'];

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': total,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

ensureCert();

const sslOptions = {
  key:  fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
};

https.createServer(sslOptions, (req, res) => {
  const url = new URL(req.url, 'https://localhost');
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'POST' && pathname === '/api/recordings') {
    handlePostRecording(req, res, url.searchParams);
    return;
  }

  if (method === 'GET' && pathname === '/api/recordings') {
    handleGetRecordings(req, res);
    return;
  }

  if (method === 'GET' && pathname.startsWith('/recordings/')) {
    const filename = pathname.slice('/recordings/'.length);
    handleGetRecordingFile(req, res, filename);
    return;
  }

  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Flashcards running at https://localhost:${PORT}`);
  console.log(`  → Accept the self-signed cert warning in your browser once.`);
});
