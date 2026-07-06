/* ==========================================================================
   Bharat Monitor — frontend
   Vanilla JS, no build step. Sections: state, helpers, rendering, map, init.
   ========================================================================== */

const mapEl = document.querySelector('#map');
const heroTabsEl = document.querySelector('#heroTabs');
const heroListEl = document.querySelector('#heroNewsList');
const tickerStripEl = document.querySelector('#tickerStrip');
const refreshBtn = document.querySelector('#refreshBtn');
const fitIndiaBtn = document.querySelector('#fitIndiaBtn');
const stateSelectEl = document.querySelector('#stateSelect');
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
const a11yStatusEl = document.querySelector('#a11yStatus');

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
let mapReady = false;
let boundaryLayersAdded = false;
let hoveredStateId = '';
let lastTickerData = null;
let scoreAnimationFrame = 0;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hoverCapable = window.matchMedia('(hover: hover)');

function announce(message) {
  if (a11yStatusEl) a11yStatusEl.textContent = message;
}

// In-flight request controllers so a rapid tab/state switch can cancel the
// previous request instead of racing it.
const inflight = { news: null, profile: null, score: null };

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function trackedFetch(kind, url) {
  inflight[kind]?.abort();
  const controller = new AbortController();
  inflight[kind] = controller;
  return fetchJson(url, controller.signal);
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeHref(link = '') {
  return /^https?:\/\//i.test(link) ? link : '#';
}

function formatTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 0) return formatTime(value);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

function currentCategoryLabel(categoryId) {
  return categories.find((category) => category.id === categoryId)?.label || 'Signals';
}

function stateById(id) {
  return states.find((state) => state.id === id) || null;
}

function updateDocumentTitle() {
  const state = stateById(activeState);
  document.title = state
    ? `${state.name} — Bharat Monitor`
    : 'Bharat Monitor — India Intelligence Dashboard';
}

/* --------------------------------------------------------------------------
   Tabs (accessible tablist, built once)
   -------------------------------------------------------------------------- */

function buildTabs() {
  heroTabsEl.innerHTML = categories.map((category) => `
    <button class="tab" type="button" role="tab" id="tab-${escapeHtml(category.id)}"
      data-category="${escapeHtml(category.id)}"
      aria-selected="${category.id === activeHeroCategory}"
      aria-controls="heroNewsList"
      tabindex="${category.id === activeHeroCategory ? '0' : '-1'}">
      ${escapeHtml(category.label)}
    </button>
  `).join('');

  heroTabsEl.querySelectorAll('[role="tab"]').forEach((button) => {
    button.addEventListener('click', () => loadHeroFeed(button.dataset.category));
  });

  heroTabsEl.addEventListener('keydown', (event) => {
    const tabs = [...heroTabsEl.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    let next = null;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    if (next) {
      event.preventDefault();
      next.focus();
      next.click();
    }
  });
}

function syncTabs() {
  heroTabsEl.querySelectorAll('[role="tab"]').forEach((button) => {
    const selected = button.dataset.category === activeHeroCategory;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.setAttribute('tabindex', selected ? '0' : '-1');
  });
  heroListEl.setAttribute('aria-labelledby', `tab-${activeHeroCategory}`);
}

/* --------------------------------------------------------------------------
   Skeletons + empty/error states
   -------------------------------------------------------------------------- */

function storySkeleton() {
  return `
    <article class="story skeleton-card" aria-hidden="true">
      <span class="sk sk-meta"></span>
      <span class="sk sk-title"></span>
      <span class="sk sk-title short"></span>
      <span class="sk sk-text"></span>
      <span class="sk sk-text"></span>
    </article>
  `;
}

function renderLoading(container, count = 5) {
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = Array.from({ length: count }, storySkeleton).join('');
}

function renderTickerLoading() {
  tickerStripEl.classList.remove('is-animated');
  tickerStripEl.innerHTML = `<div class="ticker-track">${Array.from({ length: 6 }, () => `
    <div class="ticker-item" aria-hidden="true">
      <span class="sk" style="width:64px;height:11px;"></span>
      <span class="sk" style="width:84px;height:13px;"></span>
    </div>
  `).join('')}</div>`;
}

function emptyStateHtml(title, message, { retryable = false } = {}) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${retryable ? '<button class="retry-btn" type="button">Try again</button>' : ''}
    </div>
  `;
}

function renderFeedError(message) {
  heroListEl.setAttribute('aria-busy', 'false');
  heroListEl.innerHTML = emptyStateHtml('Could not load feed', message, { retryable: true });
  heroListEl.querySelector('.retry-btn')?.addEventListener('click', () => loadHeroFeed(activeHeroCategory));
  announce('The news feed could not be loaded.');
}

/* --------------------------------------------------------------------------
   Ticker
   -------------------------------------------------------------------------- */

function tickerItemHtml(item, index, total, updated) {
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
      ${index === total - 1 ? `<span class="ticker-time">${escapeHtml(updated)}</span>` : ''}
    </div>
  `;
}

