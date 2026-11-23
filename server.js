// Servidor sin dependencias (solo módulos nativos de Node)
//  - Sirve la carpeta /public
//  - API de códigos dinámicos guardados  (/api/codes)
//  - Redirección pública de los QR dinámicos (/q/:id)
//
// Variables de entorno opcionales:
//  PORT       puerto (3000 por defecto)
//  BASE_URL   dirección pública del sitio, ej. https://qr.midominio.com
//             (los QR dinámicos apuntan a BASE_URL/q/<id>; si no se define se usa la del navegador)
//  ADMIN_KEY  si se define, crear/editar/borrar exige esta clave
//  DATA_DIR   carpeta donde se guarda codes.json (./data por defecto)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'codes.json');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

/* ---------- Almacenamiento (archivo JSON) ---------- */
let codes = [];
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) codes = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch (e) {
  console.error('No se pudo leer ' + DB_FILE + ':', e.message);
  process.exit(1);   // evita sobrescribir datos existentes con una lista vacía
}
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(codes, null, 2));
  fs.renameSync(tmp, DB_FILE);   // escritura atómica
}
let scanTimer = null;
function saveSoon() {          // los escaneos se guardan agrupados para no escribir en cada visita
  if (scanTimer) return;
  scanTimer = setTimeout(() => { scanTimer = null; try { save(); } catch (e) { console.error(e.message); } }, 2000);
}
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newId() {
  for (;;) {
    let id = '';
    const b = crypto.randomBytes(7);
    for (let i = 0; i < 7; i++) id += ALPHABET[b[i] % ALPHABET.length];
    if (!codes.some(c => c.id === id)) return id;
  }
}

/* ---------- Validación ---------- */
function normalizeTarget(v) {
  v = String(v || '').trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[^\s\/:@]+\.[a-z]{2,}(\/\S*)?$/i.test(v)) return 'https://' + v;   // "midominio.com/ruta"
  return v;
}
function clean(body, type) {
  const name = String(body.name || '').trim().slice(0, 60);
  let content = String(body.content || '').trim();
  const size = ['s', 'm', 'l'].includes(body.size) ? body.size : 'm';
  const show = body.show !== false;
  if (!content) return { error: 'El contenido no puede estar vacío.' };
  if (type === 'bar') {
    if (content.length > 32) return { error: 'El código de barras admite máximo 32 caracteres.' };
    if (!/^[\x20-\x7e]+$/.test(content)) return { error: 'El código de barras solo admite caracteres ASCII.' };
  } else {
    if (content.length > 2000) return { error: 'El destino admite máximo 2000 caracteres.' };
    content = normalizeTarget(content);
  }
  return { value: { name, content, size, show } };
}
const isUrl = s => /^https?:\/\/\S+$/i.test(s);

/* ---------- Utilidades HTTP ---------- */
function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 100000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function authorized(req) {
  if (!ADMIN_KEY) return true;
  const got = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const want = Buffer.from(ADMIN_KEY);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const escHtml = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function page(res, status, title, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escHtml(title) +
    '</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f3ee;color:#16181a;font-family:system-ui,sans-serif;padding:24px}main{max-width:560px;width:100%;background:#fff;border:1px solid #e5e3db;border-radius:20px;padding:28px}h1{font-size:1.1rem;margin:0 0 14px;color:#1f5c4b}p{white-space:pre-wrap;word-break:break-word;margin:0;font-size:1.05rem;line-height:1.5}</style></head><body><main><h1>' +
    escHtml(title) + '</h1>' + body + '</main></body></html>');
}

/* ---------- API ---------- */
async function api(req, res, urlPath) {
  if (req.method === 'GET' && urlPath === '/api/config') {
    return send(res, 200, { baseUrl: BASE_URL, authRequired: !!ADMIN_KEY });
  }
  if (!authorized(req)) return send(res, 401, { error: 'Clave incorrecta o ausente.' });

  if (urlPath === '/api/codes') {
    if (req.method === 'GET') return send(res, 200, codes);
    if (req.method === 'POST') {
      const body = await readBody(req);
      const type = body.type === 'bar' ? 'bar' : 'qr';
      const r = clean(body, type);
      if (r.error) return send(res, 400, { error: r.error });
      const now = new Date().toISOString();
      const item = Object.assign({ id: newId(), type, scans: 0, created: now, updated: now }, r.value);
      codes.unshift(item);
      save();
      return send(res, 201, item);
    }
  }
  const m = urlPath.match(/^\/api\/codes\/([A-Za-z0-9]+)$/);
  if (m) {
    const idx = codes.findIndex(c => c.id === m[1]);
    if (idx < 0) return send(res, 404, { error: 'Código no encontrado.' });
    if (req.method === 'PUT') {
      const body = await readBody(req);
      const r = clean(body, codes[idx].type);   // el tipo no se puede cambiar (el QR impreso seguiría apuntando al mismo id)
      if (r.error) return send(res, 400, { error: r.error });
      Object.assign(codes[idx], r.value, { updated: new Date().toISOString() });
      save();
      return send(res, 200, codes[idx]);
    }
    if (req.method === 'DELETE') {
      codes.splice(idx, 1);
      save();
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'No encontrado.' });
}

/* ---------- Servidor ---------- */
http.createServer(async (req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end('Solicitud incorrecta'); }

  try {
    if (urlPath.startsWith('/api/')) return await api(req, res, urlPath);

    // Redirección pública de los QR dinámicos
    const q = urlPath.match(/^\/q\/([A-Za-z0-9]+)\/?$/);
    if (q && req.method === 'GET') {
      const item = codes.find(c => c.id === q[1] && c.type === 'qr');
      if (!item) return page(res, 404, 'Código no encontrado', '<p>Este código QR ya no existe o fue eliminado.</p>');
      item.scans = (item.scans || 0) + 1;
      saveSoon();
      if (isUrl(item.content)) { res.writeHead(302, { Location: item.content, 'Cache-Control': 'no-store' }); return res.end(); }
      return page(res, 200, item.name || 'Contenido del código', '<p>' + escHtml(item.content) + '</p>');
    }
  } catch (e) {
    return send(res, 400, { error: 'Solicitud no válida.' });
  }

  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Servidor activo en puerto ' + PORT));

process.on('SIGTERM', () => { try { save(); } catch (e) {} process.exit(0); });
process.on('SIGINT', () => { try { save(); } catch (e) {} process.exit(0); });
