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
    FEEDBACK_ENDPOINT: 'https://formspree.io/f/xvzezegy'
  };
  window.CoreEcoIsDemo = function (endpoint) {
    return !endpoint || endpoint.indexOf('YOUR_FORM_ID') !== -1 || endpoint.indexOf('YOUR_FEEDBACK_FORM_ID') !== -1;
  };
})();
