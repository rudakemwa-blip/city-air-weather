// City Air & Weather Compare - zero-dependency Node server (needs Node 18+).
// Serves the static frontend and proxies OpenWeatherMap so the API key never reaches the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---- Minimal .env loader (so no npm packages are needed) ----
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) { /* .env optional; systemd may provide env vars */ }

const PORT = process.env.PORT || 3000;
const KEY = process.env.OWM_KEY;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // city (lowercase) -> { time, data }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const AQI_LABELS = ['', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];

function send(res, status, body, extra = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Backend': os.hostname(), // shows which server answered (handy for load balancer demo)
    ...extra
  };
  res.writeHead(status, headers);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

// Fetch JSON from OpenWeatherMap and translate failures into friendly errors.
async function owm(url) {
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    const err = new Error('Weather service is unreachable or timed out. Please try again shortly.');
    err.status = 502;
    throw err;
  }
  if (r.status === 401) { const e = new Error('The server API key is invalid or not active yet.'); e.status = 500; throw e; }
  if (r.status === 429) { const e = new Error('Rate limit reached. Please wait a minute and try again.'); e.status = 429; throw e; }
  if (!r.ok) { const e = new Error('Weather service returned an error (' + r.status + ').'); e.status = 502; throw e; }
  try { return await r.json(); } catch (_) {
    const e = new Error('Weather service sent an invalid response.'); e.status = 502; throw e;
  }
}

async function getCity(rawCity) {
  const key = rawCity.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return { ...hit.data, cached: true };

  const geo = await owm(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(rawCity)}&limit=1&appid=${KEY}`);
  if (!Array.isArray(geo) || geo.length === 0) {
    const e = new Error(`City "${rawCity}" was not found. Check the spelling.`); e.status = 404; throw e;
  }
  const { lat, lon, name, country, state } = geo[0];
  const [w, air] = await Promise.all([
    owm(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${KEY}`),
    owm(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${KEY}`)
  ]);
  const aqi = air && air.list && air.list[0] ? air.list[0].main.aqi : null;
  const comp = air && air.list && air.list[0] ? air.list[0].components : {};
  const data = {
    name, country, state: state || '',
    temp: Math.round(w.main.temp * 10) / 10,
    feelsLike: Math.round(w.main.feels_like * 10) / 10,
    humidity: w.main.humidity,
    wind: w.wind ? w.wind.speed : 0,
    condition: w.weather && w.weather[0] ? w.weather[0].description : '',
    icon: w.weather && w.weather[0] ? w.weather[0].icon : '',
    aqi, aqiLabel: AQI_LABELS[aqi] || 'Unknown',
    pm25: comp.pm2_5 ?? null, pm10: comp.pm10 ?? null,
    cached: false
  };
  cache.set(key, { time: Date.now(), data });
  return data;
}

async function handleApi(url, res) {
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, host: os.hostname() });
  if (url.pathname !== '/api/weather') return send(res, 404, { error: 'Unknown API route.' });

  const city = (url.searchParams.get('city') || '').trim();
  if (!city) return send(res, 400, { error: 'Please enter a city name.' });
  // Input validation: letters (any language), spaces, comma, dot, hyphen, apostrophe only.
  if (city.length > 60 || !/^[\p{L}\s,.'-]+$/u.test(city)) {
    return send(res, 400, { error: 'City name contains invalid characters.' });
  }
  if (!KEY) return send(res, 500, { error: 'Server is missing its API key (OWM_KEY).' });

  try {
    send(res, 200, await getCity(city));
  } catch (e) {
    send(res, e.status || 500, { error: e.message || 'Unexpected server error.' });
  }
}

function serveStatic(url, res) {
  let file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); } // block path traversal
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'X-Backend': os.hostname() });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(url, res);
  serveStatic(url, res);
}).listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
