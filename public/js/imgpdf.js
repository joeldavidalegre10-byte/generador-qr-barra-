/* Imagen a PDF: todo ocurre en el navegador, sin subir archivos */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAX_IMAGES = 100;
  var QUALITY = { low: { max: 1400, q: 0.6 }, mid: { max: 2200, q: 0.8 }, high: { max: 4096, q: 0.95 } };
  var PAGES = { a4: [595.28, 841.89], letter: [612, 792] };
  var opts = { size: 'a4', ori: 'auto', margin: 36, quality: 'mid' };
  var items = [], nextId = 1, busy = false;

  var ICON = {
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function msg(t) { $('pdfMsg').textContent = t || ''; }

  /* ---------- Opciones ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('#tool-pdf .seg[data-opt]'), function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      Array.prototype.forEach.call(g.querySelectorAll('button'), function (x) { x.setAttribute('aria-checked', x === b); });
      var k = g.getAttribute('data-opt'), v = b.getAttribute('data-v');
      opts[k] = k === 'margin' ? +v : v;
      if (k === 'size') syncOri();
    });
  });
  function syncOri() {
    var fit = opts.size === 'fit';
    Array.prototype.forEach.call(document.querySelectorAll('[data-opt=ori] button'), function (b) { b.disabled = fit; });
  }

  /* ---------- Carga de imágenes ---------- */
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('No se pudo leer la imagen')); };
      im.src = url;
    });
  }
  async function addFiles(list) {
    var files = Array.prototype.slice.call(list || []).filter(function (f) { return /^image\//.test(f.type); });
    var skipped = (list ? list.length : 0) - files.length, bad = [];
    msg('');
    for (var i = 0; i < files.length; i++) {
      if (items.length >= MAX_IMAGES) { bad.push('límite de ' + MAX_IMAGES + ' imágenes'); break; }
      var f = files[i], url = URL.createObjectURL(f);
      try {
        var im = await loadImg(url);
        items.push({ id: nextId++, file: f, url: url, name: f.name, size: f.size, w: im.naturalWidth, h: im.naturalHeight });
      } catch (e) { URL.revokeObjectURL(url); bad.push(f.name); }
    }
    var notes = [];
    if (skipped > 0) notes.push(skipped + ' archivo(s) no son imágenes');
    if (bad.length) notes.push('No se pudo leer: ' + bad.join(', '));
    if (notes.length) msg(notes.join(' · '));
    renderList();
  }

  /* ---------- Lista ---------- */
  function renderList() {
    var has = items.length > 0;
    $('listWrap').classList.toggle('hide', !has);
    $('drop').classList.toggle('compact', has);
    $('dropTitle').textContent = has ? 'Añadir más imágenes' : 'Arrastra tus imágenes aquí';
    $('count').textContent = items.length + (items.length === 1 ? ' imagen · 1 página' : ' imágenes · ' + items.length + ' páginas');
    $('thumbs').innerHTML = items.map(function (it, i) {
      return '<div class="thumb" data-id="' + it.id + '"><div class="im"><img src="' + it.url + '" alt=""><span class="n">' + (i + 1) + '</span></div>' +
        '<div class="nm" title="' + esc(it.name) + '">' + esc(it.name) + '</div><div class="sz">' + it.w + '×' + it.h + ' · ' + fmtSize(it.size) + '</div>' +
        '<div class="ac"><button type="button" data-act="left" aria-label="Mover antes"' + (i === 0 ? ' disabled' : '') + '>' + ICON.left + '</button>' +
        '<button type="button" data-act="right" aria-label="Mover después"' + (i === items.length - 1 ? ' disabled' : '') + '>' + ICON.right + '</button>' +
        '<button type="button" data-act="del" aria-label="Quitar">' + ICON.del + '</button></div></div>';
    }).join('');
    $('convert').disabled = !has || busy;
  }
  $('thumbs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b || busy) return;
    var id = +b.closest('.thumb').getAttribute('data-id'), i = items.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var act = b.getAttribute('data-act');
    if (act === 'del') { URL.revokeObjectURL(items[i].url); items.splice(i, 1); }
    else { var j = act === 'left' ? i - 1 : i + 1; if (j >= 0 && j < items.length) { var t = items[i]; items[i] = items[j]; items[j] = t; } }
    renderList();
  });
  $('clear').onclick = function () { if (busy) return; items.forEach(function (it) { URL.revokeObjectURL(it.url); }); items = []; msg(''); renderList(); };

  /* ---------- Zona de arrastre ---------- */
  var drop = $('drop'), input = $('files');
  input.addEventListener('change', function () { var l = input.files; addFiles(l).then(function () { input.value = ''; }); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  ['dragover', 'drop'].forEach(function (ev) { window.addEventListener(ev, function (e) { e.preventDefault(); }); });

  /* ---------- Diseño de página ---------- */
  function pageLayout(iw, ih) {
    var m = opts.margin, pw, ph, dw, dh;
    if (opts.size === 'fit') {
      var k = Math.min(1, 14000 / (Math.max(iw, ih) * 0.75 + 2 * m));
      dw = iw * 0.75 * k; dh = ih * 0.75 * k; pw = dw + 2 * m; ph = dh + 2 * m;
      return { pw: pw, ph: ph, x: m, y: m, dw: dw, dh: dh };
    }
    var base = PAGES[opts.size], land = opts.ori === 'auto' ? iw > ih : opts.ori === 'l';
    pw = land ? base[1] : base[0]; ph = land ? base[0] : base[1];
    var cw = pw - 2 * m, ch = ph - 2 * m, s = Math.min(cw / iw, ch / ih);
    dw = iw * s; dh = ih * s;
    return { pw: pw, ph: ph, x: (pw - dw) / 2, y: (ph - dh) / 2, dw: dw, dh: dh };
  }

  /* ---------- Imagen -> JPEG (fondo blanco para transparencias) ---------- */
  async function toJpeg(item) {
    var im = await loadImg(item.url), q = QUALITY[opts.quality];
    var iw = im.naturalWidth, ih = im.naturalHeight, sc = Math.min(1, q.max / Math.max(iw, ih));
    var cw = Math.max(1, Math.round(iw * sc)), ch = Math.max(1, Math.round(ih * sc));
    var c = document.createElement('canvas'); c.width = cw; c.height = ch;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.drawImage(im, 0, 0, cw, ch);
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', q.q); });
    c.width = c.height = 0;
    if (!blob) throw new Error('Imagen demasiado grande para este dispositivo: ' + item.name);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), pw: cw, ph: ch, iw: iw, ih: ih };
  }

  /* ---------- Escritor de PDF ---------- */
  function buildPdf(pages) {
    var chunks = [], len = 0, offs = [], n = pages.length, total = 2 + 3 * n, i;
    function put(x) {
      if (typeof x === 'string') { var u = new Uint8Array(x.length); for (var k = 0; k < x.length; k++) u[k] = x.charCodeAt(k) & 255; x = u; }
      chunks.push(x); len += x.length;
    }
    function begin(id) { offs[id] = len; put(id + ' 0 obj\n'); }
    function end() { put('\nendobj\n'); }
    function f(v) { return v.toFixed(2); }
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    begin(1); put('<< /Type /Catalog /Pages 2 0 R >>'); end();
    var kids = []; for (i = 0; i < n; i++) kids.push((3 + 3 * i) + ' 0 R');
    begin(2); put('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>'); end();
    for (i = 0; i < n; i++) {
      var p = pages[i], pid = 3 + 3 * i, cid = pid + 1, iid = pid + 2, L = p.layout;
      begin(pid);
      put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(L.pw) + ' ' + f(L.ph) + '] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
      end();
      var content = 'q\n' + f(L.dw) + ' 0 0 ' + f(L.dh) + ' ' + f(L.x) + ' ' + f(L.y) + ' cm\n/Im0 Do\nQ\n';
      begin(cid); put('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream'); end();
      begin(iid);
      put('<< /Type /XObject /Subtype /Image /Width ' + p.img.pw + ' /Height ' + p.img.ph + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.img.bytes.length + ' >>\nstream\n');
      put(p.img.bytes); put('\nendstream'); end();
    }
    var xref = len;
    var x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (i = 1; i <= total; i++) x += ('0000000000' + offs[i]).slice(-10) + ' 00000 n \n';
    x += 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    put(x);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* ---------- Convertir ---------- */
  function setBusy(b, text) {
    busy = b; $('convert').disabled = b || !items.length;
    $('convertTxt').textContent = text || 'Convertir y descargar PDF';
  }
  $('convert').onclick = async function () {
    if (busy || !items.length) return;
    msg(''); var pages = [];
    try {
      for (var i = 0; i < items.length; i++) {
        setBusy(true, 'Procesando ' + (i + 1) + ' de ' + items.length + '…');
        await new Promise(function (r) { setTimeout(r, 15); });
        var img = await toJpeg(items[i]);
        pages.push({ img: img, layout: pageLayout(img.iw, img.ih) });
      }
      var blob = buildPdf(pages), a = document.createElement('a');
      var base = items.length === 1 ? items[0].name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40) : 'imagenes';
      a.href = URL.createObjectURL(blob); a.download = (base || 'imagenes') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) {
      msg(e && e.message ? e.message : 'No se pudo crear el PDF.');
    }
    setBusy(false);
  };

  window.__imgpdf = { items: function () { return items; }, opts: opts };
  syncOri(); renderList();
})();
