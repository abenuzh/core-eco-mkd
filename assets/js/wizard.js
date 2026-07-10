// CORE.ECO · МКД — мастер предварительной оценки по ГОСТ 35329-2026
// Логика соответствует раздела 6-7 стандарта: обязательные критерии дают допуск к рейтингу,
// баллы = сумма basePoints обязательных + (сумма basePoints добровольных + все бонусы) — см. Приложение А.
(function () {
  'use strict';

  var FORM_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID'; // TODO: заменить на реальный ID формы Formspree перед запуском в продакшн

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
  function renderStepper() {
    var el = document.getElementById('stepper');
    if (!el) return;
    var html = '<div class="assess-step ' + (STATE.step === 0 ? 'active' : STATE.step > 0 ? 'done' : '') + '" data-go="0"><span class="dot">S</span>Стадия</div>';
    for (var i = 1; i <= 10; i++) {
      html += '<div class="assess-connector"></div>';
      html += '<div class="assess-step ' + (STATE.step === i ? 'active' : STATE.step > i ? 'done' : '') + '" data-go="' + i + '"><span class="dot">' + i + '</span>Кат. ' + i + '</div>';
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
    if (nextBtn) nextBtn.addEventListener('click', function () { STATE.step = 1; render(); });
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
        + '<div class="geo-row"><input class="field" id="geoAddress" placeholder="Город, улица, номер дома" value="' + (STATE.address || '') + '"><button class="btn btn-primary btn-sm" id="geoGo" style="flex-shrink:0">Определить координаты</button></div>'
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
    html += '<div class="criterion-answer">'
      + '  <button class="opt-btn ' + (a.satisfied === true ? 'on' : '') + '" data-ans="' + cr.code + '" data-val="yes">✓ Выполнено</button>'
      + '  <button class="opt-btn ' + (a.satisfied === false ? 'off-x' : '') + '" data-ans="' + cr.code + '" data-val="no">✕ Не выполнено</button>';
    if (cr.bonusPoints) {
      html += '<label class="opt-btn" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">'
        + '<input type="checkbox" data-bonus="' + cr.code + '" ' + (a.bonus ? 'checked' : '') + ' style="margin:0"> + доп. балл (' + cr.bonusPoints + ')</label>';
    }
    html += '</div>';

    if (geoRuleKeys.length) {
      html += '<div class="geo-check-row"><button class="btn btn-outline-dark btn-sm" data-geocheck="' + cr.code + '">Проверить по адресу (OSM)</button><span class="result" id="georesult-' + cr.code + '">' + geoResultLabel(cr.code) + '</span></div>';
    }

    html += '<div class="upload-zone" data-drop="' + cr.code + '">'
      + '  <div class="upload-icon">' + iconUpload() + '</div>'
      + '  <div class="upload-text"><b>Загрузите файл</b> или перетащите сюда — подтверждающий документ по этому критерию</div>'
      + '  <input type="file" multiple id="file-' + cr.code + '">'
      + '</div>'
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

  function wireCategoryEvents(main, cat) {
    var addrInput = document.getElementById('geoAddress');
    var geoGo = document.getElementById('geoGo');
    if (geoGo) {
      geoGo.addEventListener('click', function () {
        var address = addrInput.value.trim();
        if (!address) return;
        STATE.address = address;
        var statusEl = document.getElementById('geoStatusEl');
        statusEl.textContent = 'Определяем координаты…';
        statusEl.className = 'geo-status';
        CoreEcoOSM.geocodeAddress(address).then(function (geo) {
          STATE.geo = geo;
          statusEl.textContent = 'Координаты найдены: ' + geo.label;
        }).catch(function () {
          statusEl.textContent = 'Не удалось определить адрес автоматически — заполните критерии вручную по ЕИСЖС/ГИС.';
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
            resultEl.textContent = 'сервис OSM недоступен, отметьте вручную';
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
      zone.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () { handleFiles(code, input.files); });
      ['dragenter', 'dragover'].forEach(function (evt) {
        zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.remove('drag'); });
      });
      zone.addEventListener('drop', function (e) { handleFiles(code, e.dataTransfer.files); });
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
    Array.prototype.forEach.call(fileList, function (f) {
      a.files.push(f);
      if (window.CoreEcoPersistence) window.CoreEcoPersistence.saveFile(code, f);
    });
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
    var tierLabel = { none: 'Рейтинг не присвоен', bronze: 'БРОНЗА', silver: 'СЕРЕБРО', gold: 'ЗОЛОТО' }[s.tier];
    var html = (firstRender ? restoreBanner : '') + '<div class="result-hero">'
      + '  <div class="eyebrow" style="justify-content:center">Предварительный результат оценки</div>'
      + '  <div class="result-tier-badge ' + s.tier + '">' + tierLabel + '</div>'
      + '  <div class="result-percent">' + s.totalEarned + ' из ' + s.totalMax + ' баллов · ' + s.percent.toFixed(1) + '%</div>'
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

    html += '<div class="lead-form">'
      + '<h3 class="h-md" style="font-size:20px;">Оставить заявку на официальную сертификацию</h3>'
      + '<p style="color:var(--ink-700);font-size:14px;margin-top:8px;">Результат выше — предварительный и рассчитан по введённым вами данным. Эксперт CORE.ECO проверит документы и подтверждающие файлы и подготовит официальное заключение.</p>'
      + '<form id="leadForm">'
      + '  <div class="form-grid">'
      + '    <div><label>Имя</label><input name="name" required></div>'
      + '    <div><label>Компания</label><input name="company"></div>'
      + '    <div><label>E-mail</label><input name="email" type="email" required></div>'
      + '    <div><label>Телефон</label><input name="phone"></div>'
      + '    <div class="full"><label>Комментарий</label><textarea name="message" rows="3"></textarea></div>'
      + '  </div>'
      + '  <input type="hidden" name="stage" value="' + (STATE.stage || '') + '">'
      + '  <input type="hidden" name="address" value="' + escapeHtml(STATE.address || '') + '">'
      + '  <input type="hidden" name="result_summary" id="resultSummaryField">'
      + '  <label class="consent-row"><input type="checkbox" required><span>Согласен на обработку персональных данных и ознакомлен с условиями Политики конфиденциальности</span></label>'
      + '  <button type="submit" class="btn btn-primary" style="margin-top:20px;">Отправить заявку</button>'
      + '  <div class="form-msg" id="leadMsg"></div>'
      + '</form>'
      + '</div>';

    main.innerHTML = html;

    var form = document.getElementById('leadForm');
    document.getElementById('resultSummaryField').value = buildSummaryText(s);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('leadMsg');
      var totalFiles = allCriteria().reduce(function (n, item) { var a = STATE.answers[item.cr.code]; return n + (a ? a.files.length : 0); }, 0);
      if (!FORM_ENDPOINT || FORM_ENDPOINT.indexOf('YOUR_FORM_ID') !== -1) {
        msg.textContent = 'Демо-режим: форма ещё не подключена к реальному приёму заявок (нужен ID формы Formspree). Данные оценки и ' + totalFiles + ' файл(ов) сохранены только в этой сессии браузера.';
        msg.className = 'form-msg err';
        console.log('[assessment demo submit]', Object.fromEntries(new FormData(form)), STATE.answers);
        return;
      }
      var fd = new FormData(form);
      var attached = 0;
      allCriteria().forEach(function (item) {
        var a = STATE.answers[item.cr.code];
        if (a) a.files.forEach(function (f) { if (attached < 15) { fd.append('files[]', f, item.cr.code + '__' + f.name); attached++; } });
      });
      var btn = form.querySelector('button[type=submit]');
      btn.setAttribute('disabled', 'true'); btn.textContent = 'Отправляем…';
      fetch(FORM_ENDPOINT, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { if (r.ok) return r.json(); throw new Error('network'); })
        .then(function () { msg.textContent = 'Заявка и документы отправлены. Эксперт CORE.ECO свяжется с вами.'; msg.className = 'form-msg ok'; form.reset(); })
        .catch(function () { msg.textContent = 'Не получилось отправить. Попробуйте написать на core.eco@core-xp.ru напрямую.'; msg.className = 'form-msg err'; })
        .finally(function () { btn.removeAttribute('disabled'); btn.textContent = 'Отправить заявку'; });
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
    if (!firstRender) window.scrollTo({ top: document.getElementById('assessBody').offsetTop - 90, behavior: 'smooth' });
    firstRender = false;
    persist();
  }
  function renderCurrent() { render(); }

  document.addEventListener('DOMContentLoaded', function () {
    restoreFromStorage();
    render();
  });
})();
