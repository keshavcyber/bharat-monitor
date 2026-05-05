const mapEl = document.querySelector('#map');
const heroTabsEl = document.querySelector('#heroTabs');
const heroListEl = document.querySelector('#heroNewsList');
const tickerStripEl = document.querySelector('#tickerStrip');
const refreshBtn = document.querySelector('#refreshBtn');
const fitIndiaBtn = document.querySelector('#fitIndiaBtn');
const heroEyebrowEl = document.querySelector('#heroEyebrow');
const heroTitleEl = document.querySelector('#heroTitle');
const heroDescriptionEl = document.querySelector('#heroDescription');
const stateProfileSectionEl = document.querySelector('#stateProfileSection');
const profileSectionEyebrowEl = document.querySelector('#profileSectionEyebrow');
const profileSectionTitleEl = document.querySelector('#profileSectionTitle');
const profileSectionSubtitleEl = document.querySelector('#profileSectionSubtitle');
const stateProfileLocationEl = document.querySelector('#stateProfileLocation');
const stateProfileTitleEl = document.querySelector('#stateProfileTitle');
const stateProfileNativeEl = document.querySelector('#stateProfileNative');
const stateProfileTaglineEl = document.querySelector('#stateProfileTagline');
const stateProfileBadgesEl = document.querySelector('#stateProfileBadges');
const stateProfilePopulationEl = document.querySelector('#stateProfilePopulation');
const stateProfilePopulationMetaEl = document.querySelector('#stateProfilePopulationMeta');
const stateProfileAreaEl = document.querySelector('#stateProfileArea');
const stateProfileLiteracyEl = document.querySelector('#stateProfileLiteracy');
const stateProfileLiteracyMetaEl = document.querySelector('#stateProfileLiteracyMeta');
const stateProfileNoteEl = document.querySelector('#stateProfileNote');
const stateProfileArtLabelEl = document.querySelector('#stateProfileArtLabel');
const stateProfileModeLabelEl = document.querySelector('#stateProfileModeLabel');
const scoreScopeEl = document.querySelector('#scoreScope');
const scoreTitleEl = document.querySelector('#scoreTitle');
const scoreGradeEl = document.querySelector('#scoreGrade');
const scoreValueEl = document.querySelector('#scoreValue');
const scoreInfoButtonEl = document.querySelector('#scoreInfoButton');
const scoreMethodEl = document.querySelector('#scoreMethod');
const scoreNoteEl = document.querySelector('#scoreNote');
const scoreUpdatedAtEl = document.querySelector('#scoreUpdatedAt');
const scoreGridEl = document.querySelector('#scoreGrid');
const mapNotice = document.querySelector('#mapNotice');

const INDIA_BOUNDS = [[66.8, 6.0], [98.0, 37.8]];
const INDIA_CAMERA_BOUNDS = [[66.0, 4.8], [99.3, 38.8]];
const INDIA_RESET_PADDING = { top: 58, right: 72, bottom: 74, left: 72 };
const INDIA_RESET_MAX_ZOOM = 2.35;
const BLANK_INDIA_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#05090d' } }
  ]
};