function renderTicker(data) {
  lastTickerData = data;
  const updated = formatTime(data.updatedAt);
  const itemsHtml = data.items
    .map((item, index) => tickerItemHtml(item, index, data.items.length, updated))
    .join('');

  tickerStripEl.classList.remove('is-animated');
  tickerStripEl.innerHTML = `<div class="ticker-track">${itemsHtml}</div>`;

  // Marquee only where it can be paused: hover-capable pointers pause on
  // hover, keyboards pause via the focusable strip. Touch-only devices keep
  // the swipe-scrollable strip instead.
  if (prefersReducedMotion.matches || !hoverCapable.matches) return;

  // If the strip overflows, duplicate the content and scroll it continuously.
  // Layout reads are synchronous, so this works even in a hidden tab.
  const track = tickerStripEl.querySelector('.ticker-track');
  if (!track) return;
  const contentWidth = track.scrollWidth;
  if (contentWidth <= tickerStripEl.clientWidth) return;
  track.insertAdjacentHTML('beforeend', `<div style="display: contents" aria-hidden="true">${itemsHtml}</div>`);
  tickerStripEl.style.setProperty('--marquee-duration', `${Math.max(24, Math.round(contentWidth / 32))}s`);
  tickerStripEl.classList.add('is-animated');
}

let tickerResizeTimer = 0;
window.addEventListener('resize', () => {
  if (!lastTickerData) return;
  clearTimeout(tickerResizeTimer);
  tickerResizeTimer = setTimeout(() => renderTicker(lastTickerData), 200);
});

/* --------------------------------------------------------------------------
   State profile
   -------------------------------------------------------------------------- */

function renderStateProfile(data) {
  const item = data.item;
  const national = item.scopeLabel === 'All India';
  profileSectionEyebrowEl.textContent = national ? 'National Snapshot' : 'State Profile';
  profileSectionTitleEl.textContent = national ? 'India Overview' : `${item.scopeLabel} Drilldown`;
  profileSectionSubtitleEl.textContent = national
    ? 'Click a state on the map or use the state selector to open a deeper profile.'
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
  stateProfileBadgesEl.innerHTML = item.badges
    .map((badge, index) => `<span class="state-badge" style="--i:${index}">${escapeHtml(badge)}</span>`)
    .join('');
}

/* --------------------------------------------------------------------------
   Readiness score
   -------------------------------------------------------------------------- */

function animateScoreValue(target) {
  cancelAnimationFrame(scoreAnimationFrame);
  // Hidden tabs never fire rAF — set the value directly so it is correct the
  // moment the tab becomes visible.
  if (prefersReducedMotion.matches || document.hidden) {
    scoreValueEl.textContent = target.toFixed(1);
    return;
  }
  const from = Number.parseFloat(scoreValueEl.textContent);
  const start = Number.isFinite(from) ? from : 0;
  const startTime = performance.now();
  const duration = 800;
  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - (1 - progress) ** 3;
    scoreValueEl.textContent = (start + (target - start) * eased).toFixed(1);
    if (progress < 1) scoreAnimationFrame = requestAnimationFrame(step);
  };
  scoreAnimationFrame = requestAnimationFrame(step);
}

