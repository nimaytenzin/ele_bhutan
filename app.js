(function () {
  'use strict';

  var DZ_KEY = '_Dzongkhag';
  var LAA_KEY = 'LAA';

  var ATTR_OPTS = [
    { key: '_PGA M', label: 'PGA(g) 2009' },
    { key: '_E Loss M (in BTN million)', label: 'Economic Loss (BTN In million) 2009' },
    { key: '_PGA S', label: 'PGA(g) 2011' },
    { key: '_E Loss S (in BTN million)', label: 'Economic Loss (BTN In million) 2011' }
  ];

  var map, geoLayer, labelLayer, buildingLayer, data = null;
  var byDzongkhag = {};
  var dzongkhags = [];
  var currentDz = null;
  var DZ_TO_BUILDING_FILE = { 'Trashyangtse': 'Yangtse' };
  var valueKey = '_PGA M';
  var valueMin = 0;
  var valueMax = 1;
  var numClasses = 5;
  var classBreaks = [];
  var viewMode = 'default'; // 'default' | 'buildings-outline'

  var $dz = document.getElementById('dzongkhag');
  var $attr = document.getElementById('attribute');
  var $display = document.getElementById('display');
  var $legendLabel = document.getElementById('legend-label');

  function getAttrLabel(key) {
    for (var i = 0; i < ATTR_OPTS.length; i++) if (ATTR_OPTS[i].key === key) return ATTR_OPTS[i].label;
    return key;
  }

  function initMap() {
    map = L.map('map', {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.25
    }).setView([27.4, 90.4], 7);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google',
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20
    }).addTo(map);
  }

  function getBuildingPath(dzName) {
    var fileBase = DZ_TO_BUILDING_FILE[dzName] || dzName;
    return 'buildings/dzongkhag_' + fileBase + '.geojson';
  }

  function loadGeoJSON() {
    return fetch('gewogs.geojson').then(function (r) { return r.json(); });
  }

  function loadBuildings(dzName) {
    if (buildingLayer) {
      map.removeLayer(buildingLayer);
      buildingLayer = null;
    }
    var path = getBuildingPath(dzName);
    var buildingStyle = viewMode === 'buildings-outline'
      ? { fillColor: '#2563eb', fillOpacity: 1, color: '#1d4ed8', weight: 2 }
      : { fillColor: '#3b82f6', fillOpacity: 1, color: '#1d4ed8', weight: 1 };
    fetch(path)
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (geojson) {
        if (!geojson || !geojson.features || !geojson.features.length) return;
        buildingLayer = L.geoJSON(geojson, {
          style: buildingStyle
        }).addTo(map);
      })
      .catch(function () {});
  }

  function buildIndex(geojson) {
    data = geojson;
    byDzongkhag = {};
    (geojson.features || []).forEach(function (f) {
      var dz = (f.properties && f.properties[DZ_KEY]) || 'Unknown';
      if (!byDzongkhag[dz]) byDzongkhag[dz] = [];
      byDzongkhag[dz].push(f);
    });
    dzongkhags = Object.keys(byDzongkhag).sort();
  }

  function fillDzongkhagSelect() {
    $dz.innerHTML = '<option value="">— Select Dzongkhag —</option>';
    dzongkhags.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d;
      o.textContent = d;
      $dz.appendChild(o);
    });
  }

  function fillAttributeSelect() {
    $attr.innerHTML = '';
    ATTR_OPTS.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a.key;
      o.textContent = a.label;
      $attr.appendChild(o);
    });
  }

  function getColor(ratio) {
    if (ratio != null && (ratio < 0 || ratio > 1 || isNaN(ratio))) ratio = 0.5;
    if (ratio == null) ratio = 0.5;
    var r, g, b;
    if (ratio <= 0.5) {
      var t = ratio * 2;
      r = Math.round(0 + t * 255);
      g = 255;
      b = 0;
    } else {
      var t = (ratio - 0.5) * 2;
      r = 255;
      g = Math.round(255 - t * 255);
      b = 0;
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function getClassIndex(value) {
    if (value == null || isNaN(value) || classBreaks.length < 2) return 0;
    var t = (value - valueMin) / (valueMax - valueMin);
    t = Math.max(0, Math.min(1, t));
    return Math.min(numClasses - 1, Math.floor(t * numClasses));
  }

  function style(f) {
    if (viewMode === 'buildings-outline') {
      return {
        fillColor: '#fef9c3',
        fillOpacity: 0.6,
        color: '#ffffff',
        weight: 1.5
      };
    }
    var v = f.properties && f.properties[valueKey];
    var num = typeof v === 'number' && !isNaN(v) ? v : null;
    if (num == null) return { fillColor: '#94a3b8', fillOpacity: 0.5, color: '#ffffff', weight: 1.5 };
    var classIndex = getClassIndex(num);
    var ratio = (classIndex + 0.5) / numClasses;
    return {
      fillColor: getColor(ratio),
      fillOpacity: 0.55,
      color: '#ffffff',
      weight: 1.5
    };
  }

  function getLabelCenter(f, layer) {
    if (typeof turf === 'undefined') return layer.getBounds().getCenter();
    try {
      if (turf.pointOnFeature) {
        var pt = turf.pointOnFeature(f);
        var c = pt.geometry.coordinates;
        return L.latLng(c[1], c[0]);
      }
    } catch (e) {}
    try {
      if (turf.centerOfMass) {
        var pt = turf.centerOfMass(f);
        var c = pt.geometry.coordinates;
        return L.latLng(c[1], c[0]);
      }
    } catch (e) {}
    try {
      if (turf.centroid) {
        var pt = turf.centroid(f);
        var c = pt.geometry.coordinates;
        return L.latLng(c[1], c[0]);
      }
    } catch (e) {}
    return layer.getBounds().getCenter();
  }

  function addLabelForFeature(f, layer, name) {
    if (!name || !labelLayer) return;
    var center = getLabelCenter(f, layer);
    var ico = L.divIcon({
      className: 'gewog-label',
      html: '<div style="text-align: center; width: 100%;">' + name + '</div>',
      iconSize: [140, 22],
      iconAnchor: [70, 11]
    });
    L.marker(center, { icon: ico, interactive: false }).addTo(labelLayer);
  }

  function onEach(f, layer) {
    var p = f.properties || {};
    layer.bindPopup(
      '<strong>' + (p[LAA_KEY] || '—') + '</strong><br>' +
      'Dzongkhag: ' + (p[DZ_KEY] || '—') + '<br>' +
      getAttrLabel('_PGA M') + ': ' + (p['_PGA M'] != null ? p['_PGA M'] : '—') + '<br>' +
      getAttrLabel('_E Loss M (in BTN million)') + ': ' + (p['_E Loss M (in BTN million)'] != null ? p['_E Loss M (in BTN million)'] : '—') + '<br>' +
      getAttrLabel('_PGA S') + ': ' + (p['_PGA S'] != null ? p['_PGA S'] : '—') + '<br>' +
      getAttrLabel('_E Loss S (in BTN million)') + ': ' + (p['_E Loss S (in BTN million)'] != null ? p['_E Loss S (in BTN million)'] : '—')
    );
    addLabelForFeature(f, layer, p[LAA_KEY] || '');
  }

  function clearMap() {
    if (buildingLayer) {
      map.removeLayer(buildingLayer);
      buildingLayer = null;
    }
    if (labelLayer) {
      map.removeLayer(labelLayer);
      labelLayer = null;
    }
    if (geoLayer) {
      map.removeLayer(geoLayer);
      geoLayer = null;
    }
  }

  function updateLegend() {
    $legendLabel.textContent = getAttrLabel(valueKey) + ': green (low) → red (high)';
  }

  function formatVal(v) {
    if (v == null || isNaN(v)) return '—';
    return Number(v) < 0.01 ? v.toFixed(4) : (Number(v) < 1 ? v.toFixed(3) : v.toFixed(2));
  }

  function updateMapLegend(hasData) {
    var $legend = document.getElementById('map-legend');
    var outlineOnly = viewMode === 'buildings-outline';
    if ($legend) $legend.style.display = outlineOnly ? 'none' : '';
    if (outlineOnly) return;
    var $title = document.getElementById('map-legend-title');
    var $items = document.getElementById('map-legend-items');
    var $buildings = document.getElementById('map-legend-buildings');
    $title.textContent = getAttrLabel(valueKey) + ' (equal interval)';
    $items.innerHTML = '';
    var n = hasData ? numClasses : 5;
    for (var i = 0; i < n; i++) {
      var d = document.createElement('div');
      d.className = 'map-legend-item';
      var ratio = (i + 0.5) / n;
      var color = getColor(ratio);
      var label = hasData && classBreaks[i] != null && classBreaks[i + 1] != null
        ? formatVal(classBreaks[i]) + ' – ' + formatVal(classBreaks[i + 1])
        : '—';
      d.innerHTML = '<span class="map-legend-box" style="background:' + color + '"></span><span class="map-legend-value">' + label + '</span>';
      $items.appendChild(d);
    }
    if ($buildings) {
      $buildings.innerHTML = '';
      if (hasData) {
        var sep = document.createElement('div');
        sep.className = 'map-legend-sep';
        $buildings.appendChild(sep);
        var row = document.createElement('div');
        row.className = 'map-legend-item';
        row.innerHTML = '<span class="map-legend-box map-legend-box-building"></span><span class="map-legend-value">Building footprint</span>';
        $buildings.appendChild(row);
      }
    }
  }

  function redraw() {
    clearMap();
    if (!data || !currentDz) {
      updateMapLegend(false);
      return;
    }
    var features = byDzongkhag[currentDz] || [];
    if (features.length === 0) {
      updateMapLegend(false);
      return;
    }

    var vals = features.map(function (f) {
      var v = f.properties && f.properties[valueKey];
      return typeof v === 'number' && !isNaN(v) ? v : null;
    }).filter(function (n) { return n != null; });
    valueMin = vals.length ? Math.min.apply(null, vals) : 0;
    valueMax = vals.length ? Math.max.apply(null, vals) : 1;
    if (valueMax === valueMin) valueMax = valueMin + 1;

    numClasses = features.length < 8 ? 4 : 5;
    classBreaks = [];
    var step = (valueMax - valueMin) / numClasses;
    for (var i = 0; i <= numClasses; i++) {
      classBreaks.push(valueMin + i * step);
    }

    labelLayer = L.layerGroup().addTo(map);
    var collection = { type: 'FeatureCollection', features: features };
    geoLayer = L.geoJSON(collection, { style: style, onEachFeature: onEach }).addTo(map);
    loadBuildings(currentDz);

    var b = geoLayer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [20, 20], maxZoom: 16 });
    updateMapLegend(true);
  }

  function onDzChange() {
    currentDz = $dz.value || null;
    redraw();
  }

  function onAttrChange() {
    valueKey = $attr.value || '_PGA M';
    updateLegend();
    redraw();
  }

  function onDisplayChange() {
    viewMode = ($display && $display.value) || 'default';
    redraw();
  }

  function captureMapImage(filename) {
    var el = document.getElementById('map-export-container');
    if (!el || typeof html2canvas === 'undefined') return Promise.reject(new Error('Export not available'));
    if (map) map.invalidateSize();
    return html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#1a1a2e'
    }).then(function (canvas) {
      var link = document.createElement('a');
      link.download = filename || 'gewogs-map-' + (currentDz || 'all') + '-' + new Date().toISOString().slice(0, 10) + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  function saveAsImage() {
    var btn = document.getElementById('save-image');
    if (btn) { btn.disabled = true; btn.textContent = 'Exporting…'; }
    captureMapImage()
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = 'Save as image'; } })
      .catch(function (err) {
        console.error(err);
        if (btn) { btn.disabled = false; btn.textContent = 'Save as image'; }
        alert('Export failed. Try again.');
      });
  }

  function slug(str) {
    return (str || '').replace(/\s+/g, '-').replace(/[()]/g, '').replace(/[^a-zA-Z0-9-]/g, '') || 'attr';
  }

  function downloadAll() {
    var el = document.getElementById('map-export-container');
    if (!el || typeof html2canvas === 'undefined') {
      alert('Export not available. Ensure html2canvas is loaded.');
      return;
    }
    if (!dzongkhags.length || !ATTR_OPTS.length) return;
    var btn = document.getElementById('download-all');
    if (btn) { btn.disabled = true; btn.textContent = 'Downloading…'; }
    var combinations = [];
    for (var i = 0; i < dzongkhags.length; i++) {
      for (var j = 0; j < ATTR_OPTS.length; j++) {
        combinations.push({ dz: dzongkhags[i], attr: ATTR_OPTS[j] });
      }
    }
    var date = new Date().toISOString().slice(0, 10);
    var index = 0;
    function doNext() {
      if (index >= combinations.length) {
        if (btn) { btn.disabled = false; btn.textContent = 'Download all'; }
        return;
      }
      var c = combinations[index];
      $dz.value = c.dz;
      $attr.value = c.attr.key;
      currentDz = c.dz;
      valueKey = c.attr.key;
      updateLegend();
      redraw();
      index++;
      setTimeout(function () {
        captureMapImage('gewogs-' + slug(c.dz) + '-' + slug(c.attr.label) + '-' + date + '.png')
          .then(function () { setTimeout(doNext, 400); })
          .catch(function () { setTimeout(doNext, 400); });
      }, 1400);
    }
    doNext();
  }

  $dz.addEventListener('change', onDzChange);
  $attr.addEventListener('change', onAttrChange);
  if ($display) $display.addEventListener('change', onDisplayChange);
  if (document.getElementById('save-image')) {
    document.getElementById('save-image').addEventListener('click', saveAsImage);
  }
  if (document.getElementById('download-all')) {
    document.getElementById('download-all').addEventListener('click', downloadAll);
  }

  initMap();
  fillAttributeSelect();
  updateLegend();
  updateMapLegend(false);
  loadGeoJSON()
    .then(buildIndex)
    .then(fillDzongkhagSelect)
    .then(function () {
      if (dzongkhags.length) {
        $dz.value = dzongkhags[0];
        onDzChange();
      }
    })
    .catch(function (e) {
      console.error(e);
      alert('Could not load gewogs.geojson. Serve this folder with a local server (e.g. npx serve or python -m http.server).');
    });
})();