const CAPITALS = {
  'andhra-pradesh': { name: 'Amaravati', lng: 80.52, lat: 16.51 },
  'arunachal-pradesh': { name: 'Itanagar', lng: 93.62, lat: 27.08 },
  assam: { name: 'Dispur', lng: 91.79, lat: 26.14 },
  bihar: { name: 'Patna', lng: 85.14, lat: 25.59 },
  chhattisgarh: { name: 'Raipur', lng: 81.63, lat: 21.25 },
  goa: { name: 'Panaji', lng: 73.83, lat: 15.49 },
  gujarat: { name: 'Gandhinagar', lng: 72.64, lat: 23.22 },
  haryana: { name: 'Chandigarh', lng: 76.78, lat: 30.73 },
  'himachal-pradesh': { name: 'Shimla', lng: 77.17, lat: 31.10 },
  jharkhand: { name: 'Ranchi', lng: 85.32, lat: 23.34 },
  karnataka: { name: 'Bengaluru', lng: 77.59, lat: 12.97 },
  kerala: { name: 'Thiruvananthapuram', lng: 76.94, lat: 8.52 },
  'madhya-pradesh': { name: 'Bhopal', lng: 77.41, lat: 23.26 },
  maharashtra: { name: 'Mumbai', lng: 72.88, lat: 19.08 },
  manipur: { name: 'Imphal', lng: 93.94, lat: 24.82 },
  meghalaya: { name: 'Shillong', lng: 91.89, lat: 25.58 },
  mizoram: { name: 'Aizawl', lng: 92.72, lat: 23.73 },
  nagaland: { name: 'Kohima', lng: 94.11, lat: 25.67 },
  odisha: { name: 'Bhubaneswar', lng: 85.82, lat: 20.30 },
  punjab: { name: 'Chandigarh', lng: 76.78, lat: 30.73 },
  rajasthan: { name: 'Jaipur', lng: 75.79, lat: 26.91 },
  sikkim: { name: 'Gangtok', lng: 88.61, lat: 27.33 },
  'tamil-nadu': { name: 'Chennai', lng: 80.27, lat: 13.08 },
  telangana: { name: 'Hyderabad', lng: 78.49, lat: 17.39 },
  tripura: { name: 'Agartala', lng: 91.29, lat: 23.83 },
  'uttar-pradesh': { name: 'Lucknow', lng: 80.95, lat: 26.85 },
  uttarakhand: { name: 'Dehradun', lng: 78.03, lat: 30.32 },
  'west-bengal': { name: 'Kolkata', lng: 88.36, lat: 22.57 },
  'andaman-nicobar': { name: 'Port Blair', lng: 92.73, lat: 11.62 },
  chandigarh: { name: 'Chandigarh', lng: 76.78, lat: 30.73 },
  'dadra-nagar-haveli-daman-diu': { name: 'Daman', lng: 72.83, lat: 20.40 },
  delhi: { name: 'New Delhi', lng: 77.21, lat: 28.61 },
  'jammu-kashmir': { name: 'Srinagar / Jammu', lng: 74.80, lat: 34.08 },
  ladakh: { name: 'Leh', lng: 77.58, lat: 34.15 },
  lakshadweep: { name: 'Kavaratti', lng: 72.64, lat: 10.57 },
  puducherry: { name: 'Puducherry', lng: 79.81, lat: 11.94 }
};

let map;
let categories = [];
let states = [];
let boundaries = null;
let appConfig = { mapProvider: 'fallback', mapboxToken: '' };
let activeHeroCategory = 'top';
let activeState = '';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function currentCategoryLabel(categoryId) {
  return categories.find((category) => category.id === categoryId)?.label || 'Signals';
}

function stateById(id) {
  return states.find((state) => state.id === id) || null;
}

function renderTabs(container, activeCategory, onClick) {
  container.innerHTML = categories.map((category) => `
    <button class="tab ${category.id === activeCategory ? 'active' : ''}" data-category="${category.id}">
      ${escapeHtml(category.label)}
    </button>
  `).join('');

  container.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => onClick(button.dataset.category));
  });
}

function renderLoading(container, count = 6, cls = 'story') {
  container.innerHTML = Array.from({ length: count }, () => `<article class="${cls} skeleton"></article>`).join('');
}

function renderTickerLoading() {
  tickerStripEl.innerHTML = Array.from({ length: 6 }, () => `
    <div class="ticker-item">
      <span class="ticker-label skeleton" style="width:72px;height:14px;border-radius:4px;"></span>
      <span class="ticker-value skeleton" style="width:88px;height:16px;border-radius:4px;"></span>
    </div>
  `).join('');
}