function renderScore(data) {
  scoreScopeEl.textContent = data.scopeLabel;
  scoreTitleEl.textContent = data.title;
  scoreGradeEl.textContent = data.grade;
  scoreGradeEl.className = `score-grade ${data.tone}`;
  animateScoreValue(Number(data.score));
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
  scoreGridEl.setAttribute('aria-busy', 'false');
  announce(`${data.scopeLabel} readiness score ${Number(data.score).toFixed(1)} out of 100, grade ${data.grade}.`);
  scoreGridEl.innerHTML = data.pillars.map((item, index) => `
    <article class="score-metric pillar-card" style="--i:${index}">
      <div class="score-code ${item.tone}">${escapeHtml(item.code)}</div>
      <div class="score-metric-body">
        <div class="score-metric-head">
          <span>${escapeHtml(item.label)}</span>
          <strong class="${item.tone}">${Number(item.score).toFixed(1)}</strong>
        </div>
        <div class="score-bar" aria-hidden="true">
          <span class="${item.tone}" data-width="${Math.max(4, Math.min(100, item.score))}"></span>
        </div>
        <div class="pillar-details">
          <span>${escapeHtml(item.statusLabel)}</span>
        </div>
      </div>
    </article>
  `).join('');

  // Bars start at width 0 and transition to their value on the next frame.
  const fillBars = () => {
    scoreGridEl.querySelectorAll('.score-bar span').forEach((bar) => {
      bar.style.width = `${bar.dataset.width}%`;
    });
  };
  if (prefersReducedMotion.matches || document.hidden) {
    fillBars();
  } else {
    requestAnimationFrame(() => {
      scoreGridEl.querySelector('.score-bar span')?.offsetWidth; // flush layout so the transition runs
      fillBars();
    });
  }
}

/* --------------------------------------------------------------------------
   News stories
   -------------------------------------------------------------------------- */

function renderStories(container, data, emptyText) {
  container.setAttribute('aria-busy', 'false');
  if (!data.items.length) {
    container.innerHTML = emptyStateHtml('Nothing to show here', emptyText);
    announce('No stories found for this view.');
    return;
  }
  announce(`${Math.min(data.items.length, 18)} stories loaded.`);

  container.innerHTML = data.items.slice(0, 18).map((item, index) => `
    <article class="story" style="--i:${index}">
      <div class="meta">
        <span>${escapeHtml(item.source || 'Source')}</span>
        <time datetime="${escapeHtml(item.publishedAt || '')}" title="${escapeHtml(formatTime(item.publishedAt))}">
          ${escapeHtml(relativeTime(item.publishedAt))}
        </time>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary || '')}</p>
      <a class="story-link" href="${escapeHtml(safeHref(item.link))}" target="_blank" rel="noopener">Open story</a>
    </article>
  `).join('');
}

/* --------------------------------------------------------------------------
   Data loading
   -------------------------------------------------------------------------- */

async function loadHeroFeed(category = activeHeroCategory) {
  activeHeroCategory = category;
  syncTabs();
  renderLoading(heroListEl, 5);

  const state = stateById(activeState);
  const params = new URLSearchParams({ category: activeHeroCategory });
  if (state) params.set('state', state.id);

  try {
    const data = await trackedFetch('news', `/api/news?${params.toString()}`);
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
    if (isAbortError(error)) return;
    renderFeedError(error.message);
  }
}

async function loadStateProfile(stateId = '') {
  const params = stateId ? `?state=${encodeURIComponent(stateId)}` : '';
  try {
    const data = await trackedFetch('profile', `/api/state-profile${params}`);
    renderStateProfile(data);
  } catch (error) {
    if (isAbortError(error)) return;
    profileSectionSubtitleEl.textContent = `Could not load the profile right now (${error.message}). Try Refresh.`;
  }
}

