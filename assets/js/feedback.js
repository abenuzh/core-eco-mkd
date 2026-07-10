// CORE.ECO · МКД — плавающая кнопка «Сообщить о проблеме» на каждой странице сайта
(function () {
  'use strict';
  var FEEDBACK_ENDPOINT = 'https://formspree.io/f/YOUR_FEEDBACK_FORM_ID'; // TODO: заменить на реальный ID формы Formspree

  var root = document.body.getAttribute('data-root') || '';
  var html = ''
    + '<button id="fbOpenBtn" class="fb-fab" type="button" title="Сообщить о проблеме на сайте">'
    + '  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 16.5h.01M10.3 3.9L2.5 17a1.8 1.8 0 001.6 2.7h15.8a1.8 1.8 0 001.6-2.7L13.7 3.9a1.8 1.8 0 00-3.4 0z"/></svg>'
    + '  Сообщить о проблеме'
    + '</button>'
    + '<div id="fbOverlay" class="fb-overlay">'
    + '  <div class="fb-modal">'
    + '    <button id="fbCloseBtn" class="fb-close" type="button" aria-label="Закрыть">×</button>'
    + '    <h3 style="font-family:var(--font-display);font-size:20px;">Сообщить о проблеме</h3>'
    + '    <p style="font-size:13.5px;color:var(--ink-700);margin-top:8px;">Что-то отображается или работает не так, как ожидалось? Опишите — мы это поправим.</p>'
    + '    <form id="fbForm">'
    + '      <input type="hidden" name="page" value="">'
    + '      <div style="margin-top:16px;"><label style="font-size:12.5px;color:var(--ink-500);font-weight:600;">Что произошло</label>'
    + '        <textarea name="issue" required rows="4" style="width:100%;margin-top:6px;padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--paper-300);font-family:var(--font-body);font-size:14.5px;" placeholder="Например: на шаге «Категория 3» не открывается загрузка файла"></textarea></div>'
    + '      <div style="margin-top:14px;"><label style="font-size:12.5px;color:var(--ink-500);font-weight:600;">Ваш e-mail (если нужно уточнить)</label>'
    + '        <input type="email" name="email" style="width:100%;margin-top:6px;padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--paper-300);font-family:var(--font-body);font-size:14.5px;" placeholder="name@company.ru"></div>'
    + '      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:18px;">Отправить</button>'
    + '      <div class="form-msg" id="fbMsg"></div>'
    + '    </form>'
    + '  </div>'
    + '</div>';

  document.body.insertAdjacentHTML('beforeend', html);

  var overlay = document.getElementById('fbOverlay');
  document.getElementById('fbOpenBtn').addEventListener('click', function () { overlay.classList.add('open'); });
  document.getElementById('fbCloseBtn').addEventListener('click', function () { overlay.classList.remove('open'); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.remove('open'); });

  var form = document.getElementById('fbForm');
  form.querySelector('input[name=page]').value = location.pathname;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('fbMsg');
    if (!FEEDBACK_ENDPOINT || FEEDBACK_ENDPOINT.indexOf('YOUR_FEEDBACK_FORM_ID') !== -1) {
      msg.textContent = 'Демо-режим: форма обратной связи ещё не подключена к реальному приёму сообщений.';
      msg.className = 'form-msg err';
      console.log('[feedback demo submit]', Object.fromEntries(new FormData(form)));
      return;
    }
    var btn = form.querySelector('button[type=submit]');
    btn.setAttribute('disabled', 'true');
    fetch(FEEDBACK_ENDPOINT, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { if (r.ok) return r.json(); throw new Error('network'); })
      .then(function () { msg.textContent = 'Спасибо, сообщение отправлено!'; msg.className = 'form-msg ok'; form.reset(); })
      .catch(function () { msg.textContent = 'Не удалось отправить. Напишите на core.eco@core-xp.ru.'; msg.className = 'form-msg err'; })
      .finally(function () { btn.removeAttribute('disabled'); });
  });
})();