function renderTicker(data) {
  const updated = formatTime(data.updatedAt);
  tickerStripEl.innerHTML = data.items.map((item, index) => {
    const delta = Number.isFinite(item.delta)
      ? `${item.delta >= 0 ? '▲' : '▼'} ${Math.abs(item.delta).toFixed(2)}%`
      : 'Live';
    const trend = item.trend || 'flat';
    return `
      <div class="ticker-item" title="${escapeHtml(item.source || '')}">
        ${index === 0 ? `<span class="ticker-dot ${trend}">●</span>` : ''}
        <span class="ticker-label">${escapeHtml(item.label)}</span>
        <span class="ticker-value">${escapeHtml(item.value)}</span>
        <span class="ticker-delta ${trend}">${escapeHtml(delta)}</span>
        ${index === data.items.length - 1 ? `<span class="ticker-time">${escapeHtml(updated)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderStateProfile(data) {
  const item = data.item;
  const national = item.scopeLabel === 'All India';
  profileSectionEyebrowEl.textContent = national ? 'National Snapshot' : 'State Profile';
  profileSectionTitleEl.textContent = national ? 'India Overview' : `${item.scopeLabel} Drilldown`;
  profileSectionSubtitleEl.textContent = national
    ? 'Click a state on the map to open a deeper state profile.'
    : `Profile updated ${formatTime(data.updatedAt)}.`;
  stateProfileLocationEl.textContent = item.scopeLabel;
  stateProfileTitleEl.textContent = item.title;
  stateProfileNativeEl.textContent = item.nativeName;
  stateProfileTaglineEl.textContent = item.tagline;
  stateProfilePopulationEl.textContent = item.population;
  stateProfilePopulationMetaEl.textContent = 'Census 2011 baseline';
  stateProfileAreaEl.textContent = item.area;
  stateProfileLiteracyEl.textContent = item.literacy;
  stateProfileLiteracyMetaEl.textContent = 'Census 2011 baseline';
  stateProfileNoteEl.textContent = 'Population and literacy values currently use official Census 2011 baseline figures for clean state-to-state comparison.';
  stateProfileArtLabelEl.textContent = item.artLabel;
  stateProfileModeLabelEl.textContent = national ? 'National' : 'State';
  stateProfileBadgesEl.innerHTML = item.badges.map((badge) => `<span class="state-badge">${escapeHtml(badge)}</span>`).join('');
}

function renderScore(data) {
  scoreScopeEl.textContent = data.scopeLabel;
  scoreTitleEl.textContent = data.title;
  scoreGradeEl.textContent = data.grade;
  scoreGradeEl.className = `score-grade ${data.tone}`;
  scoreValueEl.textContent = Number(data.score).toFixed(1);
  const weights = data.pillars.map((item) => `${escapeHtml(item.label)} ${Number(item.weight).toFixed(0)}%`).join(' | ');
  scoreMethodEl.innerHTML = `
    <strong>Formula</strong>
    <p>${escapeHtml(data.methodology)}</p>
    <strong>Weights</strong>
    <p>${weights}</p>
    <strong>Reliability</strong>
    <p>Score reliability improves when mapped sources become active official/live data feeds. Current source coverage: ${data.confidence.activeModules}/${data.confidence.totalModules} active.</p>
  `;
  scoreNoteEl.textContent = data.note;
  scoreUpdatedAtEl.textContent = `Updated ${formatTime(data.updatedAt)}`;
  scoreGridEl.innerHTML = data.pillars.map((item) => `
    <article class="score-metric pillar-card">
      <div class="score-code ${item.tone}">${escapeHtml(item.code)}</div>
      <div class="score-metric-body">
        <div class="score-metric-head">
          <span>${escapeHtml(item.label)}</span>
          <strong class="${item.tone}">${Number(item.score).toFixed(1)}</strong>
        </div>
        <div class="score-bar" aria-hidden="true">
          <span class="${item.tone}" style="width:${Math.max(4, Math.min(100, item.score))}%"></span>
        </div>
        <div class="pillar-details">
          <span>${escapeHtml(item.statusLabel)}</span>
        </div>
      </div>
    </article>
  `).join('');
}

function renderStories(container, data, emptyText) {
  if (!data.items.length) {
    container.innerHTML = `<div class="empty-state"><h3>Nothing to show here</h3><p>${escapeHtml(emptyText)}</p></div>`;
    return;
  }

  container.innerHTML = data.items.slice(0, 18).map((item) => `
    <article class="story">
      <div class="meta">
        <span>${escapeHtml(item.source || 'Source')}</span>
        <time>${escapeHtml(formatTime(item.publishedAt))}</time>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary || '')}</p>
      <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Open story</a>
    </article>
  `).join('');
}

function stateLabelFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: states.map((state) => ({
      type: 'Feature',
      properties: { id: state.id, name: state.name, region: state.region },
      geometry: { type: 'Point', coordinates: [state.lng, state.lat] }
    }))
  };
}

function selectedCapitalFeatureCollection() {
  const state = stateById(activeState);
  const capital = CAPITALS[activeState];
  if (!state || !capital) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: capital.name, state: state.name },
      geometry: { type: 'Point', coordinates: [capital.lng, capital.lat] }
    }]
  };
}