async function loadScore(stateId = '') {
  const params = stateId ? `?state=${encodeURIComponent(stateId)}` : '';
  scoreGridEl.setAttribute('aria-busy', 'true');
  scoreGridEl.innerHTML = Array.from({ length: 8 }, (_, index) => `
    <article class="score-metric pillar-card skeleton-card" style="--i:${index}" aria-hidden="true">
      <span class="sk" style="width:38px;height:38px;border-radius:9px;"></span>
      <div class="score-metric-body">
        <span class="sk" style="width:70%;height:12px;"></span>
        <span class="sk" style="width:100%;height:7px;margin-top:12px;border-radius:999px;"></span>
        <span class="sk" style="width:40%;height:10px;margin-top:12px;"></span>
      </div>
    </article>
  `).join('');
  try {
    const data = await trackedFetch('score', `/api/score${params}`);
    renderScore(data);
  } catch (error) {
    if (isAbortError(error)) return;
    scoreNoteEl.textContent = error.message;
    scoreGridEl.setAttribute('aria-busy', 'false');
    scoreGridEl.innerHTML = emptyStateHtml('Could not load the score', 'The readiness service did not respond. Use Refresh to try again.');
  }
}

async function loadLiveMetrics() {
  renderTickerLoading();
  try {
    const data = await fetchJson('/api/live-metrics');
    renderTicker(data);
  } catch (error) {
    lastTickerData = null; // keep resize/motion listeners from resurrecting stale data
    tickerStripEl.classList.remove('is-animated');
    tickerStripEl.innerHTML = `<div class="ticker-track"><div class="ticker-item"><span class="ticker-label">Live metrics</span><span class="ticker-value">Unavailable</span><span class="ticker-delta flat">${escapeHtml(error.message)}</span></div></div>`;
  }
}

/* --------------------------------------------------------------------------
   State selection
   -------------------------------------------------------------------------- */

function populateStateSelect() {
  const sorted = [...states].sort((a, b) => a.name.localeCompare(b.name));
  for (const state of sorted) {
    const option = document.createElement('option');
    option.value = state.id;
    option.textContent = state.name;
    stateSelectEl.append(option);
  }
}

function syncStateSelect() {
  stateSelectEl.value = activeState;
}

function selectState(stateId, { fly = true, scroll = true } = {}) {
  activeState = stateId || '';
  const state = stateById(activeState);

  syncSelectedMapState();
  syncStateSelect();
  updateDocumentTitle();

  if (fly && state && map) {
    if (prefersReducedMotion.matches) {
      map.jumpTo({ center: [state.lng, state.lat], zoom: 5.25 });
    } else {
      map.flyTo({ center: [state.lng, state.lat], zoom: 5.25, speed: 0.85, curve: 1.2 });
    }
  }

  loadHeroFeed(activeHeroCategory);
  loadStateProfile(activeState);
  loadScore(activeState);
  if (scroll) {
    stateProfileSectionEl.scrollIntoView({
      behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    });
  }
}

function fitIndia() {
  activeState = '';
  syncSelectedMapState();
  syncStateSelect();
  updateDocumentTitle();
  if (map) resetMapView(prefersReducedMotion.matches ? 0 : 850);
  loadHeroFeed(activeHeroCategory);
  loadStateProfile('');
  loadScore('');
}

/* --------------------------------------------------------------------------
   Map
   -------------------------------------------------------------------------- */

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
  if (!map?.isStyleLoaded() || !boundaryLayersAdded) return;
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
    new window.mapboxgl.Popup({ closeButton: false, offset: 12, maxWidth: '280px' })
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
    const feature = event.features?.[0];
    const id = feature?.properties.id || '';
    if (id === hoveredStateId) return;
    hoveredStateId = id;
    map.getCanvas().style.cursor = id ? 'pointer' : '';
    map.setFilter('state-hover-fill', ['==', ['get', 'id'], id]);
  });

  map.on('mouseleave', 'state-fill', () => {
    hoveredStateId = '';
    map.getCanvas().style.cursor = '';
    map.setFilter('state-hover-fill', ['==', ['get', 'id'], '']);
  });
}

