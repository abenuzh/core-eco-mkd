// CORE.ECO · МКД — мастер предварительной оценки по ГОСТ 35329-2026
// Логика соответствует раздела 6-7 стандарта: обязательные критерии дают допуск к рейтингу,
// баллы = сумма basePoints обязательных + (сумма basePoints добровольных + все бонусы) — см. Приложение А.
(function () {
  'use strict';

  var FORM_ENDPOINT = (window.CORE_ECO_CONFIG && window.CORE_ECO_CONFIG.LEAD_ENDPOINT) || 'https://formspree.io/f/YOUR_FORM_ID';

  var ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'];
  var MAX_FILE_MB = 20;
  var MAX_FILES_PER_CRITERION = 5;
  var uploadErrors = {}; // code -> текст ошибки валидации файла (переживает render(), т.к. хранится вне STATE)

  var STATE = {
    step: 0, // 0 = стадия, 1..10 = категории, 11 = результат
    stage: null, // 'project' | 'operation'
    address: '',
    geo: null,
    geoStatus: '',
    answers: {} // code -> { satisfied: bool|undefined, bonus: bool, files: [{name,size}], geo: {...} }
  };

  function ans(code) {
    if (!STATE.answers[code]) STATE.answers[code] = { satisfied: undefined, bonus: false, files: [] };
    return STATE.answers[code];
  }

  // ---------------------------------------------------------------- переход сразу к нужной категории (клик по карточке на главной)
  function getCatParam() {
    var m = /[?&]cat=(\d+)/.exec(location.search);
    var n = m && parseInt(m[1], 10);
    return (n >= 1 && n <= 10) ? n : null;
  }
  var pendingCategory = getCatParam();
  if (pendingCategory && window.history && window.history.replaceState) {
    window.history.replaceState(null, '', location.pathname);
  }

  // ---------------------------------------------------------------- автосохранение прогресса в этом браузере
  var restoreBanner = '';
  function persist() {
    if (window.CoreEcoPersistence) window.CoreEcoPersistence.saveState(STATE);
  }

  function restoreFromStorage() {
    if (!window.CoreEcoPersistence) return;
    var saved = window.CoreEcoPersistence.loadState();
    if (!saved) return;
    STATE.step = saved.step || 0;
    STATE.stage = saved.stage || null;
    STATE.address = saved.address || '';
    STATE.geo = saved.geo || null;
    STATE.geoStatus = saved.geoStatus || '';
    Object.keys(saved.answers || {}).forEach(function (code) {
      var s = saved.answers[code];
      STATE.answers[code] = { satisfied: s.satisfied, bonus: s.bonus, geo: s.geo, files: [] };
    });
    var anyAnswered = Object.keys(STATE.answers).length > 0;
    if (anyAnswered || STATE.stage) {
      restoreBanner = '<div class="side-note" style="margin-bottom:16px;border-color:var(--signal-500);"><b>Продолжаем сохранённую сессию.</b> Прогресс и файлы этого браузера восстановлены. <a href="#" id="resetProgress" style="color:var(--red-500);text-decoration:underline;">Начать заново</a></div>';
    }
    window.CoreEcoPersistence.loadAllFiles().then(function (byCode) {
      Object.keys(byCode).forEach(function (code) { ans(code).files = byCode[code]; });
      render();
    }).catch(function () {});
  }

  function resetProgress() {
    if (!confirm('Удалить сохранённый прогресс и все загруженные файлы в этом браузере?')) return;
    STATE.step = 0; STATE.stage = null; STATE.address = ''; STATE.geo = null; STATE.geoStatus = ''; STATE.answers = {};
    restoreBanner = '';
    if (window.CoreEcoPersistence) window.CoreEcoPersistence.clearState();
    render();
  }

  function allCriteria() {
    var list = [];
    GOST_DATA.categories.forEach(function (c) {
      c.criteria.forEach(function (cr) { list.push({ cat: c, cr: cr }); });
    });
    return list;
  }

  // ---------------------------------------------------------------- расчёт баллов
  function computeScore() {
    var mandatoryMax = { bronze: 0, silver: 0, gold: 0 };
    var mandatoryEarned = { bronze: 0, silver: 0, gold: 0 };
    var voluntaryMax = 0, voluntaryEarned = 0;
    var byCategory = {};

    GOST_DATA.categories.forEach(function (c) {
      byCategory[c.id] = { id: c.id, name: c.name, max: 0, earned: 0 };
    });

    allCriteria().forEach(function (item) {
      var cr = item.cr, cat = item.cat;
      var a = STATE.answers[cr.code];
      var base = cr.basePoints || 0;
      var bonus = cr.bonusPoints || 0;
      var catRow = byCategory[cat.id];

      if (cr.mandatoryTier) {
        mandatoryMax[cr.mandatoryTier] += base;
        catRow.max += base;
        if (a && a.satisfied) { mandatoryEarned[cr.mandatoryTier] += base; catRow.earned += base; }
      } else {
        voluntaryMax += base;
        catRow.max += base;
        if (a && a.satisfied) { voluntaryEarned += base; catRow.earned += base; }
      }
      if (bonus) {
        voluntaryMax += bonus;
        catRow.max += bonus;
        if (a && a.satisfied && a.bonus) { voluntaryEarned += bonus; catRow.earned += bonus; }
      }
    });

    var mandatoryEarnedTotal = mandatoryEarned.bronze + mandatoryEarned.silver + mandatoryEarned.gold;
    var mandatoryMaxTotal = mandatoryMax.bronze + mandatoryMax.silver + mandatoryMax.gold;
    var totalEarned = mandatoryEarnedTotal + voluntaryEarned;
    var totalMax = mandatoryMaxTotal + voluntaryMax; // = 132
    var percent = totalMax ? (totalEarned / totalMax * 100) : 0;

    function tierUnmet(tier) {
      var unmet = [];
      allCriteria().forEach(function (item) {
        if (item.cr.mandatoryTier === tier) {
          var a = STATE.answers[item.cr.code];
          if (!a || !a.satisfied) unmet.push(item);
        }
      });
      return unmet;
    }
    var unmetBronze = tierUnmet('bronze');
    var unmetSilver = tierUnmet('silver');
    var unmetGold = tierUnmet('gold');

    var tier = 'none';
    if (unmetBronze.length === 0) tier = 'bronze';
    if (unmetBronze.length === 0 && unmetSilver.length === 0 && percent > 50) tier = 'silver';
    if (unmetBronze.length === 0 && unmetSilver.length === 0 && unmetGold.length === 0 && percent > 70) tier = 'gold';

    return {
      mandatoryEarned: mandatoryEarnedTotal, mandatoryMax: mandatoryMaxTotal,
      voluntaryEarned: voluntaryEarned, voluntaryMax: voluntaryMax,
      totalEarned: totalEarned, totalMax: totalMax, percent: percent,
      byCategory: Object.keys(byCategory).map(function (k) { return byCategory[k]; }),
      unmetBronze: unmetBronze, unmetSilver: unmetSilver, unmetGold: unmetGold,
      tier: tier
    };
  }

  // ---------------------------------------------------------------- рендер степпера
  // На десктопе 12 шагов (стадия + 10 категорий + результат) не помещались в контейнер и обрезались
  // после ~9-го шага без намёка на прокрутку (правка №10). Решение: у шагов-категорий убран
  // повторяющий номер текст (он и так есть в самом кружке и в заголовке категории), плюс активный
  // шаг всегда докручивается в видимую область, плюс страховка — растушёванные края при переполнении.
  function renderStepper() {
    var el = document.getElementById('stepper');
    if (!el) return;
    var html = '<div class="assess-step ' + (STATE.step === 0 ? 'active' : STATE.step > 0 ? 'done' : '') + '" data-go="0"><span class="dot">S</span>Стадия</div>';
    for (var i = 1; i <= 10; i++) {
      html += '<div class="assess-connector"></div>';
      html += '<div class="assess-step ' + (STATE.step === i ? 'active' : STATE.step > i ? 'done' : '') + '" data-go="' + i + '" title="Категория ' + i + '"><span class="dot">' + i + '</span></div>';
    }
    html += '<div class="assess-connector"></div>';
    html += '<div class="assess-step ' + (STATE.step === 11 ? 'active' : '') + '" data-go="11"><span class="dot">✓</span>Результат</div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-go]').forEach(function (n) {
      n.addEventListener('click', function () {
        var target = parseInt(n.getAttribute('data-go'), 10);
        if (target <= maxReachableStep()) { STATE.step = target; render(); }
      });
    });
    var activeEl = el.querySelector('.assess-step.active');
    if (activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function maxReachableStep() {
    if (!STATE.stage) return 0;
    return 11; // после выбора стадии разрешаем свободно перемещаться по всем шагам
  }

  // ---------------------------------------------------------------- экран 0: стадия
  function renderStageScreen(main) {
    main.innerHTML = ''
      + (firstRender ? restoreBanner : '')
      + '<div class="eyebrow">Шаг 1 из 12 · п. 6.4–6.6 ГОСТ 35329—2026</div>'
      + '<h2 class="h-md">На какой стадии находится дом?</h2>'
      + '<p style="margin-top:12px;color:var(--ink-700);max-width:640px;">От стадии зависит, какими документами подтверждаются «зелёные» критерии — проектной документацией, прошедшей экспертизу, или актами и данными по факту эксплуатации.</p>'
      + '<div class="stage-grid">'
      + '  <button class="stage-card ' + (STATE.stage === 'project' ? 'selected' : '') + '" data-stage="project">'
      + '    <div class="stage-icon">' + iconDoc() + '</div>'
      + '    <h4>Проект, прошедший экспертизу</h4>'
      + '    <p>Дом ещё не построен или строится. Критерии подтверждаются разделами проектной документации и положительным заключением экспертизы.</p>'
      + '    <div class="stage-basis">Основание: п. 6.5 ГОСТ 35329—2026</div>'
      + '  </button>'
      + '  <button class="stage-card ' + (STATE.stage === 'operation' ? 'selected' : '') + '" data-stage="operation">'
      + '    <div class="stage-icon">' + iconBuilding() + '</div>'
      + '    <h4>Построен и введён в эксплуатацию</h4>'
      + '    <p>Получено разрешение на ввод объекта в эксплуатацию. Критерии подтверждаются актами, замерами и данными по факту эксплуатации дома.</p>'
      + '    <div class="stage-basis">Основание: п. 6.6 ГОСТ 35329—2026</div>'
      + '  </button>'
      + '</div>'
      + '<div class="assess-nav"><span></span><button class="btn btn-primary" id="stageNext" ' + (STATE.stage ? '' : 'disabled') + '>Продолжить →</button></div>';

    main.querySelectorAll('[data-stage]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        STATE.stage = btn.getAttribute('data-stage');
        render();
      });
    });
    var nextBtn = document.getElementById('stageNext');
    if (nextBtn) nextBtn.addEventListener('click', function () { STATE.step = pendingCategory || 1; pendingCategory = null; render(); });
  }

  function iconDoc() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6"/></svg>'; }
  function iconBuilding() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 21V6l8-3 8 3v15" stroke="currentColor" stroke-width="1.6"/><path d="M9 21v-4h6v4M9 10h.01M14 10h.01M9 14h.01M14 14h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'; }

  // ---------------------------------------------------------------- экран категории
  function renderCategoryScreen(main, catId) {
    var cat = GOST_DATA.categories.filter(function (c) { return c.id === catId; })[0];
    var answeredCount = cat.criteria.filter(function (cr) { return STATE.answers[cr.code] && STATE.answers[cr.code].satisfied !== undefined; }).length;

    var html = (firstRender ? restoreBanner : '')
      + '<div class="cat-header">'
      + '<div><div class="cat-index">Категория ' + cat.id + ' / 10</div><h2 class="h-md">' + cat.name + '</h2></div>'
      + '<div class="cat-progress">Отмечено ' + answeredCount + ' из ' + cat.criteria.length + '</div>'
      + '</div>';

    if (cat.id === 1) {
      html += '<div class="geo-box">'
        + '<label>Адрес дома (для автоматической проверки критериев 1.1–1.8 по OpenStreetMap)</label>'
        + '<div class="geo-row"><input class="field" id="geoAddress" placeholder="Например: Москва, ул. Тверская, д. 1" value="' + (STATE.address || '') + '"><button class="btn btn-primary btn-sm" id="geoGo" style="flex-shrink:0">Определить координаты</button></div>'
        + '<div class="geo-hint">Формат: город, улица, номер дома — через запятую, без «г.», «ул.» обязательно писать не нужно. Чем точнее адрес, тем надёжнее автопроверка.</div>'
        + '<div class="geo-status" id="geoStatusEl">' + (STATE.geoStatus || 'Проверка — предварительная, по открытым данным OSM. Не заменяет официальную проверку по ЕИСЖС/ГИС.') + '</div>'
        + '</div>';
    }

    cat.criteria.forEach(function (cr) { html += criterionCardHtml(cr); });

    html += '<div class="assess-nav">'
      + '<button class="btn btn-outline-dark" id="catBack">← Назад</button>'
      + '<button class="btn btn-primary" id="catNext">' + (catId === 10 ? 'К результату →' : 'Следующая категория →') + '</button>'
      + '</div>';

    main.innerHTML = html;
    wireCategoryEvents(main, cat);
  }

  function badgeHtml(cr) {
    var badges = '';
    if (cr.mandatoryTier) {
      var label = cr.mandatoryTier === 'bronze' ? '* Бронза' : cr.mandatoryTier === 'silver' ? '** Серебро' : '*** Золото';
      badges += '<span class="badge mand-' + cr.mandatoryTier + '">' + label + '</span>';
    } else {
      badges += '<span class="badge voluntary">Добровольный</span>';
    }
    var pts = cr.basePoints || 0;
    badges += '<span class="badge pts">' + pts + (cr.bonusPoints ? ' (+' + cr.bonusPoints + ')' : '') + ' балл.</span>';
    return badges;
  }

  function criterionCardHtml(cr) {
    var a = ans(cr.code);
    var stateClass = a.satisfied === true ? 'answered' : a.satisfied === false ? 'skipped' : '';
    var geoRuleKeys = geoKeysFor(cr.code);
    var html = '<div class="criterion ' + stateClass + '" data-code="' + cr.code + '">'
      + '  <div class="criterion-head">'
      + '    <div><div class="criterion-code">' + cr.code + '</div><div class="criterion-title">' + cr.name + '</div></div>'
      + '    <div class="criterion-badges">' + badgeHtml(cr) + '</div>'
      + '  </div>'
      + '  <div class="criterion-req">' + escapeHtml(cr.requirementText || '') + '</div>';
    if (cr.verificationText) {
      html += '<div class="criterion-verify"><b>Как подтверждается:</b> ' + escapeHtml(cr.verificationText) + '</div>';
    }
    var notSatisfied = a.satisfied === false;
    html += '<div class="criterion-answer">'
      + '  <button class="opt-btn ' + (a.satisfied === true ? 'on' : '') + '" data-ans="' + cr.code + '" data-val="yes">✓ Выполнено</button>'
      + '  <button class="opt-btn ' + (a.satisfied === false ? 'off-x' : '') + '" data-ans="' + cr.code + '" data-val="no">✕ Не выполнено</button>';
    if (cr.bonusPoints) {
      html += '<label class="opt-btn ' + (notSatisfied ? 'disabled' : '') + '" style="display:inline-flex;align-items:center;gap:6px;cursor:' + (notSatisfied ? 'not-allowed' : 'pointer') + ';">'
        + '<input type="checkbox" data-bonus="' + cr.code + '" ' + (a.bonus ? 'checked' : '') + (notSatisfied ? ' disabled' : '') + ' style="margin:0"> + доп. балл (' + cr.bonusPoints + ')</label>';
    }
    html += '</div>';

    if (notSatisfied) {
      html += '<div class="criterion-blocked-note">Критерий отмечен как «Не выполнено» — загрузка файлов и доп. баллы недоступны, пока вы не измените статус выше.</div>';
    }

    if (geoRuleKeys.length) {
      html += '<div class="geo-check-row"><button class="btn btn-outline-dark btn-sm" data-geocheck="' + cr.code + '">Проверить по адресу (OSM)</button><span class="result" id="georesult-' + cr.code + '">' + geoResultLabel(cr.code) + '</span></div>';
    }

    html += '<div class="upload-zone' + (notSatisfied ? ' zone-disabled' : '') + '" data-drop="' + cr.code + '">'
      + '  <div class="upload-icon">' + iconUpload() + '</div>'
      + '  <div class="upload-text"><b>Загрузите файл</b> или перетащите сюда — подтверждающий документ по этому критерию'
      + '    <div class="upload-limits">PDF, JPG, PNG, DOC(X), XLS(X) · до ' + MAX_FILE_MB + ' МБ на файл · не более ' + MAX_FILES_PER_CRITERION + ' файлов</div>'
      + '  </div>'
      + '  <input type="file" multiple id="file-' + cr.code + '" accept="' + ALLOWED_EXT.map(function (e) { return '.' + e; }).join(',') + '" ' + (notSatisfied ? 'disabled' : '') + '>'
      + '</div>'
      + '<div class="upload-err" id="err-' + cr.code + '">' + escapeHtml(uploadErrors[cr.code] || '') + '</div>'
      + '<div id="files-' + cr.code + '">' + filesChipsHtml(cr.code) + '</div>';

    html += '</div>';
    return html;
  }

  function iconUpload() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" stroke-width="1.6"/></svg>'; }

  function filesChipsHtml(code) {
    var a = ans(code);
    if (!a.files.length) return '';
    return a.files.map(function (f, i) {
      return '<span class="file-chip">' + escapeHtml(f.name) + '<button data-rmfile="' + code + '" data-idx="' + i + '">×</button></span>';
    }).join('');
  }

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // сопоставление кода критерия со связкой правил геопроверки (см. assets/js/osm.js GEO_RULES)
  function geoKeysFor(code) {
    var map = { '1.1': ['1.1'], '1.2': ['1.2a', '1.2b', '1.2c'], '1.3': ['1.3a', '1.3b'], '1.4': ['1.4'], '1.5': ['1.5'], '1.6': ['1.6'], '1.7': ['1.7'], '1.8': ['1.8'] };
    return map[code] || [];
  }

  function geoResultLabel(code) {
    var a = ans(code);
    if (!a.geo) return 'ещё не проверено';
    return a.geo.summary;
  }

  // приводим адрес к единому шаблону перед геокодированием: убираем лишние пробелы и нормализуем запятые.
  // 260720: сокращение "г." перед названием города (напр. "г. Уфа") ломает поиск в Nominatim — иногда
  // возвращает пустой результат, иногда подставляет совсем другой город с похожим названием улицы
  // (проверено вживую: "г. Москва, Тверская, 1" находит Тверскую в Солнечногорске, а не Москву).
  // Поэтому убираем "г."/"г "/"город" перед словом с заглавной буквы в начале сегмента адреса.
  // "Россия" в конце раньше подставлялась всегда здесь, но выяснилось (см. osm.js geocodeAddress), что
  // на домах, которых ещё нет в адресной базе OSM (обычная ситуация вне центра города), трейлинг-страна
  // ломает поиск целиком — поэтому подстановка страны перенесена в osm.js как запасной второй шаг.
  function normalizeAddress(address) {
    var a = address.replace(/\s+/g, ' ').trim();
    a = a.replace(/\s*,\s*/g, ', ').replace(/,+/g, ',').replace(/,\s*$/, '');
    a = a.replace(/(^|,\s*)г(?:ор(?:од)?)?\.?\s+(?=[А-ЯЁ])/gi, '$1');
    return a;
  }

  function wireCategoryEvents(main, cat) {
    var addrInput = document.getElementById('geoAddress');
    var geoGo = document.getElementById('geoGo');
    if (geoGo) {
      geoGo.addEventListener('click', function () {
        var raw = addrInput.value.trim();
        if (!raw) return;
        var address = normalizeAddress(raw);
        addrInput.value = address;
        STATE.address = address;
        var statusEl = document.getElementById('geoStatusEl');
        statusEl.textContent = 'Определяем координаты…';
        statusEl.className = 'geo-status';
        CoreEcoOSM.geocodeAddress(address).then(function (geo) {
          STATE.geo = geo;
          statusEl.textContent = 'Координаты найдены: ' + geo.label;
          statusEl.className = 'geo-status';
        }).catch(function (err) {
          if (err && err.message === 'not-found') {
            statusEl.textContent = 'Адрес не найден в OpenStreetMap. Проверьте написание (город, улица, номер дома) или заполните критерии вручную по ЕИСЖС/ГИС.';
          } else {
            statusEl.textContent = 'Сервис геокодирования временно недоступен. Попробуйте ещё раз через минуту или заполните критерии вручную по ЕИСЖС/ГИС.';
          }
          statusEl.className = 'geo-status err';
        });
      });
    }

    main.querySelectorAll('[data-geocheck]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-geocheck');
        if (!STATE.geo) { alert('Сначала укажите и определите адрес дома выше.'); return; }
        var keys = geoKeysFor(code);
        var resultEl = document.getElementById('georesult-' + code);
        resultEl.textContent = 'проверяем…';
        Promise.all(keys.map(function (k) { return CoreEcoOSM.checkRule(k, STATE.geo.lat, STATE.geo.lon); }))
          .then(function (results) {
            var pass = results.every(function (r) { return r.pass; });
            var details = results.map(function (r) {
              var distTxt = r.nearest != null ? Math.round(r.nearest) + ' м' : '—';
              return r.rule.label + ': ' + (r.found ? 'найдено (' + distTxt + ')' : 'не найдено') + ' в радиусе ' + r.radius + ' м';
            }).join('; ');
            var a = ans(code);
            a.geo = { pass: pass, summary: (pass ? '✓ похоже, выполнено — ' : '⚠ похоже, не выполнено — ') + details };
            a.satisfied = pass;
            resultEl.innerHTML = '<b>' + (pass ? 'вероятно да' : 'вероятно нет') + '</b> — ' + details;
            renderCurrent();
          })
          .catch(function () {
            resultEl.textContent = 'сервис OSM сейчас недоступен (попробовали основной и резервный сервер) — отметьте критерий вручную по ЕИСЖС/ГИС';
          });
      });
    });

    main.querySelectorAll('[data-ans]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-ans');
        var val = btn.getAttribute('data-val') === 'yes';
        var a = ans(code);
        a.satisfied = (a.satisfied === val) ? undefined : val;
        if (!a.satisfied) a.bonus = false;
        renderCurrent();
      });
    });

    main.querySelectorAll('[data-bonus]').forEach(function (chk) {
      chk.addEventListener('change', function () {
        ans(chk.getAttribute('data-bonus')).bonus = chk.checked;
        updateSidebar();
      });
    });

    main.querySelectorAll('[data-drop]').forEach(function (zone) {
      var code = zone.getAttribute('data-drop');
      var input = zone.querySelector('input[type=file]');
      function isBlocked() { return ans(code).satisfied === false; }
      zone.addEventListener('click', function () { if (!isBlocked()) input.click(); });
      input.addEventListener('change', function () { if (!isBlocked()) handleFiles(code, input.files); });
      ['dragenter', 'dragover'].forEach(function (evt) {
        zone.addEventListener(evt, function (e) { e.preventDefault(); if (!isBlocked()) zone.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.remove('drag'); });
      });
      zone.addEventListener('drop', function (e) { if (!isBlocked()) handleFiles(code, e.dataTransfer.files); });
    });

    main.querySelectorAll('[data-rmfile]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var code = btn.getAttribute('data-rmfile');
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var removed = ans(code).files.splice(idx, 1)[0];
        if (removed && window.CoreEcoPersistence) window.CoreEcoPersistence.removeFile(code, removed.name, removed.size);
        document.getElementById('files-' + code).innerHTML = filesChipsHtml(code);
        persist();
      });
    });

    document.getElementById('catBack').addEventListener('click', function () { STATE.step -= 1; render(); });
    document.getElementById('catNext').addEventListener('click', function () { STATE.step += 1; render(); });
  }

  function handleFiles(code, fileList) {
    var a = ans(code);
    var errEl = document.getElementById('err-' + code);
    var errors = [];
    var added = 0;
    Array.prototype.forEach.call(fileList, function (f) {
      if (a.files.length + added >= MAX_FILES_PER_CRITERION) {
        errors.push('Достигнут лимит — не более ' + MAX_FILES_PER_CRITERION + ' файлов на критерий.');
        return;
      }
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ALLOWED_EXT.indexOf(ext) === -1) {
        errors.push('«' + f.name + '»: формат .' + ext + ' не поддерживается.');
        return;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        errors.push('«' + f.name + '»: файл больше ' + MAX_FILE_MB + ' МБ.');
        return;
      }
      a.files.push(f);
      added++;
      if (window.CoreEcoPersistence) window.CoreEcoPersistence.saveFile(code, f);
    });
    uploadErrors[code] = errors.join(' ');
    if (errEl) errEl.textContent = uploadErrors[code];
    document.getElementById('files-' + code).innerHTML = filesChipsHtml(code);
    renderCurrent(); // обновить состояние карточки/сайдбар без потери файлов (уже в STATE)
  }

  // ---------------------------------------------------------------- сайдбар со счётом
  function renderSidebar() {
    var el = document.getElementById('scoreSidebar');
    if (!el) return;
    var s = computeScore();
    var tierLabel = { none: 'пока нет', bronze: 'Бронза', silver: 'Серебро', gold: 'Золото' }[s.tier];
    el.innerHTML = ''
      + '<div class="score-card">'
      + '  <div class="score-tier">Предварительный рейтинг<b class="' + s.tier + '">' + tierLabel + '</b></div>'
      + '  <div class="score-bar"><div class="bar-track"><div class="bar-fill" style="width:' + Math.min(100, s.percent) + '%"></div></div></div>'
      + '  <div class="score-meta"><span>' + s.totalEarned + ' / ' + s.totalMax + ' балл.</span><span>' + s.percent.toFixed(1) + '%</span></div>'
      + '  <div class="score-list">'
      + '    <div class="row"><span>Обязательные</span><b>' + s.mandatoryEarned + ' / ' + s.mandatoryMax + '</b></div>'
      + '    <div class="row"><span>Добровольные</span><b>' + s.voluntaryEarned + ' / ' + s.voluntaryMax + '</b></div>'
      + '    <div class="row"><span>Не хватает до Бронзы</span><b>' + s.unmetBronze.length + '</b></div>'
      + '    <div class="row"><span>Не хватает до Серебра</span><b>' + s.unmetSilver.length + '</b></div>'
      + '    <div class="row"><span>Не хватает до Золота</span><b>' + s.unmetGold.length + '</b></div>'
      + '  </div>'
      + '</div>'
      + '<div class="side-note"><b>Стадия оценки:</b> ' + (STATE.stage === 'project' ? 'проект, прошедший экспертизу' : STATE.stage === 'operation' ? 'построен и введён в эксплуатацию' : '—') + '<br><br>Баллы считаются по методике Приложения А ГОСТ 35329—2026: сумма баллов обязательных критериев + сумма баллов добровольных критериев и всех дополнительных («+N») баллов.</div>';
  }
  function updateSidebar() { renderSidebar(); }

  // ---------------------------------------------------------------- экран результата
  function renderResultScreen(main) {
    var s = computeScore();
    var totalFiles = allCriteria().reduce(function (n, item) { var a = STATE.answers[item.cr.code]; return n + (a ? a.files.length : 0); }, 0);
    var tierLabel = { none: 'Рейтинг не присвоен', bronze: 'БРОНЗА', silver: 'СЕРЕБРО', gold: 'ЗОЛОТО' }[s.tier];
    var html = (firstRender ? restoreBanner : '') + '<div class="result-hero">'
      + '  <div class="eyebrow" style="justify-content:center">Предварительный результат оценки</div>'
      + '  <div class="result-tier-badge ' + s.tier + '">' + tierLabel + '</div>'
      + '  <div class="result-percent">' + s.totalEarned + ' из ' + s.totalMax + ' баллов · ' + s.percent.toFixed(1) + '%</div>'
      + '  <button type="button" class="btn btn-outline-dark btn-sm no-print" id="downloadPdfBtn" style="margin-top:18px;">⬇ Скачать отчёт в PDF</button>'
      + '</div>'
      + '<div class="result-grid">'
      + s.byCategory.map(function (c) {
        var pct = c.max ? Math.round(c.earned / c.max * 100) : 0;
        return '<div class="result-cat-row"><div class="top"><span>' + c.id + '. ' + c.name + '</span><span>' + c.earned + ' / ' + c.max + '</span></div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div></div>';
      }).join('')
      + '</div>';

    var missing = s.tier === 'gold' ? [] : (s.tier === 'silver' ? s.unmetGold : s.tier === 'bronze' ? s.unmetSilver.concat(s.unmetGold) : s.unmetBronze.concat(s.unmetSilver, s.unmetGold));
    if (missing.length) {
      var nextTier = s.tier === 'none' ? 'Бронзы' : s.tier === 'bronze' ? 'Серебра' : 'Золота';
      html += '<div class="missing-list"><h3 class="h-md" style="font-size:20px;">Чего не хватает до уровня «' + nextTier + '»</h3>';
      missing.slice(0, 12).forEach(function (item) {
        html += '<div class="missing-item"><span>' + item.cr.name + '</span><b>' + item.cr.code + '</b></div>';
      });
      if (missing.length > 12) html += '<div class="missing-item"><span>и ещё ' + (missing.length - 12) + '…</span></div>';
      html += '</div>';
    }

    html += '<div class="lead-form no-print">'
      + '<div id="leadFormWrap">'
      + '<h3 class="h-md" style="font-size:20px;">Оставить заявку на официальную сертификацию</h3>'
      + '<p style="color:var(--ink-700);font-size:14px;margin-top:8px;">Результат выше — предварительный и рассчитан по введённым вами данным. Эксперт CORE.ECO проверит документы и подготовит официальное заключение.</p>'
      + (totalFiles
        ? '<div class="side-note" style="margin-top:16px;">Вы загрузили ' + totalFiles + ' файл(ов) — они хранятся только в этом браузере и не отправляются вместе с заявкой автоматически. Укажите ссылку на облачное хранилище с документами ниже или отправьте их на core.eco@core-xp.ru после отправки заявки.</div>'
        : '')
      + '<form id="leadForm">'
      + '  <div class="form-grid">'
      + '    <div><label>Имя</label><input name="name" placeholder="Как к вам обращаться" required></div>'
      + '    <div><label>Компания</label><input name="company" placeholder="Необязательно"></div>'
      + '    <div><label>E-mail</label><input name="email" type="email" placeholder="Куда прислать заключение" required></div>'
      + '    <div><label>Телефон</label><input name="phone" placeholder="Необязательно"></div>'
      + '    <div class="full"><label>Ссылка на файлы (Я.Диск, Google Диск и т.п.)</label><input name="files_link" placeholder="Необязательно — можно прислать позже письмом"></div>'
      + '    <div class="full"><label>Комментарий</label><textarea name="message" rows="3" placeholder="Например: когда удобно созвониться"></textarea></div>'
      + '  </div>'
      + '  <input type="hidden" name="stage" value="' + (STATE.stage || '') + '">'
      + '  <input type="hidden" name="address" value="' + escapeHtml(STATE.address || '') + '">'
      + '  <input type="hidden" name="result_summary" id="resultSummaryField">'
      + '  <label class="consent-row"><input type="checkbox" required><span>Согласен на обработку персональных данных и ознакомлен с условиями Политики конфиденциальности</span></label>'
      + '  <button type="submit" class="btn btn-primary" style="margin-top:20px;">Отправить заявку</button>'
      + '  <div class="form-msg" id="leadMsg"></div>'
      + '</form>'
      + '</div>'
      + '<div class="form-msg ok" id="leadSuccess" style="display:none;font-size:16px;"></div>'
      + '</div>';

    main.innerHTML = html;

    var downloadBtn = document.getElementById('downloadPdfBtn');
    if (downloadBtn) downloadBtn.addEventListener('click', function () { window.print(); });

    var form = document.getElementById('leadForm');
    document.getElementById('resultSummaryField').value = buildSummaryText(s);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('leadMsg');
      if (window.CoreEcoIsDemo ? window.CoreEcoIsDemo(FORM_ENDPOINT) : (!FORM_ENDPOINT || FORM_ENDPOINT.indexOf('YOUR_FORM_ID') !== -1)) {
        msg.textContent = 'Демо-режим: форма ещё не подключена к реальному приёму заявок. Результат оценки сохранён только в этой сессии браузера — напишите нам напрямую на core.eco@core-xp.ru, приложив отчёт (кнопка «Скачать отчёт в PDF» выше).';
        msg.className = 'form-msg err';
        console.log('[assessment demo submit]', Object.fromEntries(new FormData(form)), STATE.answers);
        return;
      }
      var fd = new FormData(form); // без вложений: Formspree на бесплатном тарифе их не поддерживает — файлы передаются отдельно по ссылке/почте
      var btn = form.querySelector('button[type=submit]');
      btn.setAttribute('disabled', 'true'); btn.textContent = 'Отправляем…';
      fetch(FORM_ENDPOINT, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { if (r.ok) return r.json(); throw new Error('network'); })
        .then(function () {
          document.getElementById('leadFormWrap').style.display = 'none';
          var success = document.getElementById('leadSuccess');
          success.textContent = 'Заявка отправлена. Эксперт CORE.ECO свяжется с вами и запросит документы, если вы не приложили ссылку.';
          success.style.display = 'block';
        })
        .catch(function () { msg.textContent = 'Не получилось отправить. Попробуйте написать на core.eco@core-xp.ru напрямую.'; msg.className = 'form-msg err'; btn.removeAttribute('disabled'); btn.textContent = 'Отправить заявку'; });
    });
  }

  function buildSummaryText(s) {
    var lines = ['CORE.ECO · предварительная оценка по ГОСТ 35329-2026', 'Стадия: ' + STATE.stage, 'Адрес: ' + STATE.address,
      'Рейтинг: ' + s.tier + ' (' + s.totalEarned + '/' + s.totalMax + ', ' + s.percent.toFixed(1) + '%)', ''];
    s.byCategory.forEach(function (c) { lines.push(c.id + '. ' + c.name + ': ' + c.earned + '/' + c.max); });
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- главный рендер
  var firstRender = true;
  var lastScrolledStep = null; // прокручиваем страницу только при переходе между шагами, а не при каждом клике внутри критерия (см. правку №8)
  function render() {
    renderStepper();
    var main = document.getElementById('assessMain');
    var sideWrap = document.getElementById('assessSideWrap');
    if (sideWrap) sideWrap.style.display = STATE.step === 0 ? 'none' : '';
    if (STATE.step === 0) renderStageScreen(main);
    else if (STATE.step >= 1 && STATE.step <= 10) renderCategoryScreen(main, STATE.step);
    else renderResultScreen(main);
    renderSidebar();
    var resetLink = document.getElementById('resetProgress');
    if (resetLink) resetLink.addEventListener('click', function (e) { e.preventDefault(); resetProgress(); });
    if (!firstRender && STATE.step !== lastScrolledStep) {
      window.scrollTo({ top: document.getElementById('assessBody').offsetTop - 90, behavior: 'smooth' });
    }
    lastScrolledStep = STATE.step;
    firstRender = false;
    persist();
  }
  function renderCurrent() { render(); }

  document.addEventListener('DOMContentLoaded', function () {
    restoreFromStorage();
    if (pendingCategory && STATE.stage) { STATE.step = pendingCategory; pendingCategory = null; }
    render();
  });
})();
