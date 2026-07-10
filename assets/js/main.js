// CORE.ECO · МКД — общие интерактивные элементы (навигация, реветы, форма в подвале)
(function () {
  'use strict';

  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || !els.length) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  // Форма заявки в подвале — отправка через Formspree (см. FORM_ENDPOINT в footer-form.js)
  function initFooterForm() {
    var form = document.querySelector('.footer-form');
    if (!form) return;
    var msg = form.querySelector('.form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var endpoint = form.getAttribute('data-endpoint');
      var consent = form.querySelector('input[type=checkbox]');
      if (consent && !consent.checked) {
        if (msg) { msg.textContent = 'Отметьте согласие на обработку персональных данных.'; msg.className = 'form-msg err'; }
        return;
      }
      if (!endpoint || endpoint.indexOf('YOUR_FORM_ID') !== -1) {
        if (msg) {
          msg.textContent = 'Демо-режим: форма не подключена к реальному приёму заявок (нужно указать ID формы Formspree). Заявка сохранена только локально.';
          msg.className = 'form-msg err';
        }
        console.log('[footer-form demo submit]', Object.fromEntries(new FormData(form)));
        form.reset();
        return;
      }
      var btn = form.querySelector('button[type=submit]');
      if (btn) { btn.setAttribute('disabled', 'true'); btn.textContent = 'Отправляем…'; }
      fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) { if (r.ok) return r.json(); throw new Error('network'); })
        .then(function () {
          if (msg) { msg.textContent = 'Заявка отправлена — свяжемся с вами в ближайшее время.'; msg.className = 'form-msg ok'; }
          form.reset();
        })
        .catch(function () {
          if (msg) { msg.textContent = 'Не удалось отправить. Попробуйте написать на почту напрямую.'; msg.className = 'form-msg err'; }
        })
        .finally(function () {
          if (btn) { btn.removeAttribute('disabled'); btn.textContent = 'Оставить заявку'; }
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initReveal();
    initFooterForm();
  });
})();