function selectedFilter() {
  return activeState ? ['==', ['get', 'id'], activeState] : ['==', ['get', 'id'], ''];
}

function syncSelectedMapState() {
  if (!map?.isStyleLoaded()) return;
  map.setFilter('state-selected-fill', selectedFilter());
  const source = map.getSource('selected-capital-src');
  if (source) source.setData(selectedCapitalFeatureCollection());
}

function resetMapView(duration = 0) {
  if (!map) return;
  map.fitBounds(INDIA_BOUNDS, {
    padding: INDIA_RESET_PADDING,
    maxZoom: INDIA_RESET_MAX_ZOOM,
    duration,
    linear: true
  });
}

async function loadHeroFeed(category = activeHeroCategory) {
  activeHeroCategory = category;
  renderTabs(heroTabsEl, activeHeroCategory, loadHeroFeed);
  renderLoading(heroListEl, 5, 'story');

  const state = stateById(activeState);
  const params = new URLSearchParams({ category: activeHeroCategory });
  if (state) params.set('state', state.id);

  try {
    const data = await fetchJson(`/api/news?${params.toString()}`);
    if (state) {
      heroEyebrowEl.textContent = state.name;
      heroTitleEl.textContent = `${currentCategoryLabel(activeHeroCategory)} in ${state.name}`;
      heroDescriptionEl.textContent = 'Strict state-only results. This panel does not fall back to generic All India stories.';
      renderStories(heroListEl, data, `No ${currentCategoryLabel(activeHeroCategory)} stories matched ${state.name}.`);
      return;
    }

    heroEyebrowEl.textContent = 'All India';
    heroTitleEl.textContent = 'National Intelligence Feed';
    heroDescriptionEl.textContent = 'India-wide news and indicators, separate from state drilldowns.';
    renderStories(heroListEl, data, 'No India-wide items matched this category right now.');
  } catch (error) {
    heroListEl.innerHTML = `<div class="empty-state"><h3>Could not load feed</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function loadStateProfile(stateId = '') {
  const params = stateId ? `?state=${encodeURIComponent(stateId)}` : '';
  const data = await fetchJson(`/api/state-profile${params}`);
  renderStateProfile(data);
}

async function loadScore(stateId = '') {
  const params = stateId ? `?state=${encodeURIComponent(stateId)}` : '';
  scoreGridEl.innerHTML = Array.from({ length: 8 }, () => `<article class="score-metric pillar-card skeleton"></article>`).join('');
  try {
    const data = await fetchJson(`/api/score${params}`);
    renderScore(data);
  } catch (error) {
    scoreNoteEl.textContent = error.message;
    scoreGridEl.innerHTML = '';
  }
}

async function loadLiveMetrics() {
  renderTickerLoading();
  try {
    const data = await fetchJson('/api/live-metrics');
    renderTicker(data);
  } catch (error) {
    tickerStripEl.innerHTML = `<div class="ticker-item"><span class="ticker-label">Live metrics</span><span class="ticker-value">Unavailable</span><span class="ticker-delta flat">${escapeHtml(error.message)}</span></div>`;
  }
}

function selectState(stateId, fly = true) {
  activeState = stateId || '';
  const state = stateById(activeState);

  syncSelectedMapState();

  if (fly && state && map) {
    map.flyTo({ center: [state.lng, state.lat], zoom: 5.25, speed: 0.85, curve: 1.2 });
  }

  loadHeroFeed(activeHeroCategory);
  loadStateProfile(activeState);
  loadScore(activeState);
  stateProfileSectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fitIndia() {
  if (!map) return;
  activeState = '';
  syncSelectedMapState();
  resetMapView(850);
  loadHeroFeed(activeHeroCategory);
  loadStateProfile('');
  loadScore('');
}

function addBoundaryLayers() {
  map.addSource('state-boundaries', { type: 'geojson', data: boundaries });
  map.addSource('state-labels-src', { type: 'geojson', data: stateLabelFeatureCollection() });
  map.addSource('selected-capital-src', { type: 'geojson', data: selectedCapitalFeatureCollection() });

  map.addLayer({
    id: 'state-fill',
    type: 'fill',
    source: 'state-boundaries',
    paint: {
      'fill-color': [
        'match',
        ['get', 'region'],
        'South', '#102335',
        'West', '#11283a',
        'North', '#152239',
        'Northwest', '#172338',
        'Central', '#102a32',
        'East', '#112632',
        'Northeast', '#13293c',
        'Islands', '#102833',
        '#101a24'
      ],
      'fill-opacity': 0.96
    }
  });

  map.addLayer({
    id: 'state-hover-fill',
    type: 'fill',
    source: 'state-boundaries',
    filter: ['==', ['get', 'id'], ''],
    paint: { 'fill-color': '#2dd4bf', 'fill-opacity': 0.08 }
  });

  map.addLayer({
    id: 'state-selected-fill',
    type: 'fill',
    source: 'state-boundaries',
    filter: selectedFilter(),
    paint: { 'fill-color': '#39ff88', 'fill-opacity': 0.24 }
  });

  map.addLayer({
    id: 'state-lines-glow',
    type: 'line',
    source: 'state-boundaries',
    paint: { 'line-color': '#39ff88', 'line-width': 4, 'line-opacity': 0.08, 'line-blur': 4 }
  });

  map.addLayer({
    id: 'state-lines',
    type: 'line',
    source: 'state-boundaries',
    paint: {
      'line-color': '#2dd4bf',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 6, 1.6],
      'line-opacity': 0.72
    }
  });

  map.addLayer({
    id: 'state-labels',
    type: 'symbol',
    source: 'state-labels-src',
    minzoom: 4.35,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4.35, 10, 7, 13],
      'text-anchor': 'center'
    },
    paint: { 'text-color': '#eef3ff', 'text-halo-color': '#05070a', 'text-halo-width': 1.8 }
  });

  map.addLayer({
    id: 'selected-capital-halo',
    type: 'circle',
    source: 'selected-capital-src',
    paint: {
      'circle-radius': 12,
      'circle-color': '#39ff88',
      'circle-opacity': 0.18,
      'circle-blur': 0.4
    }
  });

  map.addLayer({
    id: 'selected-capital-dot',
    type: 'circle',
    source: 'selected-capital-src',
    paint: {
      'circle-radius': 5,
      'circle-color': '#f59e0b',
      'circle-stroke-color': '#05070a',
      'circle-stroke-width': 2
    }
  });

  map.addLayer({
    id: 'selected-capital-label',
    type: 'symbol',
    source: 'selected-capital-src',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 13,
      'text-font': ['Open Sans Bold'],
      'text-offset': [0, 1.25],
      'text-anchor': 'top'
    },
    paint: {
      'text-color': '#eef3ff',
      'text-halo-color': '#05070a',
      'text-halo-width': 2
    }
  });

  map.on('click', 'state-fill', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const capital = CAPITALS[feature.properties.id];
    selectState(feature.properties.id);
    new window.mapboxgl.Popup({ closeButton: false, offset: 12 })
      .setLngLat(event.lngLat)
      .setHTML(`
        <div class="map-popup">
          <strong>${escapeHtml(feature.properties.name)}</strong>
          <span>${escapeHtml(feature.properties.region || 'India')}</span>
          ${capital ? `<span>Capital: ${escapeHtml(capital.name)}</span>` : ''}
        </div>
      `)
      .addTo(map);
  });

  map.on('mousemove', 'state-fill', (event) => {
    map.getCanvas().style.cursor = 'pointer';
    const feature = event.features?.[0];
    map.setFilter('state-hover-fill', feature ? ['==', ['get', 'id'], feature.properties.id] : ['==', ['get', 'id'], '']);
  });

  map.on('mouseleave', 'state-fill', () => {
    map.getCanvas().style.cursor = '';
    map.setFilter('state-hover-fill', ['==', ['get', 'id'], '']);
  });
}

function buildMap() {
  if (!window.mapboxgl) {
    mapNotice.textContent = 'Mapbox GL JS did not load. Check your connection.';
    mapNotice.hidden = false;
    return;
  }

  const hasMapboxToken = Boolean(appConfig.mapboxToken);
  if (hasMapboxToken) {
    window.mapboxgl.accessToken = appConfig.mapboxToken;
  }

  mapNotice.hidden = true;
  map = new window.mapboxgl.Map({
    container: mapEl,
    style: BLANK_INDIA_STYLE,
    center: [82.8, 22.2],
    zoom: 2.2,
    minZoom: 2.0,
    maxZoom: 7.2,
    maxBounds: INDIA_CAMERA_BOUNDS,
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    renderWorldCopies: false
  });

  if (!hasMapboxToken) {
    mapNotice.textContent = 'Add MAPBOX_TOKEN in Render environment variables to enable Mapbox rendering.';
    mapNotice.hidden = false;
  }

  map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

  map.on('load', () => {
    map.resize();
    resetMapView(0);
    if (!boundaries?.features?.length) {
      mapNotice.textContent = 'Could not load state boundaries. Refresh and try again.';
      mapNotice.hidden = false;
      return;
    }
    addBoundaryLayers();
  });
}

async function init() {
  [appConfig, categories, states] = await Promise.all([
    fetchJson('/api/config'),
    fetchJson('/api/categories'),
    fetchJson('/api/states')
  ]);
  try {
    boundaries = await fetchJson('/api/boundaries');
  } catch (error) {
    if (String(error.message).includes('404')) {
      throw new Error('The local server is still running an older version. Stop it with Ctrl+C, run npm.cmd run dev again, then hard refresh this page.');
    }
    throw error;
  }
  if (boundaries.error) throw new Error(boundaries.error);

  renderTabs(heroTabsEl, activeHeroCategory, loadHeroFeed);
  buildMap();
  await Promise.all([loadHeroFeed('top'), loadStateProfile(''), loadScore(''), loadLiveMetrics()]);
}

refreshBtn.addEventListener('click', () => {
  loadHeroFeed(activeHeroCategory);
  loadStateProfile(activeState);
  loadScore(activeState);
  loadLiveMetrics();
});

fitIndiaBtn.addEventListener('click', fitIndia);

scoreInfoButtonEl.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = !scoreMethodEl.classList.contains('open');
  scoreMethodEl.classList.toggle('open', open);
  scoreInfoButtonEl.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (event) => {
  if (event.target.closest('.score-info')) return;
  scoreMethodEl.classList.remove('open');
  scoreInfoButtonEl.setAttribute('aria-expanded', 'false');
});

init().catch((error) => {
  mapNotice.textContent = error.message;
  mapNotice.hidden = false;
});
