// Рендер грид-карточек 10 категорий на главной странице (#catGrid)
(function () {
  'use strict';
  var grid = document.getElementById('catGrid');
  if (!grid || typeof GOST_CATEGORIES === 'undefined') return;
  grid.innerHTML = GOST_CATEGORIES.map(function (c) {
    var num = String(c.id).padStart(2, '0');
    return ''
      + '<a class="cat-card" href="assessment.html?cat=' + c.id + '" title="Перейти к категории ' + c.id + ' в мастере оценки">'
      + '  <div class="cat-num">' + num + ' / 10</div>'
      + '  <h4>' + c.name + '</h4>'
      + '  <div class="cat-meta"><span><b>' + c.mandatoryCriteria + '</b> обязат.</span><span><b>' + (c.mandatoryPoints + c.voluntaryPoints) + '</b> баллов макс.</span></div>'
      + '  <div class="cat-go">Критерии ' + c.range + ' →</div>'
      + '</a>';
  }).join('');
})();
