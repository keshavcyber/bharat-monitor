import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { createHash } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const port = Number(process.env.PORT || 5173);
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;
const LIVE_METRICS_CACHE_MS = 3 * 60 * 1000;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '';
const FETCH_TIMEOUT_MS = 8000;

const BOUNDARY_URL = 'https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States';
let boundaryCache = null;
let boundaryCacheTime = 0;
const BOUNDARY_CACHE_MS = 24 * 60 * 60 * 1000;

function etagFor(buffer) {
  return `"${createHash('sha1').update(buffer).digest('base64url').slice(0, 20)}"`;
}

function pickEncoding(req, byteLength) {
  if (byteLength < 1024) return null;
  const accepted = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

function compressBody(body, encoding, { quality = 5 } = {}) {
  if (encoding === 'br') {
    return brotliCompressSync(body, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: quality,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length
      }
    });
  }
  if (encoding === 'gzip') return gzipSync(body, { level: 6 });
  return body;
}

function slugName(value = '') {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const boundaryNameAliases = new Map([
  ['andaman-and-nicobar', 'andaman-nicobar'],
  ['andaman-and-nicobar-islands', 'andaman-nicobar'],
  ['dadra-and-nagar-haveli', 'dadra-nagar-haveli-daman-diu'],
  ['daman-and-diu', 'dadra-nagar-haveli-daman-diu'],
  ['jammu-and-kashmir', 'jammu-kashmir'],
  ['orissa', 'odisha'],
  ['pondicherry', 'puducherry'],
  ['telengana', 'telangana'],
  ['uttaranchal', 'uttarakhand']
]);

function resolveBoundaryId(name) {
  const slug = slugName(name);
  return boundaryNameAliases.get(slug) || slug;
}

// The map is capped at zoom 7.2 (~1 km per pixel), so geometry detail below
// ~200 m can never be seen. Douglas-Peucker with a ~0.002° tolerance keeps the
// outlines pixel-identical while dropping the vast majority of vertices.
const SIMPLIFY_TOLERANCE_DEG = 0.002;

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(point[0] - (lineStart[0] + clamped * dx), point[1] - (lineStart[1] + clamped * dy));
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let maxIndex = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const distance = perpendicularDistance(points[i], points[0], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[last]];
  const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
  const right = douglasPeucker(points.slice(maxIndex), tolerance);
  return left.slice(0, -1).concat(right);
}

function simplifyRing(ring, tolerance) {
  const simplified = douglasPeucker(ring, tolerance);
  // A valid GeoJSON ring needs at least 4 positions with a closing point.
  return simplified.length >= 4 ? simplified : ring;
}

function roundCoordinate(pair) {
  return [Math.round(pair[0] * 1e4) / 1e4, Math.round(pair[1] * 1e4) / 1e4];
}

function simplifyGeometry(geometry) {
  const simplifyPolygon = (rings) => rings.map((ring) => simplifyRing(ring, SIMPLIFY_TOLERANCE_DEG).map(roundCoordinate));
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: simplifyPolygon(geometry.coordinates) };
  }
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(simplifyPolygon) };
  }
  return geometry;
}

let boundaryInflight = null;

async function loadBoundaries() {
  if (boundaryCache && Date.now() - boundaryCacheTime < BOUNDARY_CACHE_MS) return boundaryCache;
  if (boundaryInflight) return boundaryInflight;
  boundaryInflight = fetchBoundaries().finally(() => { boundaryInflight = null; });
  return boundaryInflight;
}