function tryAddBoundaryLayers() {
  if (!map || !mapReady || boundaryLayersAdded) return;
  if (!boundaries?.features?.length) return;
  addBoundaryLayers();
  boundaryLayersAdded = true;
}

function showMapNotice(message) {
  mapNotice.textContent = message;
  mapNotice.hidden = false;
}

function buildMap(boundariesPromise) {
  if (!window.mapboxgl) {
    showMapNotice('Mapbox GL JS did not load. Check your connection.');
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
    showMapNotice('Add MAPBOX_TOKEN in Render environment variables to enable Mapbox rendering.');
  }

  map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

  map.on('load', () => {
    mapReady = true;
    map.resize();
    resetMapView(0);
    tryAddBoundaryLayers();
  });

  boundariesPromise.then((data) => {
    if (data?.error) {
      showMapNotice(data.error);
      return;
    }
    boundaries = data;
    if (!boundaries?.features?.length) {
      showMapNotice('Could not load state boundaries. Refresh and try again.');
      return;
    }
    tryAddBoundaryLayers();
  });
}

/* --------------------------------------------------------------------------
   Refresh
   -------------------------------------------------------------------------- */

let refreshing = false;

async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  // aria-disabled + re-entry guard instead of .disabled, which would blur a
  // keyboard user's focus off the button.
  refreshBtn.classList.add('is-loading');
  refreshBtn.setAttribute('aria-disabled', 'true');
  try {
    await Promise.allSettled([
      loadHeroFeed(activeHeroCategory),
      loadStateProfile(activeState),
      loadScore(activeState),
      loadLiveMetrics()
    ]);
    announce('Dashboard refreshed.');
  } finally {
    refreshBtn.classList.remove('is-loading');
    refreshBtn.setAttribute('aria-disabled', 'false');
    refreshing = false;
  }
}

/* --------------------------------------------------------------------------
   Init + events
   -------------------------------------------------------------------------- */

async function init() {
  // Boundaries are the heaviest payload — fetch them in parallel and let the
  // rest of the dashboard render without waiting.
  const boundariesPromise = fetchJson('/api/boundaries')
    .then((data) => (data.error ? { error: data.error } : data))
    .catch((error) => ({
      error: String(error.message).includes('404')
        ? 'The local server is still running an older version. Stop it with Ctrl+C, run npm run dev again, then hard refresh this page.'
        : `Could not load state boundaries (${error.message}).`
    }));

  [appConfig, categories, states] = await Promise.all([
    fetchJson('/api/config'),
    fetchJson('/api/categories'),
    fetchJson('/api/states')
  ]);

  buildTabs();
  syncTabs();
  populateStateSelect();
  buildMap(boundariesPromise);
  await Promise.all([loadHeroFeed('top'), loadStateProfile(''), loadScore(''), loadLiveMetrics()]);
}

refreshBtn.addEventListener('click', refreshAll);

fitIndiaBtn.addEventListener('click', fitIndia);

stateSelectEl.addEventListener('change', () => {
  const value = stateSelectEl.value;
  if (!value) {
    fitIndia();
    return;
  }
  selectState(value);
});

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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && scoreMethodEl.classList.contains('open')) {
    scoreMethodEl.classList.remove('open');
    scoreInfoButtonEl.setAttribute('aria-expanded', 'false');
    scoreInfoButtonEl.focus();
  }
});

prefersReducedMotion.addEventListener?.('change', () => {
  if (lastTickerData) renderTicker(lastTickerData);
});

init().catch((error) => {
  showMapNotice(error.message);
});
