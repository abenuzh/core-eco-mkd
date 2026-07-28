// Рендер секции «10 категорий» на главной (#catGrid).
// Компактные карточки-справки: краткое описание + полоса-«вес» категории; по клику раскрывается
// список КОНКРЕТНЫХ критериев (код, название, обязательный/добровольный, баллы) из GOST_DATA.
(function () {
  'use strict';
  var grid = document.getElementById('catGrid');
  if (!grid || typeof GOST_CATEGORIES === 'undefined') return;

  // индекс критериев по id категории (из gost-data.js, если он подключён на странице)
  var critsById = {};
  if (typeof GOST_DATA !== 'undefined' && GOST_DATA.categories) {
    GOST_DATA.categories.forEach(function (gc) { critsById[gc.id] = gc.criteria || []; });
  }

  var maxPts = GOST_CATEGORIES.reduce(function (m, c) {
    return Math.max(m, c.mandatoryPoints + c.voluntaryPoints);
  }, 0);

  function critRows(catId) {
    var list = critsById[catId];
    if (!list || !list.length) return '';
    return list.map(function (cr) {
      var pts = (cr.basePoints || 0) + (cr.bonusPoints ? '+' + cr.bonusPoints : '');
      var tag = cr.mandatoryTier ? '<span class="mand">обяз.</span>' : 'доб.';
      return '<li class="crit-row">'
        + '<span class="crit-code">' + cr.code + '</span>'
        + '<span class="crit-name">' + cr.name + '</span>'
        + '<span class="crit-info">' + tag + ' · ' + pts + ' б.</span>'
        + '</li>';
    }).join('');
  }

  grid.innerHTML = GOST_CATEGORIES.map(function (c) {
    var num = String(c.id).padStart(2, '0');
    var pts = c.mandatoryPoints + c.voluntaryPoints;
    var w = maxPts ? Math.round(pts / maxPts * 100) : 0;
    var rows = critRows(c.id);
    return ''
      + '<article class="cat-item">'
      + '  <div class="cat-item-top"><span class="cat-item-num">' + num + '</span><span class="cat-item-range">Критерии ' + c.range + '</span></div>'
      + '  <h3 class="cat-item-name">' + c.name + '</h3>'
      + '  <p class="cat-item-desc">' + c.desc + '</p>'
      + '  <div class="cat-weight-track" title="Вес категории в общем зачёте: ' + pts + ' из ' + maxPts + ' баллов"><div class="cat-weight-fill" style="width:' + w + '%"></div></div>'
      + '  <div class="cat-item-meta"><b>' + pts + '</b> баллов макс · <b>' + c.mandatoryCriteria + '</b> обязат. из ' + c.count + '</div>'
      + (rows
        ? '  <button class="cat-crits-toggle" type="button" aria-expanded="false"><span class="tgl-label">Показать ' + c.count + ' критериев</span><span class="tgl-arrow" aria-hidden="true">▾</span></button>'
          + '  <ul class="cat-crits">' + rows + '</ul>'
        : '')
      + '</article>';
  }).join('');

  grid.querySelectorAll('.cat-crits-toggle').forEach(function (btn) {
    var item = btn.closest('.cat-item');
    var label = btn.querySelector('.tgl-label');
    var arrow = btn.querySelector('.tgl-arrow');
    var count = item.querySelectorAll('.crit-row').length;
    btn.addEventListener('click', function () {
      var open = item.classList.toggle('crits-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (label) label.textContent = open ? 'Скрыть критерии' : ('Показать ' + count + ' критериев');
      if (arrow) arrow.textContent = open ? '▴' : '▾';
    });
  });
})();
