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

  // Подсветка активного пункта меню при переходе к якорю и при прокрутке (актуально на index.html,
  // где ссылки "ГОСТ 35329—2026" / "Как проходит оценка" ведут на секции той же страницы).
  function initNavScrollSpy() {
    var navLinks = document.querySelectorAll('.nav-links a[href*="#"]');
    var pairs = [];
    navLinks.forEach(function (a) {
      var id = a.getAttribute('href').split('#')[1];
      var sec = id && document.getElementById(id);
      if (sec) pairs.push({ link: a, section: sec });
    });
    if (!pairs.length || !('IntersectionObserver' in window)) return;
    var homeLink = document.querySelector('.nav-links a[href="index.html"]');
    function setActive(link) {
      document.querySelectorAll('.nav-links a').forEach(function (a) { a.classList.remove('current'); });
      if (link) link.classList.add('current');
    }
    var io = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (e) { return e.isIntersecting; });
      if (visible.length) {
        visible.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
        var match = pairs.filter(function (p) { return p.section === visible[0].target; })[0];
        if (match) setActive(match.link);
      } else if (pairs[0].section.getBoundingClientRect().top > 0) {
        setActive(homeLink);
      }
    }, { threshold: 0, rootMargin: '-45% 0px -50% 0px' });
    pairs.forEach(function (p) { io.observe(p.section); });
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
      if (window.CoreEcoIsDemo ? window.CoreEcoIsDemo(endpoint) : (!endpoint || endpoint.indexOf('YOUR_FORM_ID') !== -1)) {
        if (msg) {
          msg.textContent = 'Демо-режим: форма пока не подключена к реальному приёму заявок. Напишите нам напрямую на core.eco@core-xp.ru — мы ответим в течение 1–2 рабочих дней.';
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
          if (msg) { msg.textContent = 'Заявка отправлена. Эксперт CORE.ECO ответит на указанный e-mail в течение 1–2 рабочих дней.'; msg.className = 'form-msg ok'; }
          form.reset();
        })
        .catch(function () {
          if (msg) { msg.textContent = 'Не удалось отправить — возможно, пропало соединение. Попробуйте ещё раз или напишите на core.eco@core-xp.ru.'; msg.className = 'form-msg err'; }
        })
        .finally(function () {
          if (btn) { btn.removeAttribute('disabled'); btn.textContent = 'Оставить заявку'; }
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initReveal();
    initNavScrollSpy();
    initFooterForm();
  });
})();
