// Frontend logic: add cities, call the backend proxy, sort/filter/search, render cards.
// All text is inserted with textContent (never innerHTML) to avoid XSS.
const $ = (id) => document.getElementById(id);
const els = {
  form: $('search-form'), input: $('city-input'), add: $('add-btn'), banner: $('banner'),
  sort: $('sort'), minTemp: $('min-temp'), text: $('text-filter'), clear: $('clear-btn'),
  spinner: $('spinner'), empty: $('empty'), cards: $('cards'), backend: $('backend')
};

let cities = []; // array of city data objects, in the order added
try { cities = JSON.parse(localStorage.getItem('cities') || '[]'); } catch (_) { cities = []; }

const save = () => { try { localStorage.setItem('cities', JSON.stringify(cities)); } catch (_) {} };

function showError(msg) { els.banner.textContent = msg; els.banner.classList.remove('hidden'); }
function hideError() { els.banner.classList.add('hidden'); }

async function addCity(name) {
  hideError();
  if (!name.trim()) return showError('Please enter a city name.');
  els.add.disabled = true; els.spinner.classList.remove('hidden');
  try {
    const res = await fetch('/api/weather?city=' + encodeURIComponent(name.trim()));
    els.backend.textContent = res.headers.get('X-Backend') || '-';
    let data;
    try { data = await res.json(); } catch (_) { throw new Error('Received an invalid response from the server.'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    const exists = cities.findIndex((c) => c.name === data.name && c.country === data.country);
    if (exists >= 0) cities[exists] = data; else cities.push(data);
    save(); els.input.value = ''; render();
  } catch (e) {
    showError(e instanceof TypeError ? 'Cannot reach the server. Check your connection.' : e.message);
  } finally {
    els.add.disabled = false; els.spinner.classList.add('hidden'); els.input.focus();
  }
}

function visibleCities() {
  const min = els.minTemp.value === '' ? -Infinity : Number(els.minTemp.value);
  const q = els.text.value.trim().toLowerCase();
  let list = cities.filter((c) => c.temp >= min && (!q || c.name.toLowerCase().includes(q)));
  const [key, dir] = els.sort.value.split('-');
  const sign = dir === 'desc' ? -1 : 1;
  if (key === 'temp') list.sort((a, b) => sign * (a.temp - b.temp));
  else if (key === 'humidity') list.sort((a, b) => sign * (a.humidity - b.humidity));
  else if (key === 'aqi') list.sort((a, b) => sign * ((a.aqi ?? 99) - (b.aqi ?? 99)));
  else if (key === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function row(dl, label, valueNode) {
  const dt = document.createElement('dt'); dt.textContent = label;
  const dd = document.createElement('dd'); dd.append(valueNode);
  dl.append(dt, dd);
}
const txt = (s) => document.createTextNode(s);

function render() {
  const list = visibleCities();
  els.cards.replaceChildren();
  els.empty.textContent = cities.length ? 'No cities match your filters.' : 'No cities yet. Add one above to get started.';
  els.empty.classList.toggle('hidden', list.length > 0);

  for (const c of list) {
    const card = document.createElement('article'); card.className = 'card';

    const rm = document.createElement('button');
    rm.className = 'remove'; rm.title = 'Remove'; rm.textContent = '×';
    rm.onclick = () => { cities = cities.filter((x) => x !== cities.find((y) => y.name === c.name && y.country === c.country)); save(); render(); };

    const h = document.createElement('h2'); h.textContent = `${c.name}, ${c.country}`;
    const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = c.condition + (c.cached ? ' (cached)' : '');

    const temp = document.createElement('div'); temp.className = 'temp';
    if (c.icon) { const img = document.createElement('img'); img.alt = ''; img.src = `https://openweathermap.org/img/wn/${encodeURIComponent(c.icon)}@2x.png`; temp.append(img); }
    temp.append(txt(`${c.temp}°C`));

    const dl = document.createElement('dl');
    row(dl, 'Feels like', txt(`${c.feelsLike}°C`));
    row(dl, 'Humidity', txt(`${c.humidity}%`));
    row(dl, 'Wind', txt(`${c.wind} m/s`));
    const badge = document.createElement('span'); badge.className = `badge aqi-${c.aqi || 0}`; badge.textContent = c.aqi ? `${c.aqi} - ${c.aqiLabel}` : 'N/A';
    row(dl, 'Air quality', badge);
    if (c.pm25 != null) row(dl, 'PM2.5', txt(`${c.pm25} µg/m³`));

    card.append(rm, h, sub, temp, dl);
    els.cards.append(card);
  }
}

els.form.addEventListener('submit', (e) => { e.preventDefault(); addCity(els.input.value); });
[els.sort, els.minTemp, els.text].forEach((el) => el.addEventListener('input', render));
els.clear.addEventListener('click', () => { cities = []; save(); render(); hideError(); });
render();
