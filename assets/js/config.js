// CORE.ECO · МКД — единая точка настройки внешних сервисов сайта.
// Перед запуском в интернет замените 3 ID на реальные формы Formspree (formspree.io, бесплатного тарифа
// достаточно — вложения файлов сайт через форму не отправляет, см. CONTACT_ENDPOINT/LEAD_ENDPOINT ниже).
(function () {
  'use strict';
  window.CORE_ECO_CONFIG = {
    // форма в шапке/подвале сайта ("Оставить заявку")
    CONTACT_ENDPOINT: 'https://formspree.io/f/xgogogvp',
    // форма заявки на официальную сертификацию (экран результата оценки)
    LEAD_ENDPOINT: 'https://formspree.io/f/xkododgy',
    // форма "Сообщить о проблеме"
    FEEDBACK_ENDPOINT: 'https://formspree.io/f/xvzezegy',
    // DaData — ПУБЛИЧНЫЙ токен сервиса «Подсказки» (Suggestions) для распознавания адреса при вводе.
    // Он по дизайну виден в браузере — это нормально для подсказок. Для защиты ОБЯЗАТЕЛЬНО ограничьте его
    // доменом сайта в личном кабинете DaData (Профиль → Ограничения). Секретный ключ стандартизации сюда НЕ кладём.
    DADATA_TOKEN: 'f710c1bab9d206da1f4def8f4ab45f5ecd518734'
  };
  window.CoreEcoIsDemo = function (endpoint) {
    return !endpoint || endpoint.indexOf('YOUR_FORM_ID') !== -1 || endpoint.indexOf('YOUR_FEEDBACK_FORM_ID') !== -1;
  };
})();