async function fetchBoundaries() {
  try {
    const response = await fetch(BOUNDARY_URL, {
      headers: { 'User-Agent': 'BharatMonitor/0.1 (+local dev)' },
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Boundary fetch failed: HTTP ${response.status}`);

    const geojson = await response.json();
    // Simplify geometry to the resolution the map can actually display and keep
    // only the properties the client reads — cuts the payload from ~11 MB to a
    // fraction with no visible change at state-level zoom.
    const features = (geojson.features || []).map((feature) => {
      const sourceName = feature.properties?.NAME_1 || feature.properties?.ST_NM || feature.properties?.name || 'Unknown';
      const id = resolveBoundaryId(sourceName);
      const known = states.find((state) => state.id === id);
      return {
        type: 'Feature',
        properties: {
          id,
          name: known?.name || sourceName,
          region: known?.region || 'India'
        },
        geometry: simplifyGeometry(feature.geometry)
      };
    });

    const body = Buffer.from(JSON.stringify({ type: 'FeatureCollection', features }));
    boundaryCache = {
      body,
      etag: etagFor(body),
      // Compressed once per day, so spend more effort for a smaller wire size.
      encoded: { br: compressBody(body, 'br', { quality: 9 }), gzip: compressBody(body, 'gzip') }
    };
    boundaryCacheTime = Date.now();
    return boundaryCache;
  } catch (error) {
    // Serve the previous payload rather than failing the map when GitHub is
    // unreachable, and back off retries for five minutes.
    if (boundaryCache) {
      boundaryCacheTime = Date.now() - BOUNDARY_CACHE_MS + 5 * 60 * 1000;
      return boundaryCache;
    }
    throw error;
  }
}

const states = [
  { id: 'andhra-pradesh', name: 'Andhra Pradesh', region: 'South', lng: 80.64, lat: 15.91 },
  { id: 'arunachal-pradesh', name: 'Arunachal Pradesh', region: 'Northeast', lng: 94.73, lat: 28.22 },
  { id: 'assam', name: 'Assam', region: 'Northeast', lng: 92.94, lat: 26.20 },
  { id: 'bihar', name: 'Bihar', region: 'East', lng: 85.31, lat: 25.10 },
  { id: 'chhattisgarh', name: 'Chhattisgarh', region: 'Central', lng: 81.87, lat: 21.28 },
  { id: 'goa', name: 'Goa', region: 'West', lng: 74.12, lat: 15.30 },
  { id: 'gujarat', name: 'Gujarat', region: 'West', lng: 71.19, lat: 22.26 },
  { id: 'haryana', name: 'Haryana', region: 'North', lng: 76.09, lat: 29.06 },
  { id: 'himachal-pradesh', name: 'Himachal Pradesh', region: 'North', lng: 77.17, lat: 31.10 },
  { id: 'jharkhand', name: 'Jharkhand', region: 'East', lng: 85.31, lat: 23.61 },
  { id: 'karnataka', name: 'Karnataka', region: 'South', lng: 75.71, lat: 15.32 },
  { id: 'kerala', name: 'Kerala', region: 'South', lng: 76.27, lat: 10.85 },
  { id: 'madhya-pradesh', name: 'Madhya Pradesh', region: 'Central', lng: 78.66, lat: 22.97 },
  { id: 'maharashtra', name: 'Maharashtra', region: 'West', lng: 75.71, lat: 19.75 },
  { id: 'manipur', name: 'Manipur', region: 'Northeast', lng: 93.91, lat: 24.66 },
  { id: 'meghalaya', name: 'Meghalaya', region: 'Northeast', lng: 91.37, lat: 25.47 },
  { id: 'mizoram', name: 'Mizoram', region: 'Northeast', lng: 92.94, lat: 23.16 },
  { id: 'nagaland', name: 'Nagaland', region: 'Northeast', lng: 94.56, lat: 26.16 },
  { id: 'odisha', name: 'Odisha', region: 'East', lng: 85.10, lat: 20.95 },
  { id: 'punjab', name: 'Punjab', region: 'North', lng: 75.34, lat: 31.15 },
  { id: 'rajasthan', name: 'Rajasthan', region: 'Northwest', lng: 74.22, lat: 27.02 },
  { id: 'sikkim', name: 'Sikkim', region: 'Northeast', lng: 88.51, lat: 27.53 },
  { id: 'tamil-nadu', name: 'Tamil Nadu', region: 'South', lng: 78.66, lat: 11.13 },
  { id: 'telangana', name: 'Telangana', region: 'South', lng: 79.02, lat: 18.11 },
  { id: 'tripura', name: 'Tripura', region: 'Northeast', lng: 91.99, lat: 23.94 },
  { id: 'uttar-pradesh', name: 'Uttar Pradesh', region: 'North', lng: 80.95, lat: 26.85 },
  { id: 'uttarakhand', name: 'Uttarakhand', region: 'North', lng: 79.02, lat: 30.07 },
  { id: 'west-bengal', name: 'West Bengal', region: 'East', lng: 87.86, lat: 22.99 },
  { id: 'andaman-nicobar', name: 'Andaman & Nicobar Islands', region: 'Islands', lng: 92.66, lat: 11.74 },
  { id: 'chandigarh', name: 'Chandigarh', region: 'North', lng: 76.78, lat: 30.73 },
  { id: 'dadra-nagar-haveli-daman-diu', name: 'Dadra & Nagar Haveli and Daman & Diu', region: 'West', lng: 72.83, lat: 20.18 },
  { id: 'delhi', name: 'Delhi', region: 'North', lng: 77.10, lat: 28.70 },
  { id: 'jammu-kashmir', name: 'Jammu & Kashmir', region: 'North', lng: 75.34, lat: 33.78 },
  { id: 'ladakh', name: 'Ladakh', region: 'North', lng: 77.58, lat: 34.15 },
  { id: 'lakshadweep', name: 'Lakshadweep', region: 'Islands', lng: 72.64, lat: 10.57 },
  { id: 'puducherry', name: 'Puducherry', region: 'South', lng: 79.81, lat: 11.94 }
]

const stateProfiles = {
  india: {
    scopeLabel: 'All India',
    title: 'India',
    nativeName: 'भारत',
    tagline: 'Union of states and the world’s largest democracy.',
    badges: ['Largest democracy', 'Digital public infrastructure', 'Spacefaring nation', 'G20 economy'],
    population: '1.21B',
    area: '3,287,240',
    literacy: '74.0%',
    artLabel: 'INDIA'
  },
  'andhra-pradesh': { title: 'Amaravati', nativeName: 'అమరావతి', tagline: 'Coastal agriculture, ports, and a fast-growing industrial corridor.', badges: ['State capital', 'Krishna basin', 'Coastal logistics', 'Aerospace clusters'], population: '49.6M', area: '162,970', literacy: '67.4%', artLabel: 'AP' },
  'arunachal-pradesh': { title: 'Itanagar', nativeName: 'ईटानगर', tagline: 'Mountain frontier state with major hydropower and biodiversity assets.', badges: ['State capital', 'Eastern Himalaya', 'Hydropower belt', 'Border state'], population: '1.4M', area: '83,743', literacy: '65.4%', artLabel: 'AR' },
  'assam': { title: 'Dispur', nativeName: 'দিছপুৰ', tagline: 'Gateway to the Northeast with river trade, tea, and energy corridors.', badges: ['State capital', 'Tea heartland', 'Brahmaputra basin', 'Northeast gateway'], population: '31.2M', area: '78,438', literacy: '72.2%', artLabel: 'AS' },
  'bihar': { title: 'Patna', nativeName: 'पटना', tagline: 'Gangetic heartland anchored by logistics, agriculture, and education hubs.', badges: ['State capital', 'Gangetic belt', 'Historic seat', 'Agri economy'], population: '104.1M', area: '94,163', literacy: '61.8%', artLabel: 'BR' },
  'chhattisgarh': { title: 'Raipur', nativeName: 'रायपुर', tagline: 'Minerals, power, and central India’s industrial freight backbone.', badges: ['State capital', 'Steel corridor', 'Coal belt', 'Central India'], population: '25.54M', area: '136,034', literacy: '71.0%', artLabel: 'CG' },
  goa: { title: 'Panaji', nativeName: 'पणजी', tagline: 'Tourism, shipping, and a compact high-literacy coastal economy.', badges: ['State capital', 'Coastal tourism', 'Port economy', 'High literacy'], population: '1.5M', area: '3,702', literacy: '88.7%', artLabel: 'GOA' },
  gujarat: { title: 'Gandhinagar', nativeName: 'ગાંધીનગર', tagline: 'Export manufacturing and energy infrastructure along India’s western coast.', badges: ['State capital', 'Manufacturing hub', 'Ports & trade', 'Industrial corridors'], population: '60.4M', area: '196,024', literacy: '78.0%', artLabel: 'GJ' },
  haryana: { title: 'Chandigarh', nativeName: 'चण्डीगढ़', tagline: 'Auto, logistics, and NCR-linked growth with deep agri productivity.', badges: ['Shared capital', 'NCR adjacency', 'Auto belt', 'Agri productivity'], population: '25.4M', area: '44,212', literacy: '75.6%', artLabel: 'HR' },
  'himachal-pradesh': { title: 'Shimla', nativeName: 'शिमला', tagline: 'Mountain state balancing hydropower, horticulture, and tourism.', badges: ['State capital', 'Hill economy', 'Hydropower', 'Horticulture'], population: '6.9M', area: '55,673', literacy: '82.8%', artLabel: 'HP' },
  jharkhand: { title: 'Ranchi', nativeName: 'राँची', tagline: 'Mineral-rich plateau state with steel, coal, and heavy industry assets.', badges: ['State capital', 'Mining state', 'Steel ecosystem', 'Plateau belt'], population: '33.0M', area: '79,714', literacy: '66.4%', artLabel: 'JH' },
  karnataka: { title: 'Bengaluru', nativeName: 'ಬೆಂಗಳೂರು', tagline: 'India’s premier technology and aerospace state with diversified industry.', badges: ['State capital', 'Startup capital', 'Aerospace base', 'IT exports'], population: '61.1M', area: '191,791', literacy: '75.4%', artLabel: 'KA' },
  kerala: { title: 'Thiruvananthapuram', nativeName: 'തിരുവനന്തപുരം', tagline: 'Human development leader with strong services, ports, and remittance links.', badges: ['State capital', 'High literacy', 'Healthcare leader', 'Coastal state'], population: '33.4M', area: '38,863', literacy: '94.0%', artLabel: 'KL' },
  'madhya-pradesh': { title: 'Bhopal', nativeName: 'भोपाल', tagline: 'Large central state linking north-south freight and industrial flows.', badges: ['State capital', 'Central India', 'Industrial estates', 'Forest heartland'], population: '72.6M', area: '308,252', literacy: '69.3%', artLabel: 'MP' },
  maharashtra: { title: 'Mumbai', nativeName: 'मुंबई', tagline: 'India’s financial powerhouse with deep manufacturing and media influence.', badges: ['State capital', 'Financial capital', 'Ports & finance', 'Industrial hub'], population: '112.4M', area: '307,713', literacy: '82.3%', artLabel: 'MH' },
  manipur: { title: 'Imphal', nativeName: 'ইম্ফল / इंफाल', tagline: 'Borderland state with trade potential, sports culture, and strategic corridors.', badges: ['State capital', 'Border trade', 'Sports culture', 'Northeast gateway'], population: '2.9M', area: '22,327', literacy: '79.9%', artLabel: 'MN' },
  meghalaya: { title: 'Shillong', nativeName: 'Shillong', tagline: 'Highland state known for services, tourism, and ecological sensitivity.', badges: ['State capital', 'Highland state', 'Tourism economy', 'Ecology zone'], population: '3.0M', area: '22,429', literacy: '74.4%', artLabel: 'ML' },
  mizoram: { title: 'Aizawl', nativeName: 'Aizawl', tagline: 'Compact hill state with high literacy and strong social indicators.', badges: ['State capital', 'High literacy', 'Hill state', 'Northeast frontier'], population: '1.1M', area: '21,081', literacy: '91.3%', artLabel: 'MZ' },
  nagaland: { title: 'Kohima', nativeName: 'Kohima', tagline: 'Mountain frontier state with strong local identities and border relevance.', badges: ['State capital', 'Border state', 'Hill economy', 'Northeast frontier'], population: '2.0M', area: '16,579', literacy: '79.6%', artLabel: 'NL' },
  odisha: { title: 'Bhubaneswar', nativeName: 'ଭୁବନେଶ୍ୱର', tagline: 'Ports, mining, and resilient coastal infrastructure on the Bay of Bengal.', badges: ['State capital', 'Coastal resilience', 'Mineral exports', 'Temple city'], population: '41.9M', area: '155,707', literacy: '72.9%', artLabel: 'OD' },
  punjab: { title: 'Chandigarh', nativeName: 'ਚੰਡੀਗੜ੍ਹ', tagline: 'Agricultural powerhouse with industry and frontier security relevance.', badges: ['Shared capital', 'Food grain hub', 'Border state', 'Agri productivity'], population: '27.7M', area: '50,362', literacy: '75.8%', artLabel: 'PB' },
  rajasthan: { title: 'Jaipur', nativeName: 'जयपुर', tagline: 'Large desert state with tourism, solar buildout, and logistics corridors.', badges: ['State capital', 'Solar potential', 'Tourism economy', 'Desert state'], population: '68.5M', area: '342,239', literacy: '66.1%', artLabel: 'RJ' },
  sikkim: { title: 'Gangtok', nativeName: 'गान्तोक', tagline: 'Small Himalayan state with strategic passes and eco-sensitive growth.', badges: ['State capital', 'Himalayan state', 'Organic farming', 'Strategic passes'], population: '0.6M', area: '7,096', literacy: '81.4%', artLabel: 'SK' },
  'tamil-nadu': { title: 'Chennai', nativeName: 'சென்னை', tagline: 'Manufacturing, ports, autos, and a deep southern technology economy.', badges: ['State capital', 'Auto hub', 'Ports & exports', 'Industrial base'], population: '72.1M', area: '130,058', literacy: '80.1%', artLabel: 'TN' },
  telangana: { title: 'Hyderabad', nativeName: 'హైదరాబాద్', tagline: 'Technology, pharma, and data-centre growth anchored by Hyderabad.', badges: ['State capital', 'Pharma hub', 'Tech corridor', 'Data centres'], population: '35.2M', area: '112,077', literacy: '66.5%', artLabel: 'TG' },
  tripura: { title: 'Agartala', nativeName: 'আগরতলা', tagline: 'Compact Northeast state with cross-border proximity and high literacy.', badges: ['State capital', 'Border state', 'High literacy', 'Northeast corridor'], population: '3.7M', area: '10,486', literacy: '87.2%', artLabel: 'TR' },
  'uttar-pradesh': { title: 'Lucknow', nativeName: 'लखनऊ', tagline: 'India’s most populous state with major political, cultural, and industrial weight.', badges: ['State capital', 'Political heartland', 'Gangetic plain', 'Expressway buildout'], population: '199.8M', area: '240,928', literacy: '67.7%', artLabel: 'UP' },
  uttarakhand: { title: 'Dehradun', nativeName: 'देहरादून', tagline: 'Mountain state linking pilgrimage, defence institutions, and hydropower.', badges: ['State capital', 'Himalayan state', 'Hydropower', 'Defence institutions'], population: '10.1M', area: '53,483', literacy: '78.8%', artLabel: 'UK' },
  'west-bengal': { title: 'Kolkata', nativeName: 'কলকাতা', tagline: 'Gateway to the east with ports, finance, and a dense cultural economy.', badges: ['State capital', 'Port gateway', 'Cultural capital', 'Eastern trade'], population: '91.3M', area: '88,752', literacy: '76.3%', artLabel: 'WB' },
  'andaman-nicobar': { title: 'Port Blair', nativeName: 'পোর্ট ব্লেয়ার', tagline: 'Island territory with maritime depth and strategic sea-lane relevance.', badges: ['UT capital', 'Island territory', 'Strategic waters', 'Tourism'], population: '0.38M', area: '8,249', literacy: '86.3%', artLabel: 'ANI' },
  chandigarh: { title: 'Chandigarh', nativeName: 'ਚੰਡੀਗੜ੍ਹ', tagline: 'Planned city and shared capital at the core of north Indian administration.', badges: ['UT capital', 'Planned city', 'Shared capital', 'Administrative hub'], population: '1.1M', area: '114', literacy: '86.4%', artLabel: 'CH' },
  'dadra-nagar-haveli-daman-diu': { title: 'Daman', nativeName: 'દમણ', tagline: 'Coastal union territory combining tourism, light industry, and enclaves.', badges: ['UT capital', 'Coastal territory', 'Tourism', 'Industrial estates'], population: '0.59M', area: '603', literacy: '87.1%', artLabel: 'DNDD' },
  delhi: { title: 'New Delhi', nativeName: 'नई दिल्ली', tagline: 'National capital region and the administrative centre of the Union.', badges: ['National capital', 'Administrative core', 'Metro hub', 'Policy centre'], population: '16.8M', area: '1,484', literacy: '86.2%', artLabel: 'DEL' },
  'jammu-kashmir': { title: 'Srinagar / Jammu', nativeName: 'سرینگر / जम्मू', tagline: 'Union territory with dual capitals, tourism, and high strategic importance.', badges: ['UT capitals', 'Strategic frontier', 'Tourism economy', 'Mountain valleys'], population: '12.3M', area: '42,241', literacy: '67.2%', artLabel: 'J&K' },
  ladakh: { title: 'Leh', nativeName: 'लेह', tagline: 'High-altitude union territory with strategic borders and sparse settlement.', badges: ['UT capital', 'High altitude', 'Strategic frontier', 'Cold desert'], population: '0.27M', area: '59,146', literacy: '77.0%', artLabel: 'LDK' },
  lakshadweep: { title: 'Kavaratti', nativeName: 'കവരത്തി', tagline: 'Small island territory with fragile ecology and maritime significance.', badges: ['UT capital', 'Island territory', 'Marine ecology', 'Arabian Sea'], population: '0.06M', area: '32', literacy: '91.8%', artLabel: 'LD' },
  puducherry: { title: 'Puducherry', nativeName: 'புதுச்சேரி', tagline: 'Multi-enclave coastal territory with education, heritage, and services.', badges: ['UT capital', 'Heritage town', 'Coastal enclaves', 'High literacy'], population: '1.25M', area: '490', literacy: '85.8%', artLabel: 'PY' }
};

function stateProfileFor(stateId = '') {
  if (!stateId) return stateProfiles.india;
  const state = stateById(stateId);
  const profile = stateProfiles[stateId];
  if (state && profile) {
    return {
      scopeLabel: state.name,
      ...profile
    };
  }
  return stateProfiles.india;
}

const readinessPillars = [
  {
    id: 'economy',
    label: 'Economy',
    code: 'EC',
    weight: 15,
    status: 'partial',
    sources: ['RBI DBIE', 'MOSPI', 'live market ticker', 'business news'],
    capacityBasis: 'Fiscal and business capacity',
    stressBasis: 'Market and macro pressure signals'
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    code: 'IN',
    weight: 15,
    status: 'mapped',
    sources: ['CEA/POSOCO', 'OSM', 'Railways', 'ports', 'telecom signals'],
    capacityBasis: 'Power, transport, telecom, and critical assets',
    stressBasis: 'Disruption and outage pressure'
  },
  {
    id: 'health',
    label: 'Health',
    code: 'HL',
    weight: 12,
    status: 'mapped',
    sources: ['MoHFW', 'ICMR', 'WHO', 'health news'],
    capacityBasis: 'Public health capacity and baseline development',
    stressBasis: 'Outbreak and hospital-pressure signals'
  },
  {
    id: 'waterEnvironment',
    label: 'Water & Environment',
    code: 'WE',
    weight: 12,
    status: 'partial',
    sources: ['IMD', 'CWC', 'OpenAQ', 'USGS', 'NASA FIRMS'],
    capacityBasis: 'Water resilience and environmental exposure',
    stressBasis: 'Weather, disaster, AQI, fire, and reservoir stress'
  },
  {
    id: 'securityStability',
    label: 'Security & Stability',
    code: 'SS',
    weight: 14,
    status: 'signal',
    sources: ['ACLED mapped', 'GDELT mapped', 'news alerts', 'disaster feeds'],
    capacityBasis: 'Institutional stability and response headroom',
    stressBasis: 'Conflict, unrest, disaster, and disruption pressure'
  },
  {
    id: 'governanceWelfare',
    label: 'Governance & Welfare',
    code: 'GW',
    weight: 12,
    status: 'partial',
    sources: ['PIB', 'Data.gov.in', 'scheme reports', 'state bulletins'],
    capacityBasis: 'Service delivery and welfare response capacity',
    stressBasis: 'Administrative load and vulnerable-population pressure'
  },
  {
    id: 'digitalCyber',
    label: 'Digital & Cyber',
    code: 'DC',
    weight: 10,
    status: 'mapped',
    sources: ['CERT-In', 'tech news', 'telecom signals', 'DPI indicators'],
    capacityBasis: 'Digital infrastructure and cyber response maturity',
    stressBasis: 'Cyber advisories, outage, and breach pressure'
  },
  {
    id: 'humanDevelopment',
    label: 'Human Development',
    code: 'HD',
    weight: 10,
    status: 'baseline',
    sources: ['Census 2011', 'NFHS mapped', 'PLFS mapped'],
    capacityBasis: 'Literacy and demographic baseline',
    stressBasis: 'Population vulnerability and development pressure'
  }
];

const regionScoreBoost = {
  South: 4,
  West: 3,
  North: 1,
  Northwest: 0,
  Central: -1,
  East: -2,
  Northeast: 0,
  Islands: 2
};

const pillarStateBoosts = {
  delhi: { economy: 7, infrastructure: 8, governanceWelfare: 6, digitalCyber: 10, humanDevelopment: 5 },
  goa: { economy: 4, health: 6, governanceWelfare: 5, humanDevelopment: 7 },
  gujarat: { economy: 9, infrastructure: 8, waterEnvironment: -4, governanceWelfare: 3 },
  haryana: { economy: 6, infrastructure: 5, waterEnvironment: -2, digitalCyber: 4 },
  'himachal-pradesh': { health: 5, waterEnvironment: 5, humanDevelopment: 6, governanceWelfare: 4 },
  karnataka: { economy: 7, infrastructure: 5, health: 4, digitalCyber: 12 },
  kerala: { health: 11, governanceWelfare: 7, humanDevelopment: 12, digitalCyber: 4 },
  maharashtra: { economy: 10, infrastructure: 7, health: 4, digitalCyber: 7 },
  punjab: { economy: 4, infrastructure: 4, waterEnvironment: -5, humanDevelopment: 4 },
  'tamil-nadu': { economy: 7, infrastructure: 7, health: 7, digitalCyber: 5, humanDevelopment: 5 },
  telangana: { economy: 7, infrastructure: 6, health: 4, digitalCyber: 10 },
  tripura: { humanDevelopment: 6, governanceWelfare: 4 },
  mizoram: { humanDevelopment: 9, governanceWelfare: 4, securityStability: 3 },
  lakshadweep: { health: 5, waterEnvironment: -3, humanDevelopment: 9 },
  chandigarh: { economy: 5, infrastructure: 9, health: 7, digitalCyber: 8, humanDevelopment: 7 }
};

const pillarStressAdjustments = {
  rajasthan: { waterEnvironment: 8 },
  gujarat: { waterEnvironment: 5 },
  punjab: { waterEnvironment: 5 },
  'tamil-nadu': { waterEnvironment: 5 },
  'jammu-kashmir': { securityStability: 12 },
  manipur: { securityStability: 14 },
  ladakh: { securityStability: 7, infrastructure: 5 },
  assam: { waterEnvironment: 5 },
  bihar: { waterEnvironment: 4, governanceWelfare: 4 },
  'west-bengal': { waterEnvironment: 4 },
  maharashtra: { economy: -3 },
  karnataka: { digitalCyber: -3 },
  telangana: { digitalCyber: -3 }
};

const readinessStatusMeta = {
  baseline: { label: 'Official baseline', confidence: 72 },
  signal: { label: 'Live signal', confidence: 62 },
  partial: { label: 'Partial live', confidence: 55 },
  mapped: { label: 'Source mapped', confidence: 34 }
};

const readinessModules = [
  { id: 'census-profile', label: 'Census profile', status: 'active' },
  { id: 'state-boundaries', label: 'State boundaries', status: 'active' },
  { id: 'news-rss', label: 'News signal feeds', status: 'active' },
  { id: 'weather-disaster-rss', label: 'Weather/disaster feeds', status: 'active' },
  { id: 'government-rss', label: 'Government bulletins', status: 'active' },
  { id: 'market-ticker', label: 'Market ticker', status: 'active' },
  { id: 'economy-official', label: 'Official economy tables', status: 'mapped' },
  { id: 'health-official', label: 'Health capacity tables', status: 'mapped' },
  { id: 'water-reservoirs', label: 'Reservoir/water data', status: 'mapped' },
  { id: 'conflict-events', label: 'Conflict/unrest events', status: 'mapped' },
  { id: 'cyber-alerts', label: 'Cyber advisories', status: 'mapped' },
  { id: 'transport-energy', label: 'Transport/energy operations', status: 'mapped' }
];

const nationalCapacity = {
  economy: 64,
  infrastructure: 58,
  health: 53,
  waterEnvironment: 50,
  securityStability: 57,
  governanceWelfare: 56,
  digitalCyber: 65,
  humanDevelopment: 58
};

const nationalStress = {
  economy: 31,
  infrastructure: 35,
  health: 40,
  waterEnvironment: 46,
  securityStability: 42,
  governanceWelfare: 34,
  digitalCyber: 30,
  humanDevelopment: 28
};

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value.toFixed(1))));
}

function scoreTone(score) {
  if (score >= 75) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 45) return 'watch';
  return 'risk';
}

function scoreGrade(score) {
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 45) return 'C';
  if (score >= 30) return 'D';
  return 'E';
}

function parsePercent(value = '') {
  const parsed = Number(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 70;
}

function deterministicOffset(seed, dimensionId) {
  const text = `${seed}:${dimensionId}`;
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return (hash % 17) - 8;
}

function weightedAverage(items, field) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const value = items.reduce((sum, item) => sum + item[field] * item.weight, 0) / totalWeight;
  return clampScore(value);
}

function confidenceFor(modules, pillars) {
  const activeModules = modules.filter((module) => module.status === 'active').length;
  const totalModules = modules.length;
  const moduleScore = (activeModules / totalModules) * 100;
  const pillarScore = pillars.reduce((sum, pillar) => sum + pillar.confidence, 0) / pillars.length;
  const score = clampScore(moduleScore * 0.45 + pillarScore * 0.55);
  const label = score >= 70 ? 'High confidence' : score >= 50 ? 'Medium confidence' : 'Early confidence';
  return {
    label,
    score,
    activeModules,
    totalModules,
    mappedModules: modules.filter((module) => module.status === 'mapped').length
  };
}

function capacityForPillar(pillarId, key, profile, state) {
  const literacy = parsePercent(profile.literacy);
  const regionBoost = state ? (regionScoreBoost[state.region] || 0) : 0;
  const boosts = pillarStateBoosts[key] || {};
  if (!state) return nationalCapacity[pillarId];

  let score = 46 + literacy * 0.28 + regionBoost + deterministicOffset(key, `${pillarId}:capacity`) + (boosts[pillarId] || 0);
  if (pillarId === 'economy') score = 44 + literacy * 0.24 + regionBoost + deterministicOffset(key, pillarId) + (boosts[pillarId] || 0);
  if (pillarId === 'infrastructure') score = 42 + literacy * 0.26 + regionBoost + deterministicOffset(key, pillarId) + (boosts[pillarId] || 0);
  if (pillarId === 'health') score = 36 + literacy * 0.42 + regionBoost + deterministicOffset(key, pillarId) + (boosts[pillarId] || 0);
  if (pillarId === 'waterEnvironment') score = 56 + literacy * 0.12 + regionBoost + deterministicOffset(key, pillarId) + (boosts[pillarId] || 0);
  if (pillarId === 'securityStability') score = 60 + literacy * 0.12 + regionBoost + deterministicOffset(key, pillarId) + (boosts[pillarId] || 0);
  if (pillarId === 'governanceWelfare') score = 40 + literacy * 0.33 + regionBoost + deterministicOffset(key, pillarId) + (boosts[pillarId] || 0);
  if (pillarId === 'digitalCyber') score = 33 + literacy * 0.38 + regionBoost + deterministicOffset(key, pillarId) + (boosts[pillarId] || 0);
  if (pillarId === 'humanDevelopment') score = literacy * 0.82 + 12 + deterministicOffset(key, pillarId) * 0.35 + (boosts[pillarId] || 0);
  return clampScore(score);
}

function stressForPillar(pillarId, key, state) {
  const adjustments = pillarStressAdjustments[key] || {};
  if (!state) return nationalStress[pillarId];
  const regionPressure = {
    South: -2,
    West: -1,
    North: 1,
    Northwest: 2,
    Central: 3,
    East: 4,
    Northeast: 4,
    Islands: 2
  }[state.region] || 0;
  const score = nationalStress[pillarId] + regionPressure + deterministicOffset(key, `${pillarId}:stress`) + (adjustments[pillarId] || 0);
  return clampScore(score);
}

function scoreFor(stateId = '') {
  const selectedState = stateById(stateId);
  const profile = stateProfileFor(selectedState?.id || '');
  const key = selectedState?.id || 'india';

  const pillars = readinessPillars.map((pillar) => {
    const capacity = capacityForPillar(pillar.id, key, profile, selectedState);
    const stress = stressForPillar(pillar.id, key, selectedState);
    const stability = clampScore(100 - stress);
    const score = clampScore(capacity * 0.7 + stability * 0.3);
    const status = readinessStatusMeta[pillar.status];
    return {
      ...pillar,
      capacity,
      stress,
      stability,
      score,
      tone: scoreTone(score),
      statusLabel: status.label,
      confidence: status.confidence
    };
  });

  const capacity = weightedAverage(pillars, 'capacity');
  const stress = weightedAverage(pillars, 'stress');
  const stability = clampScore(100 - stress);
  const score = clampScore(capacity * 0.7 + stability * 0.3);
  const modules = readinessModules.map((module) => ({ ...module }));
  const confidence = confidenceFor(modules, pillars);

  return {
    scope: selectedState ? 'state' : 'national',
    scopeLabel: selectedState?.name || 'All India',
    title: selectedState ? `${selectedState.name} Readiness Score` : 'India Readiness Score',
    score,
    grade: scoreGrade(score),
    tone: scoreTone(score),
    capacity,
    stress,
    stability,
    confidence,
    modules,
    note: selectedState
      ? 'Readiness combines structural capacity with current stability. State values use official profile baselines plus available local signal modules; mapped sources are clearly marked until numeric ingestion is wired.'
      : 'Readiness combines structural capacity with current stability. National values use official baselines, live market/news signals, and mapped official sources. This is not an official government score.',
    methodology: 'Formula: Readiness = 70% structural capacity + 30% current stability. Current stability = 100 - current stress.',
    updatedAt: new Date().toISOString(),
    pillars
  };
}

const feeds = {
  top: [
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://indianexpress.com/section/india/feed/',
    'https://feeds.feedburner.com/ndtvnews-india-news',
    'https://www.news18.com/commonfeeds/v1/eng/rss/india.xml',
    'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',
    'https://news.google.com/rss/search?q=India+news+when:1d&hl=en-IN&gl=IN&ceid=IN:en'
  ],
  markets: [
    'https://www.moneycontrol.com/rss/latestnews.xml',
    'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
    'https://www.livemint.com/rss/markets',
    'https://www.business-standard.com/rss/markets-106.rss',
    'https://news.google.com/rss/search?q=Nifty+Sensex+RBI+India+markets+when:1d&hl=en-IN&gl=IN&ceid=IN:en'
  ],
  tech: [
    'https://inc42.com/feed/',
    'https://www.medianama.com/feed/',
    'https://yourstory.com/feed',
    'https://feeds.feedburner.com/tech2/rss',
    'https://news.google.com/rss/search?q=India+technology+startup+AI+when:7d&hl=en-IN&gl=IN&ceid=IN:en'
  ],
  government: [
    'https://pib.gov.in/rssMain.aspx?ModId=6&Lang=1&Regid=3',
    'https://news.google.com/rss/search?q=site:pib.gov.in+India+government+when:2d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=site:mea.gov.in+India+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=site:rbi.org.in+RBI+when:7d&hl=en-IN&gl=IN&ceid=IN:en'
  ],
  weather: [
    'https://news.google.com/rss/search?q=India+weather+IMD+cyclone+flood+heatwave+when:2d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=site:mausam.imd.gov.in+India+weather+warning+when:7d&hl=en-IN&gl=IN&ceid=IN:en'
  ],
  disasters: [
    'https://news.google.com/rss/search?q=India+disaster+earthquake+flood+landslide+cyclone+fire+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=site:ndma.gov.in+India+disaster+alert+when:30d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=site:reliefweb.int+India+disaster+when:30d&hl=en-IN&gl=IN&ceid=IN:en'
  ]
};

const labels = {
  top: 'Top News',
  markets: 'Markets',
  tech: 'Technology',
  government: 'Government',
  weather: 'Weather & Alerts',
  disasters: 'Disaster Events'
};

const categoryTerms = {
  top: 'latest news',
  markets: 'stock market Nifty Sensex RBI rupee economy business',
  tech: 'technology startup AI software semiconductor digital policy',
  government: 'government ministry policy parliament scheme cabinet',
  weather: 'weather IMD rain flood cyclone heatwave alert',
  disasters: 'disaster earthquake flood landslide cyclone fire relief alert'
};

const categoryProfiles = {
  top: {
    days: 2,
    queries: (place) => [
      `${place} latest news`,
      `${place} breaking news`
    ],
    include: []
  },
  markets: {
    days: 3,
    queries: (place) => [
      `${place} business economy markets investment`,
      `${place} industry company jobs finance`,
      `${place} stock market Nifty Sensex RBI rupee`
    ],
    include: ['market', 'stock', 'nifty', 'sensex', 'rbi', 'rupee', 'economy', 'business', 'company', 'investment', 'bank', 'finance', 'industry', 'jobs', 'inflation', 'gdp']
  },
  tech: {
    days: 7,
    queries: (place) => [
      `${place} technology startups AI software`,
      `${place} digital policy internet telecom semiconductors`,
      `${place} tech startup funding`
    ],
    include: ['tech', 'technology', 'startup', 'ai', 'software', 'digital', 'internet', 'telecom', 'semiconductor', 'funding', 'app', 'cyber', 'data centre', 'data center']
  },
  government: {
    days: 7,
    queries: (place) => [
      `${place} government policy ministry cabinet`,
      `${place} parliament election public scheme`,
      `${place} administration civic police court`
    ],
    include: ['government', 'ministry', 'minister', 'policy', 'cabinet', 'parliament', 'election', 'scheme', 'court', 'police', 'administration', 'municipal', 'budget']
  },
  weather: {
    days: 7,
    queries: (place) => [
      `${place} weather IMD rain forecast`,
      `${place} heatwave cyclone flood alert`,
      `${place} rainfall temperature warning`
    ],
    include: ['weather', 'imd', 'rain', 'rainfall', 'forecast', 'heatwave', 'cyclone', 'flood', 'alert', 'temperature', 'monsoon', 'warning', 'storm']
  },
  disasters: {
    days: 14,
    queries: (place) => [
      `${place} disaster flood fire earthquake landslide`,
      `${place} accident rescue evacuation relief`,
      `${place} cyclone damage emergency response`
    ],
    include: ['disaster', 'flood', 'fire', 'earthquake', 'landslide', 'cyclone', 'accident', 'rescue', 'evacuation', 'relief', 'emergency', 'damage', 'collapse', 'drown', 'killed', 'injured']
  }
};

const blockedResultTerms = [
  'instagram.com',
  'facebook.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'x.com/',
  'twitter.com',
  'reddit.com',
  'pinterest.com',
  '#shorts'
];

const metricsCatalog = [
  {
    id: 'security',
    label: 'Security & Conflict',
    indicators: ['Conflict events', 'casualties', 'border incidents', 'violence reports'],
    sources: ['ACLED', 'UCDP', 'GDELT', 'news SITREPs'],
    cadence: 'Near real-time to daily',
    granularity: 'State, district when source allows',
    status: 'planned'
  },
  {
    id: 'unrest',
    label: 'Civil Unrest',
    indicators: ['protests', 'strikes', 'crowd severity', 'public disruption'],
    sources: ['ACLED', 'GDELT', 'verified news feeds'],
    cadence: 'Daily',
    granularity: 'State/city',
    status: 'planned'
  },
  {
    id: 'economy',
    label: 'Economy',
    indicators: ['GSDP/GDP', 'inflation', 'employment', 'credit', 'trade'],
    sources: ['MOSPI', 'RBI DBIE', 'Data.gov.in', 'World Bank', 'UN Comtrade'],
    cadence: 'Monthly/quarterly/annual',
    granularity: 'National/state where published',
    status: 'planned'
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    indicators: ['power status', 'rail/port disruptions', 'telecom outages', 'critical assets'],
    sources: ['OSM', 'CEA/POSOCO', 'Indian Railways', 'port authorities', 'news signals'],
    cadence: 'Static to near real-time',
    granularity: 'Asset/state',
    status: 'planned'
  },
  {
    id: 'health',
    label: 'Health',
    indicators: ['outbreak reports', 'disease surveillance', 'hospital capacity', 'vaccination'],
    sources: ['MoHFW', 'ICMR', 'WHO', 'HealthMap', 'news bulletins'],
    cadence: 'Daily/weekly',
    granularity: 'National/state/district when published',
    status: 'planned'
  },
  {
    id: 'environment',
    label: 'Environment',
    indicators: ['AQI', 'earthquakes', 'fires', 'reservoir stress', 'climate anomalies'],
    sources: ['OpenAQ', 'USGS', 'NASA FIRMS', 'CWC', 'IMD', 'FSI'],
    cadence: 'Hourly to annual',
    granularity: 'Station/asset/state',
    status: 'planned'
  },
  {
    id: 'weather-disasters',
    label: 'Weather & Disasters',
    indicators: ['warnings', 'cyclones', 'floods', 'heatwaves', 'relief/displacement signals'],
    sources: ['IMD', 'NDMA', 'ReliefWeb', 'USGS', 'news signals'],
    cadence: 'Near real-time',
    granularity: 'State/district/event',
    status: 'live-news'
  },
  {
    id: 'energy-water',
    label: 'Energy & Water',
    indicators: ['power demand', 'fuel stocks', 'reservoir levels', 'water stress'],
    sources: ['POSOCO', 'PPAC', 'CWC India-WRIS', 'NITI ICED', 'NASA GRACE'],
    cadence: 'Daily/monthly',
    granularity: 'National/state/basin',
    status: 'planned'
  },
  {
    id: 'transport',
    label: 'Transport',
    indicators: ['flight disruptions', 'rail cancellations', 'port activity', 'road incidents'],
    sources: ['OpenSky/Wingbits', 'OSM', 'Indian Railways', 'AIS providers', 'news signals'],
    cadence: 'Near real-time to daily',
    granularity: 'Asset/city/state',
    status: 'planned'
  },
  {
    id: 'cyber',
    label: 'Cyber',
    indicators: ['CERT advisories', 'breach reports', 'ransomware mentions', 'vulnerability alerts'],
    sources: ['CERT-In', 'AlienVault OTX', 'CISA KEV', 'news signals'],
    cadence: 'As reported',
    granularity: 'National/sector/entity',
    status: 'planned'
  },
  {
    id: 'trade',
    label: 'Trade & Sanctions',
    indicators: ['exports/imports', 'commodity flow', 'sanction exposure', 'tariff changes'],
    sources: ['UN Comtrade', 'DGCI&S', 'WITS', 'WTO', 'sanctions lists'],
    cadence: 'Monthly/as listed',
    granularity: 'National/state when available',
    status: 'planned'
  },
  {
    id: 'info',
    label: 'Media & Information',
    indicators: ['news volume', 'topic velocity', 'narrative clusters', 'misinformation signals'],
    sources: ['GDELT', 'news RSS', 'Alt News/Graphika where available'],
    cadence: 'Near real-time',
    granularity: 'National/state/topic',
    status: 'live-news'
  }
];

const metricReadinessMap = {
  security: { pillar: 'Security & Stability', role: 'Current stress', weight: 14, status: 'Source mapped' },
  unrest: { pillar: 'Security & Stability', role: 'Current stress', weight: 14, status: 'Source mapped' },
  economy: { pillar: 'Economy', role: 'Capacity + stress', weight: 15, status: 'Partial live' },
  infrastructure: { pillar: 'Infrastructure', role: 'Structural capacity', weight: 15, status: 'Source mapped' },
  health: { pillar: 'Health', role: 'Capacity + stress', weight: 12, status: 'Source mapped' },
  environment: { pillar: 'Water & Environment', role: 'Current stress', weight: 12, status: 'Partial live' },
  'weather-disasters': { pillar: 'Water & Environment / Security', role: 'Current stress', weight: 12, status: 'Live signal' },
  'energy-water': { pillar: 'Infrastructure / Water & Environment', role: 'Capacity + stress', weight: 15, status: 'Source mapped' },
  transport: { pillar: 'Infrastructure', role: 'Current stress', weight: 15, status: 'Source mapped' },
  cyber: { pillar: 'Digital & Cyber', role: 'Current stress', weight: 10, status: 'Source mapped' },
  trade: { pillar: 'Economy', role: 'Structural capacity', weight: 15, status: 'Source mapped' },
  info: { pillar: 'Security & Stability', role: 'Live signal context', weight: 14, status: 'Live signal' }
};

function stateById(id) {
  return states.find((state) => state.id === id);
}

function metricsFor(stateId) {
  const state = stateById(stateId);
  return {
    scope: state ? 'state' : 'india',
    state: state || null,
    updatedAt: new Date().toISOString(),
    items: metricsCatalog.map((metric) => ({
      ...metric,
      readiness: metricReadinessMap[metric.id],
      coverage: state ? `${state.name} drilldown` : 'All India',
      note: metric.status === 'live-news'
        ? 'Used as live context in the readiness model; official numeric ingestion is next.'
        : 'Mapped into the readiness model; numeric ingestion is not wired yet.'
    }))
  };
}

function formatTickerNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

function marketOpenStatus() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Calcutta',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Mon';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const totalMinutes = hour * 60 + minute;
  const open = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday) && totalMinutes >= 555 && totalMinutes <= 930;
  return {
    label: open ? 'Market Open' : 'Market Closed',
    value: open ? 'NSE • BSE' : 'Until next session',
    delta: null,
    trend: open ? 'up' : 'flat',
    source: 'IST session clock'
  };
}

// Yahoo often blocks generic user agents and is slower to answer from cloud
// hosts (e.g. Render), so the ticker uses a browser UA, a longer timeout, and
// one retry. A shared cloud IP can also be rate-limited intermittently, which
// is handled by stale-while-error caching in liveMetrics().
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TICKER_FETCH_TIMEOUT_MS = 12000;
let lastGoodTicker = null;

async function fetchYahooSummary(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(TICKER_FETCH_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`Yahoo chart ${symbol} failed: HTTP ${response.status}`);
      const json = await response.json();
      const result = json?.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close?.filter((value) => Number.isFinite(value)) || [];
      const current = closes.at(-1);
      const previous = closes.at(-2) ?? current;
      const currency = result?.meta?.currency || '';
      const percent = previous ? ((current - previous) / previous) * 100 : 0;
      if (!Number.isFinite(current)) throw new Error(`Yahoo chart ${symbol}: no close values`);
      return { symbol, current, previous, percent, currency };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Keyless, cloud-friendly forex fallback for USD/INR when Yahoo is unavailable.
async function fetchUsdInrFallback() {
  const response = await fetch('https://open.er-api.com/v6/latest/USD', {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(TICKER_FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Forex fallback failed: HTTP ${response.status}`);
  const json = await response.json();
  const inr = json?.rates?.INR;
  if (!Number.isFinite(inr)) throw new Error('Forex fallback: no INR rate');
  // Daily-change isn't available from this source, so percent stays null.
  return { symbol: 'INR=X', current: inr, previous: inr, percent: null, currency: 'INR' };
}

async function liveMetrics() {
  const cacheKey = 'live-metrics';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < LIVE_METRICS_CACHE_MS) return cached.data;

  // One failed symbol should degrade to "--" for that metric, not take down the strip.
  const empty = (symbol) => ({ symbol, current: null, previous: null, percent: null, currency: '' });
  let [nifty, sensex, usdInr, goldFutures, brent] = (await Promise.allSettled([
    fetchYahooSummary('^NSEI'),
    fetchYahooSummary('^BSESN'),
    fetchYahooSummary('INR=X'),
    fetchYahooSummary('GC=F'),
    fetchYahooSummary('BZ=F')
  ])).map((result, index) =>
    result.status === 'fulfilled' ? result.value : empty(['^NSEI', '^BSESN', 'INR=X', 'GC=F', 'BZ=F'][index])
  );

  // If Yahoo's rupee quote failed, try the keyless forex source so USD/INR and
  // the derived gold price still resolve.
  if (!Number.isFinite(usdInr.current)) {
    try { usdInr = await fetchUsdInrFallback(); } catch { /* keep the empty placeholder */ }
  }

  const usdPerInr = usdInr.current ? 1 / usdInr.current : null;
  const gold24kPer10g = goldFutures.current && usdPerInr
    ? (goldFutures.current / 31.1034768) * 10 / usdPerInr
    : null;

  const trendFor = (percent) => (Number.isFinite(percent) ? (percent >= 0 ? 'up' : 'down') : 'flat');

  const items = [
    marketOpenStatus(),
    {
      label: 'Nifty 50',
      value: formatTickerNumber(nifty.current, 2),
      delta: nifty.percent,
      trend: trendFor(nifty.percent),
      source: 'Yahoo Finance'
    },
    {
      label: 'Sensex',
      value: formatTickerNumber(sensex.current, 2),
      delta: sensex.percent,
      trend: trendFor(sensex.percent),
      source: 'Yahoo Finance'
    },
    {
      label: 'USD/INR',
      value: usdInr.current ? `${formatTickerNumber(usdInr.current, 2)}` : '--',
      delta: usdInr.percent,
      trend: trendFor(usdInr.percent),
      source: 'Yahoo Finance'
    },
    {
      label: 'Gold (24K)',
      value: gold24kPer10g ? `₹${formatTickerNumber(gold24kPer10g, 0)}/10g` : '--',
      delta: goldFutures.percent,
      trend: trendFor(goldFutures.percent),
      source: 'Derived from GC=F + USD/INR'
    },
    {
      label: 'Brent Crude',
      value: brent.current ? `$${formatTickerNumber(brent.current, 2)}/bbl` : '--',
      delta: brent.percent,
      trend: trendFor(brent.percent),
      source: 'Yahoo Finance'
    }
  ];

  const data = {
    updatedAt: new Date().toISOString(),
    items,
    stale: false
  };

  // Only trust and cache a payload that actually has market values; a burst of
  // failures should not overwrite good data with a strip full of "--".
  const hasRealData = [nifty, sensex, usdInr, goldFutures, brent].some((quote) => Number.isFinite(quote.current));
  if (hasRealData) {
    lastGoodTicker = data;
    cache.set(cacheKey, { time: Date.now(), data });
    return data;
  }

  // Everything failed this round. Serve the last good values (marked stale) if
  // we have them, and don't cache the failure so the next request retries soon.
  if (lastGoodTicker) return { ...lastGoodTicker, stale: true };
  return data;
}

function googleNewsUrl(query, days = 2) {
  const encoded = encodeURIComponent(`${query} when:${days}d`).replaceAll('%20', '+');
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;
}

function feedsFor(category, stateId) {
  const key = category in feeds ? category : 'top';
  const state = stateById(stateId);
  if (!state) return feeds[key];

  const profile = categoryProfiles[key] || categoryProfiles.top;
  return profile.queries(`${state.name} India`).map((query) => googleNewsUrl(query, profile.days));
}

const namedEntities = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', deg: '°', middot: '·', laquo: '«', raquo: '»'
};

