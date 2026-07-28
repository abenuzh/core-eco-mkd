// CORE.ECO · МКД — автоматическая гео-проверка критериев категории 1 (ГОСТ 35329-2026, п. 6.5: «Проверка осуществляется по ГИС»)
// Используются открытые сервисы OpenStreetMap: Nominatim (геокодирование адреса) и Overpass API (поиск объектов рядом).
// Это предварительная проверка, не заменяющая официальную по ЕИСЖС/ГИС — см. дисклеймер в интерфейсе.
(function (global) {
  'use strict';

  var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
  // несколько публичных зеркал Overpass API — при сбое/перегрузке одного пробуем следующее (см. правку №6).
  // 260728: УБРАН overpass.osm.ch — это зеркало Швейцарского сообщества OSM, оно содержит данные ТОЛЬКО
  // по Швейцарии. Проверено вживую: кафе в радиусе 500 м — Цюрих 30 объектов, Москва/СПб — 0. Оно отвечало
  // HTTP 200 с пустым списком, поэтому переключения на резерв не происходило, и авто-проверка по всей России
  // выдавала «ничего не найдено». Теперь первыми идут зеркала с полными (общемировыми/российскими) данными.
  var OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  var FETCH_TIMEOUT_MS = 8000; // без таймаута зависший сервер держит запрос десятками секунд — пользователю кажется, что сайт не работает

  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    options = options || {};
    options.signal = controller.signal;
    return fetch(url, options).finally(function () { clearTimeout(timer); });
  }

  // геокодируем сначала адрес как есть; если Nominatim ничего не нашёл (частый случай для домов,
  // которых ещё нет в адресной базе OSM — тогда добавление страны в конце ломает даже поиск по улице,
  // см. правку 260720) — пробуем ещё раз с явным "Россия" в конце, это иногда помогает по-другому.
  function geocodeAddress(address) {
    return geocodeOnce(address).catch(function (err) {
      if (err.message === 'not-found' && !/росси/i.test(address)) {
        return geocodeOnce(address + ', Россия');
      }
      throw err;
    });
  }

  function geocodeOnce(address, attempt) {
    attempt = attempt || 1;
    var url = NOMINATIM_URL + '?format=json&limit=1&addressdetails=0&q=' + encodeURIComponent(address);
    return fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('geocode-failed'); return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) throw new Error('not-found');
        return { lat: parseFloat(rows[0].lat), lon: parseFloat(rows[0].lon), label: rows[0].display_name };
      })
      .catch(function (err) {
        if (err.message === 'not-found') throw err; // адрес не найден — повтор с тем же текстом бессмысленен
        if (attempt < 2) return delay(700).then(function () { return geocodeOnce(address, attempt + 1); });
        throw err;
      });
  }

  // конфигурация OSM-тегов и радиусов по каждому геопроверяемому критерию категории 1
  var GEO_RULES = {
    '1.1': { mode: 'presence', radius: 500, query: '[highway=bus_stop][railway=tram_stop][railway=station][public_transport=platform]', label: 'Остановка общественного транспорта' },
    '1.2a': { mode: 'presence', radius: 700, query: '[amenity=kindergarten]', label: 'Дошкольная образовательная организация' },
    '1.2b': { mode: 'presence', radius: 1000, query: '[amenity=school]', label: 'Общеобразовательная организация' },
    '1.2c': { mode: 'presence', radius: 1500, query: '[amenity=clinic][amenity=hospital][amenity=doctors]', label: 'Лечебно-профилактическая организация' },
    '1.3a': { mode: 'presence', radius: 500, query: '[shop=supermarket][shop=convenience][shop=grocery]', label: 'Продуктовый магазин' },
    '1.3b': { mode: 'presence', radius: 1000, query: '[amenity=restaurant][amenity=cafe][amenity=fast_food]', label: 'Объект общественного питания' },
    '1.4': { mode: 'presence', radius: 1500, query: '[leisure=park][landuse=forest][leisure=garden]', label: 'Озеленённая территория общего пользования' },
    '1.5': { mode: 'presence', radius: 1000, query: '[leisure=sports_centre][leisure=fitness_centre][leisure=stadium][leisure=pitch]', label: 'Объект спортивной инфраструктуры' },
    // ГОСТ 1.6: искусственный водоём (пруд/фонтан) в 500 м ИЛИ естественный водоём в 1000 м — две ветки,
    // критерий засчитывается, если выполнена ЛЮБАЯ (логика ИЛИ обрабатывается в wizard.js).
    '1.6a': { mode: 'presence', radius: 500, query: '[amenity=fountain][water=pond][water=reservoir][leisure=water_park]', label: 'Искусственный водоём (пруд, фонтан)' },
    '1.6b': { mode: 'presence', radius: 1000, query: '[natural=water][waterway=river][waterway=stream]', label: 'Естественный водоём (река, озеро)' },
    '1.7': { mode: 'absence', radius: 1000, query: '[highway=motorway][highway=trunk]', label: 'Автомобильная дорога национального значения' },
    // ГОСТ 1.8: добавлены полигоны/станции ТКО. Психоневрологические/наркологические больницы в OSM
    // размечены нестабильно и надёжно не проверяются автоматически — их пользователь отмечает вручную.
    '1.8': { mode: 'absence', radius: 1000, query: '[amenity=grave_yard][landuse=cemetery][amenity=crematorium][amenity=prison][landuse=landfill][amenity=waste_transfer_station]', label: 'Опасный/нежелательный объект (кладбище, СИЗО, крематорий, полигон ТКО и т.п.)' }
  };

  function buildOverpassQL(lat, lon, radius, tagExpr) {
    // tagExpr вида "[highway=bus_stop][railway=station]" -> отдельные ветки поиска (nwr) по каждому тегу
    var tags = tagExpr.match(/\[[^\]]+\]/g) || [];
    var branches = tags.map(function (t) {
      return 'nwr' + t + '(around:' + radius + ',' + lat + ',' + lon + ');';
    }).join('\n');
    return '[out:json][timeout:20];(' + branches + ');out center 5;';
  }

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function queryOverpass(ql, mirrorIndex) {
    mirrorIndex = mirrorIndex || 0;
    var url = OVERPASS_MIRRORS[mirrorIndex];
    return fetchWithTimeout(url, { method: 'POST', body: 'data=' + encodeURIComponent(ql) })
      .then(function (r) {
        if (!r.ok) throw new Error('overpass-failed-' + r.status);
        return r.json();
      })
      .catch(function (err) {
        var nextMirror = mirrorIndex + 1;
        if (nextMirror < OVERPASS_MIRRORS.length) {
          return delay(400).then(function () { return queryOverpass(ql, nextMirror); });
        }
        throw err;
      });
  }

  function checkRule(ruleKey, lat, lon) {
    var rule = GEO_RULES[ruleKey];
    if (!rule) return Promise.reject(new Error('unknown-rule'));
    var ql = buildOverpassQL(lat, lon, rule.radius, rule.query);
    return queryOverpass(ql).then(function (json) {
      var els = json.elements || [];
      var nearest = null;
      els.forEach(function (el) {
        var elat = el.lat || (el.center && el.center.lat);
        var elon = el.lon || (el.center && el.center.lon);
        if (elat == null || elon == null) return;
        var d = haversine(lat, lon, elat, elon);
        if (nearest === null || d < nearest) nearest = d;
      });
      var found = els.length > 0;
      var pass = rule.mode === 'presence' ? found : !found;
      return { rule: rule, found: found, nearest: nearest, pass: pass, radius: rule.radius };
    });
  }

  global.CoreEcoOSM = { geocodeAddress: geocodeAddress, checkRule: checkRule, GEO_RULES: GEO_RULES };
})(window);
