// CORE.ECO · МКД — сохранение хода оценки в этом браузере (localStorage + IndexedDB для файлов)
// Ничего не уходит на сервер: данные лежат только на этом устройстве, в этом браузере.
(function (global) {
  'use strict';

  var LS_KEY = 'coreEcoAssessment_v1';
  var DB_NAME = 'coreEcoAssessmentFiles';
  var STORE = 'files';

  function saveState(state) {
    var slim = {
      step: state.step, stage: state.stage, address: state.address, geo: state.geo, geoStatus: state.geoStatus,
      answers: {}
    };
    Object.keys(state.answers).forEach(function (code) {
      var a = state.answers[code];
      slim.answers[code] = {
        satisfied: a.satisfied, bonus: a.bonus,
        geo: a.geo,
        fileNames: a.files.map(function (f) { return { name: f.name, size: f.size }; })
      };
    });
    try { localStorage.setItem(LS_KEY, JSON.stringify(slim)); } catch (e) { /* хранилище недоступно/переполнено — не критично */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearState() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function saveFile(code, file) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var key = code + '__' + file.name + '__' + file.size;
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ key: key, code: code, name: file.name, type: file.type, blob: file });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function removeFile(code, name, size) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var key = code + '__' + name + '__' + size;
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    });
  }

  // возвращает { code: [File, File...] } — восстановленные File-объекты из IndexedDB
  function loadAllFiles() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var byCode = {};
          (req.result || []).forEach(function (rec) {
            var file = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name, { type: rec.type });
            (byCode[rec.code] = byCode[rec.code] || []).push(file);
          });
          resolve(byCode);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  global.CoreEcoPersistence = { saveState: saveState, loadState: loadState, clearState: clearState, saveFile: saveFile, removeFile: removeFile, loadAllFiles: loadAllFiles };
})(window);