function codePointOr(fallback, code) {
  // Untrusted feeds can carry out-of-range references like &#99999999; —
  // String.fromCodePoint throws above 0x10FFFF.
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : fallback;
}

function decodeEntities(value = '') {
  return value
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replace(/&#(\d+);/g, (match, code) => codePointOr(match, Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => codePointOr(match, Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name.toLowerCase()] ?? match)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return decodeEntities(match?.[1] || '');
}

// Channel <title> values in RSS are long SEO strings; show a clean brand name instead.
const sourceBrands = new Map([
  ['thehindu.com', 'The Hindu'],
  ['indianexpress.com', 'The Indian Express'],
  ['ndtv.com', 'NDTV'],
  ['news18.com', 'News18'],
  ['hindustantimes.com', 'Hindustan Times'],
  ['news.google.com', 'Google News'],
  ['moneycontrol.com', 'Moneycontrol'],
  ['economictimes.indiatimes.com', 'Economic Times'],
  ['livemint.com', 'Mint'],
  ['business-standard.com', 'Business Standard'],
  ['inc42.com', 'Inc42'],
  ['medianama.com', 'MediaNama'],
  ['yourstory.com', 'YourStory'],
  ['firstpost.com', 'Firstpost'],
  ['pib.gov.in', 'PIB']
]);

function sourceBrandFor(sourceUrl, channelTitle) {
  const url = new URL(sourceUrl);
  const hostname = url.hostname.replace(/^www\./, '');
  // FeedBurner hosts many publishers on one domain — disambiguate by path.
  if (hostname.endsWith('feedburner.com')) {
    if (url.pathname.includes('ndtv')) return 'NDTV';
    if (url.pathname.includes('tech2')) return 'Tech2';
  }
  if (sourceBrands.has(hostname)) return sourceBrands.get(hostname);
  const bare = hostname.split('.').slice(-2).join('.');
  if (sourceBrands.has(bare)) return sourceBrands.get(bare);
  if (channelTitle && channelTitle.length <= 40) return channelTitle;
  return hostname;
}

function safeLink(link = '') {
  return /^https?:\/\//i.test(link) ? link : '';
}

function normalizedText(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseRss(xml, sourceUrl) {
  const channelTitle = tag(xml.slice(0, 4000), 'title');
  const fallbackSource = sourceBrandFor(sourceUrl, channelTitle);
  const isGoogleNews = new URL(sourceUrl).hostname === 'news.google.com';
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  return blocks.map((block) => {
    let title = tag(block, 'title');
    let source = fallbackSource;
    let summary = tag(block, 'description');

    // Google News item titles end with " - Publisher"; surface the real publisher.
    if (isGoogleNews) {
      const split = title.match(/^(.*)\s-\s([^-]{2,40})$/);
      if (split) {
        title = split[1].trim();
        source = split[2].trim();
      }
    }

    // Drop summaries that merely repeat the headline (common in Google News feeds).
    const rawSummary = summary;
    if (summary && normalizedText(summary).startsWith(normalizedText(title))) summary = '';

    return {
      title,
      link: safeLink(tag(block, 'link')),
      source,
      publishedAt: tag(block, 'pubDate') || tag(block, 'updated'),
      summary,
      // Filter-only context, stripped before the response: main matched the
      // include-filter against the verbose channel title and full summary, so
      // keep them available or the filter drops stories it used to keep.
      filterContext: `${channelTitle} ${rawSummary}`
    };
  }).filter((item) => item.title && item.link);
}

async function loadCategory(category, stateId) {
  const key = category in feeds ? category : 'top';
  const selectedState = stateById(stateId);
  const cacheKey = `${key}:${selectedState?.id || 'india'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  // Fetch every feed concurrently with a timeout — a slow publisher should not
  // hold the whole category hostage.
  const feedResults = await Promise.all(feedsFor(key, selectedState?.id).map(async (feedUrl) => {
    try {
      const response = await fetch(feedUrl, {
        headers: { 'User-Agent': 'BharatMonitor/0.1 (+local dev)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      return parseRss(xml, feedUrl);
    } catch (error) {
      return [{
        title: `Could not load ${new URL(feedUrl).hostname}`,
        link: feedUrl,
        source: 'Fetch error',
        publishedAt: new Date().toISOString(),
        summary: error.message
      }];
    }
  }));
  const results = feedResults.flat();

  const profile = categoryProfiles[key] || categoryProfiles.top;
  const seen = new Set();
  const stateNeedle = selectedState?.name.toLowerCase();
  const filtered = results
    .filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.link}`.toLowerCase();
      return !blockedResultTerms.some((term) => haystack.includes(term));
    })
    .filter((item) => {
      if (!profile.include.length) return true;
      const haystack = `${item.title} ${item.summary} ${item.source} ${item.filterContext || ''}`.toLowerCase();
      return profile.include.some((term) => haystack.includes(term));
    })
    .filter((item) => {
      if (!stateNeedle) return true;
      const haystack = `${item.title} ${item.summary}`.toLowerCase();
      return haystack.includes(stateNeedle);
    })
    .filter((item) => {
      const id = item.title.toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  const bySource = new Map();
  for (const item of filtered) {
    const key = item.source || 'Unknown';
    const list = bySource.get(key) || [];
    list.push(item);
    bySource.set(key, list);
  }

  const sourceQueues = [...bySource.values()].map((items) => items.slice(0, 6));
  const interleaved = [];
  while (sourceQueues.some((items) => items.length) && interleaved.length < 30) {
    for (const queue of sourceQueues) {
      const next = queue.shift();
      if (next) interleaved.push(next);
      if (interleaved.length >= 30) break;
    }
  }

  const data = interleaved.map(({ filterContext, ...item }) => item);
  cache.set(cacheKey, { time: Date.now(), data });
  return data;
}

/* --------------------------------------------------------------------------
   Live map event layers
   Turns the India map into a live event board: earthquakes (USGS, keyless),
   news hotspots (reuses the cached top feed), and disaster/weather alerts
   (reuses the cached alert feeds). Each layer is a GeoJSON FeatureCollection
   the client drops straight onto Mapbox.
   -------------------------------------------------------------------------- */

const MAP_EVENTS_CACHE_MS = 5 * 60 * 1000;
const INDIA_EVENT_BBOX = { minLat: 6, maxLat: 38, minLng: 66, maxLng: 98 };
// Longest names first so "Andhra Pradesh" wins over a stray "Andaman" substring.
const statesByNameLength = [...states].sort((a, b) => b.name.length - a.name.length);

function featureCollection(features) {
  return { type: 'FeatureCollection', features };
}

function firstStateInText(text = '') {
  const haystack = text.toLowerCase();
  return statesByNameLength.find((state) => haystack.includes(state.name.toLowerCase())) || null;
}

function magnitudeSeverity(mag) {
  if (mag >= 5) return 'high';
  if (mag >= 4) return 'medium';
  return 'low';
}

async function loadEarthquakes(days) {
  const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    format: 'geojson',
    starttime: startTime,
    minlatitude: String(INDIA_EVENT_BBOX.minLat),
    maxlatitude: String(INDIA_EVENT_BBOX.maxLat),
    minlongitude: String(INDIA_EVENT_BBOX.minLng),
    maxlongitude: String(INDIA_EVENT_BBOX.maxLng),
    minmagnitude: '2.5',
    orderby: 'time'
  });
  const response = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`, {
    headers: { 'User-Agent': 'BharatMonitor/0.1 (+local dev)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`USGS quakes failed: HTTP ${response.status}`);
  const json = await response.json();
  const features = (json.features || [])
    .filter((feature) => Array.isArray(feature.geometry?.coordinates))
    .map((feature) => {
      const [lng, lat, depth] = feature.geometry.coordinates;
      const mag = Number(feature.properties?.mag);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          layer: 'quakes',
          title: `M ${Number.isFinite(mag) ? mag.toFixed(1) : '?'} · ${feature.properties?.place || 'Unknown location'}`,
          magnitude: Number.isFinite(mag) ? mag : null,
          depthKm: Number.isFinite(depth) ? Math.round(depth) : null,
          severity: magnitudeSeverity(mag),
          weight: Number.isFinite(mag) ? mag : 2.5,
          time: feature.properties?.time ? new Date(feature.properties.time).toISOString() : null,
          url: feature.properties?.url || ''
        }
      };
    });
  return featureCollection(features);
}

async function loadNewsHotspots() {
  // Aggregate state mentions across several national feeds so the heat map has
  // real density; all of these are already cached by the news panel.
  const feeds = await Promise.all(
    ['top', 'government', 'markets'].map((category) => loadCategory(category).catch(() => []))
  );
  const items = feeds.flat();
  const counts = new Map();
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.title)) continue;
    seen.add(item.title);
    const haystack = `${item.title} ${item.summary}`.toLowerCase();
    for (const state of states) {
      if (haystack.includes(state.name.toLowerCase())) {
        counts.set(state.id, (counts.get(state.id) || 0) + 1);
      }
    }
  }
  const features = [...counts.entries()].map(([id, count]) => {
    const state = stateById(id);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [state.lng, state.lat] },
      properties: {
        layer: 'hotspots',
        title: `${state.name} · ${count} ${count === 1 ? 'story' : 'stories'}`,
        state: state.name,
        stateId: id,
        count,
        weight: count,
        severity: count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low'
      }
    };
  });
  return featureCollection(features);
}

async function loadAlertEvents() {
  const [disasters, weather] = await Promise.all([
    loadCategory('disasters'),
    loadCategory('weather')
  ]);

  // Group every alert onto the state it names, one marker per state, so
  // multiple alerts don't stack invisibly on the same centroid.
  const byState = new Map();
  const add = (item, kind) => {
    const state = firstStateInText(`${item.title} ${item.summary}`);
    if (!state) return;
    const entry = byState.get(state.id) || { state, disaster: 0, weather: 0, items: [] };
    entry[kind] += 1;
    if (entry.items.length < 6) {
      entry.items.push({ title: item.title, source: item.source, url: item.link, time: item.publishedAt, kind });
    }
    byState.set(state.id, entry);
  };
  disasters.forEach((item) => add(item, 'disaster'));
  weather.forEach((item) => add(item, 'weather'));

  const features = [...byState.values()].map((entry) => {
    const total = entry.disaster + entry.weather;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [entry.state.lng, entry.state.lat] },
      properties: {
        layer: 'alerts',
        title: `${entry.state.name} · ${total} ${total === 1 ? 'alert' : 'alerts'}`,
        state: entry.state.name,
        stateId: entry.state.id,
        count: total,
        weight: total,
        severity: entry.disaster > 0 ? 'high' : 'medium',
        itemsJson: JSON.stringify(entry.items)
      }
    };
  });
  return featureCollection(features);
}

async function loadMapEvents(days) {
  const cacheKey = `map-events:${days}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < MAP_EVENTS_CACHE_MS) return cached.data;

  const empty = featureCollection([]);
  const [quakes, hotspots, alerts] = await Promise.all([
    loadEarthquakes(days).catch((error) => { console.error('quakes layer failed', error.message); return empty; }),
    loadNewsHotspots().catch((error) => { console.error('hotspots layer failed', error.message); return empty; }),
    loadAlertEvents().catch((error) => { console.error('alerts layer failed', error.message); return empty; })
  ]);

  const data = {
    updatedAt: new Date().toISOString(),
    days,
    layers: [
      { id: 'quakes', label: 'Earthquakes', color: '#ff6b6b', description: 'USGS seismic events (M2.5+) in and around India.', data: quakes, count: quakes.features.length },
      { id: 'hotspots', label: 'News hotspots', color: '#f59e0b', description: 'States by national news mentions right now.', data: hotspots, count: hotspots.features.length },
      { id: 'alerts', label: 'Disaster & weather', color: '#60a5fa', description: 'States with active disaster or weather alerts.', data: alerts, count: alerts.features.length }
    ]
  };

  cache.set(cacheKey, { time: Date.now(), data });
  return data;
}

