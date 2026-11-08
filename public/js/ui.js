/* Tema claro/oscuro y cambio de herramienta */
(function () {
  'use strict';
  var root = document.documentElement;
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('bs-theme', t); } catch (e) {}
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0c0d0d' : '#f4f3ee');
  }
  document.getElementById('theme').onclick = function () {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  };
  applyTheme(root.getAttribute('data-theme') || 'light');

  var tabs = document.querySelectorAll('.nav button');
  function show(tool) {
    if (tool !== 'pdf') tool = 'codes';
    document.getElementById('tool-codes').classList.toggle('hide', tool !== 'codes');
    document.getElementById('tool-pdf').classList.toggle('hide', tool !== 'pdf');
    Array.prototype.forEach.call(tabs, function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tool') === tool); });
    try { history.replaceState(null, '', tool === 'pdf' ? '#imagen-a-pdf' : '#codigos'); } catch (e) {}
  }
  Array.prototype.forEach.call(tabs, function (b) { b.onclick = function () { show(b.getAttribute('data-tool')); window.scrollTo(0, 0); }; });
  show(location.hash === '#imagen-a-pdf' ? 'pdf' : 'codes');
})();
