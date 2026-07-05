/**
 * Generates src/components/map/mapHtml.generated.ts — a self-contained Leaflet
 * map document (Leaflet + markercluster inlined; OSM tiles at runtime).
 * Regenerate after upgrading leaflet: `npm run generate:map-html` (from apps/mobile).
 * Mirrors the generate:help pattern — NEVER edit the generated file by hand.
 */
const fs = require('fs');
const path = require('path');

const nm = path.join(__dirname, '..', '..', '..', 'node_modules');
const read = (p) => fs.readFileSync(path.join(nm, p), 'utf8');
const readB64 = (p) => fs.readFileSync(path.join(nm, p)).toString('base64');

const leafletJs = read('leaflet/dist/leaflet.js');
const leafletCss = read('leaflet/dist/leaflet.css');
const clusterJs = read('leaflet.markercluster/dist/leaflet.markercluster.js');
const clusterCss =
  read('leaflet.markercluster/dist/MarkerCluster.css') +
  read('leaflet.markercluster/dist/MarkerCluster.Default.css');

// Default marker icon PNGs — embedded as data URIs (see icon fix in appJs below).
const markerIcon = readB64('leaflet/dist/images/marker-icon.png');
const markerIcon2x = readB64('leaflet/dist/images/marker-icon-2x.png');
const markerShadow = readB64('leaflet/dist/images/marker-shadow.png');

const appJs = `
// Leaflet's default marker CSS references image files by relative URL, which do
// not exist in this self-contained document — so markers render at the correct
// spot but with NO icon image. Embed the PNGs as data URIs and point the default
// icon at them. Must run before any L.marker is created.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'data:image/png;base64,${markerIcon2x}',
  iconUrl: 'data:image/png;base64,${markerIcon}',
  shadowUrl: 'data:image/png;base64,${markerShadow}',
});

var map = L.map('map', { zoomControl: false }).setView([50, 15], 4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
var cluster = L.markerClusterGroup();
map.addLayer(cluster);
var pickerMarker = null;
var cfg = { openLabel: 'Open', interactive: true, picker: false };

function send(msg) {
  var s = JSON.stringify(msg);
  if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(s); }
  else if (window.parent !== window) { window.parent.postMessage(s, '*'); }
}

window.__configure = function (options) {
  if (options.openLabel) cfg.openLabel = options.openLabel;
  if (options.interactive === false && cfg.interactive) {
    map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();
    if (map.tap) map.tap.disable();
    cfg.interactive = false;
  }
};

window.__setPoints = function (points) {
  cluster.clearLayers();
  var bounds = [];
  points.forEach(function (p) {
    var m = L.marker([p.lat, p.lng]);
    // Popup built via DOM APIs + textContent — user data (merchant names) must never be injected as HTML.
    var div = document.createElement('div');
    div.style.minWidth = '140px';
    var title = document.createElement('div');
    title.style.fontWeight = '600';
    title.textContent = p.title;
    var amount = document.createElement('div');
    amount.textContent = p.amountLabel;
    div.appendChild(title);
    div.appendChild(amount);
    if (cfg.interactive) {
      var btn = document.createElement('a');
      btn.href = '#';
      btn.textContent = cfg.openLabel;
      btn.style.display = 'inline-block';
      btn.style.marginTop = '6px';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        send({ type: 'open', id: p.id });
      });
      div.appendChild(btn);
    }
    m.bindPopup(div);
    cluster.addLayer(m);
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length === 1) { map.setView(bounds[0], 15); }
  else if (bounds.length > 1) { map.fitBounds(bounds, { padding: [30, 30] }); }
};

window.__setView = function (lat, lng, zoom) { map.setView([lat, lng], zoom); };

window.__setPicker = function (enabled) { cfg.picker = !!enabled; };

window.__setPickerPin = function (lat, lng) {
  if (pickerMarker) { pickerMarker.setLatLng([lat, lng]); }
  else {
    pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    pickerMarker.on('dragend', function () {
      var ll = pickerMarker.getLatLng();
      send({ type: 'mapPress', lat: ll.lat, lng: ll.lng });
    });
  }
};

map.on('click', function (e) {
  if (!cfg.picker) return;
  window.__setPickerPin(e.latlng.lat, e.latlng.lng);
  send({ type: 'mapPress', lat: e.latlng.lat, lng: e.latlng.lng });
});

send({ type: 'ready' });
`;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>${leafletCss}${clusterCss}
html, body, #map { height: 100%; margin: 0; padding: 0; background: #e8e8e8; }
</style>
</head>
<body>
<div id="map"></div>
<script>${leafletJs}</script>
<script>${clusterJs}</script>
<script>${appJs}</script>
</body>
</html>`;

const outDir = path.join(__dirname, '..', 'src', 'components', 'map');
fs.mkdirSync(outDir, { recursive: true });
const out =
  '// AUTO-GENERATED by scripts/build-map-html.js — DO NOT EDIT.\n' +
  '// Regenerate with: npm run generate:map-html (from apps/mobile)\n' +
  '/* eslint-disable */\n' +
  'export const MAP_HTML = ' + JSON.stringify(html) + ';\n';
fs.writeFileSync(path.join(outDir, 'mapHtml.generated.ts'), out);
console.log('Wrote mapHtml.generated.ts (' + Math.round(html.length / 1024) + ' KB)');
