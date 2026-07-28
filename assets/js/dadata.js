// CORE.ECO · МКД — подсказки и распознавание адреса через DaData (сервис «Подсказки»/Suggestions).
// Позволяет вводить адрес в любом виде («мск тверская 1», с опечатками, в любом порядке) и выбрать
// реальный дом из списка ФИАС с точными координатами — вместо «угадывания» первого результата OSM.
// Токен берётся из config.js (window.CORE_ECO_CONFIG.DADATA_TOKEN). Это ПУБЛИЧНЫЙ токен подсказок,
// он виден в браузере по дизайну; защита — ограничение по домену в личном кабинете DaData.
(function (global) {
  'use strict';

  var SUGGEST_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
  var TIMEOUT_MS = 8000;

  function token() { return (global.CORE_ECO_CONFIG && global.CORE_ECO_CONFIG.DADATA_TOKEN) || ''; }
  function hasToken() { var t = token(); return !!t && t.indexOf('YOUR_') === -1; }

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    options = options || {};
    options.signal = controller.signal;
    return fetch(url, options).finally(function () { clearTimeout(timer); });
  }

  // список подсказок по введённому тексту (пусто, если токена нет или запрос слишком короткий)
  function suggest(query) {
    if (!hasToken() || !query || query.trim().length < 3) return Promise.resolve([]);
    return fetchWithTimeout(SUGGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Token ' + token() },
      body: JSON.stringify({ query: query, count: 6 })
    }).then(function (r) { if (!r.ok) throw new Error('dadata-' + r.status); return r.json(); })
      .then(function (j) { return (j && j.suggestions) || []; });
  }

  // из подсказки DaData достаём то, что нужно гео-проверке: координаты + признаки точности.
  // qc_geo: '0' — точные координаты дома, '1' — ближайший дом, '2' — улица, '3' — нас.пункт, '4' — город, '5' — нет.
  function toGeo(s) {
    var d = (s && s.data) || {};
    var lat = d.geo_lat != null ? parseFloat(d.geo_lat) : null;
    var lon = d.geo_lon != null ? parseFloat(d.geo_lon) : null;
    var precise = d.qc_geo === '0' || d.qc_geo === '1';
    return { lat: lat, lon: lon, label: s.value, hasHouse: !!d.house, precise: precise, qcGeo: d.qc_geo };
  }

  // геокодирование строки адреса: берём лучшую подсказку, у которой есть координаты.
  // DaData уверенно парсит российские адреса, включая корпуса («д 4 к 6»), где OSM/Nominatim часто пасует.
  function geocode(query) {
    return suggest(query).then(function (list) {
      var withCoords = [];
      for (var i = 0; i < list.length; i++) {
        var g = toGeo(list[i]);
        if (g.lat != null && g.lon != null) withCoords.push(g);
      }
      if (!withCoords.length) throw new Error('not-found');
      // предпочитаем точный дом улице/городу (напр. «тверская 1» → «ул Тверская, д 1», а не «1-я Тверская-Ямская»)
      for (var j = 0; j < withCoords.length; j++) { if (withCoords[j].hasHouse && withCoords[j].precise) return withCoords[j]; }
      return withCoords[0];
    });
  }

  global.CoreEcoDaData = { suggest: suggest, toGeo: toGeo, geocode: geocode, hasToken: hasToken };
})(window);