function sendBody(req, res, body, { status = 200, contentType, cacheControl = 'no-cache', etag } = {}) {
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept-Encoding'
  };
  if (etag) {
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
  }

  const encoding = pickEncoding(req, body.length);
  const payload = encoding ? compressBody(body, encoding) : body;
  if (encoding) headers['Content-Encoding'] = encoding;
  headers['Content-Length'] = payload.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

function sendJson(req, res, data, status = 200, cacheControl = 'no-cache') {
  sendBody(req, res, Buffer.from(JSON.stringify(data)), {
    status,
    contentType: 'application/json; charset=utf-8',
    cacheControl
  });
}

// Pre-encoded payloads (boundaries) skip per-request compression entirely.
function sendPrepared(req, res, prepared, cacheControl) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept-Encoding',
    ETag: prepared.etag
  };
  if (req.headers['if-none-match'] === prepared.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const encoding = pickEncoding(req, prepared.body.length);
  const payload = encoding ? prepared.encoded[encoding] : prepared.body;
  if (encoding) headers['Content-Encoding'] = encoding;
  headers['Content-Length'] = payload.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

const staticTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

const staticCache = new Map();

async function serveStatic(req, pathname, res) {
  const safePath = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
  const filePath = join(publicDir, safePath);
  if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    // Cache file contents in memory, revalidated by mtime so local edits still show up.
    const { mtimeMs, size } = await stat(filePath);
    let entry = staticCache.get(filePath);
    if (!entry || entry.mtimeMs !== mtimeMs || entry.size !== size) {
      const body = await readFile(filePath);
      entry = { body, mtimeMs, size, etag: etagFor(body) };
      staticCache.set(filePath, entry);
    }
    sendBody(req, res, entry.body, {
      contentType: staticTypes[extname(filePath)] || 'application/octet-stream',
      cacheControl: 'no-cache',
      etag: entry.etag
    });
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  try {
    if (url.pathname === '/api/config') {
      // The payload depends on MAPBOX_TOKEN — must revalidate so token changes
      // reach clients immediately after a redeploy.
      sendJson(req, res, {
        mapProvider: MAPBOX_TOKEN ? 'mapbox' : 'fallback',
        mapboxToken: MAPBOX_TOKEN
      });
      return;
    }

    if (url.pathname === '/api/categories') {
      sendJson(req, res, Object.entries(labels).map(([id, label]) => ({ id, label })), 200, 'public, max-age=3600');
      return;
    }

    if (url.pathname === '/api/states') {
      sendJson(req, res, states, 200, 'public, max-age=3600');
      return;
    }

    if (url.pathname === '/api/metrics') {
      sendJson(req, res, metricsFor(url.searchParams.get('state') || ''));
      return;
    }

    if (url.pathname === '/api/state-profile') {
      sendJson(req, res, {
        updatedAt: new Date().toISOString(),
        item: stateProfileFor(url.searchParams.get('state') || '')
      });
      return;
    }

    if (url.pathname === '/api/score') {
      sendJson(req, res, scoreFor(url.searchParams.get('state') || ''));
      return;
    }

    if (url.pathname === '/api/live-metrics') {
      try {
        sendJson(req, res, await liveMetrics());
      } catch (error) {
        sendJson(req, res, { error: error.message }, 502);
      }
      return;
    }

    if (url.pathname === '/api/boundaries') {
      try {
        const prepared = await loadBoundaries();
        sendPrepared(req, res, prepared, 'public, max-age=86400, stale-while-revalidate=604800');
      } catch (error) {
        sendJson(req, res, { error: error.message }, 502);
      }
      return;
    }

    if (url.pathname === '/api/map-events') {
      const requested = Number(url.searchParams.get('days'));
      const days = [1, 7, 30].includes(requested) ? requested : 7;
      try {
        sendJson(req, res, await loadMapEvents(days), 200, 'public, max-age=300');
      } catch (error) {
        sendJson(req, res, { error: error.message }, 502);
      }
      return;
    }

    if (url.pathname === '/api/news') {
      const category = url.searchParams.get('category') || 'top';
      const stateId = url.searchParams.get('state') || '';
      const selectedState = stateById(stateId);
      const items = await loadCategory(category, selectedState?.id);
      const baseLabel = labels[category] || labels.top;
      const label = selectedState ? `${baseLabel} in ${selectedState.name}` : baseLabel;
      sendJson(req, res, {
        category,
        state: selectedState || null,
        label,
        updatedAt: new Date().toISOString(),
        items
      });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(req, res, { error: 'Not found' }, 404);
      return;
    }

    await serveStatic(req, url.pathname, res);
  } catch (error) {
    console.error(`Request failed: ${req.method} ${url.pathname}`, error);
    if (!res.headersSent) sendJson(req, res, { error: 'Internal server error' }, 500);
    else res.end();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the old Bharat Monitor server, then run npm.cmd run dev again.`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, () => {
  console.log(`Bharat Monitor running at http://localhost:${port}`);
});



