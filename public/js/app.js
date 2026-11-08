(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
  var SIZES = { s: [50, 30], m: [70, 40], l: [100, 60] };
  var state = { mode: 'bar', vals: { bar: '8437012345678', qr: 'https://' }, size: 'm', copies: 1, show: true };

  /* ---------- Code 128 (auto B/C) ---------- */
  function isD(c) { return c >= '0' && c <= '9'; }
  function encode128(s) {
    var n = s.length, i = 0, mode = null, codes = [];
    function digits(k) { var d = 0; while (k + d < n && isD(s[k + d])) d++; return d; }
    function val(k) { return s.charCodeAt(k) - 32; }
    while (i < n) {
      var d = digits(i);
      if (mode === 'C') {
        if (d >= 2) { codes.push(parseInt(s.substr(i, 2), 10)); i += 2; continue; }
        codes.push(100); mode = 'B'; continue;
      }
      if (d >= 4) {
        if (mode === null) {
          if (d % 2) { codes.push(104, val(i)); i++; mode = 'B'; }
          else { codes.push(105); mode = 'C'; continue; }
        } else if (d % 2) { codes.push(val(i)); i++; }
        codes.push(99); mode = 'C'; continue;
      }
      if (mode === null) { codes.push(104); mode = 'B'; }
      codes.push(val(i)); i++;
    }
    var sum = codes[0];
    for (var k = 1; k < codes.length; k++) sum += codes[k] * k;
    codes.push(sum % 103, 106);
    return codes.map(function (c) { return C128[c]; }).join('');
  }

  /* ---------- Diseño de la etiqueta (en mm) ---------- */
  function textSize(str, w) { return Math.min(4.6, (w - 8) / (Math.max(str.length, 1) * 0.74)); }

  function layoutBar(text, w, h, show) {
    var widths = encode128(text), total = 0, i;
    for (i = 0; i < widths.length; i++) total += +widths[i];
    var pad = 3, mw = (w - 2 * pad) / (total + 20), x = pad + 10 * mw;
    var rects = [], barsH = h * (show ? 0.5 : 0.56);
    var block = barsH + (show ? 9 : 0), top = (h - block) / 2;
    for (i = 0; i < widths.length; i++) {
      var wd = +widths[i] * mw;
      if (i % 2 === 0) rects.push([x, top, wd, barsH]);
      x += wd;
    }
    var sz = textSize(text, w);
    return { w: w, h: h, rects: rects, mw: mw,
      text: show ? { str: text, cx: w / 2, y: top + barsH + 6.3, size: sz, cs: sz * 0.14 } : null };
  }

  function layoutQr(text, w, h, show) {
    var Q = window.QRCodeLib;
    var qr = new Q.QRCode(-1, Q.ErrorCorrectLevel.M);
    qr.addData(unescape(encodeURIComponent(text)));
    qr.make();
    var n = qr.getModuleCount(), quiet = 2;
    var avail = Math.min(w - 8, h - 8 - (show ? 7 : 0));
    var cell = avail / (n + quiet * 2), q = cell * n;
    var x0 = (w - q) / 2, y0 = show ? 4 + quiet * cell : (h - q) / 2;
    var rects = [], r, c, start;
    for (r = 0; r < n; r++) {
      start = -1;
      for (c = 0; c <= n; c++) {
        var dark = c < n && qr.isDark(r, c);
        if (dark && start < 0) start = c;
        if (!dark && start >= 0) { rects.push([x0 + start * cell, y0 + r * cell, (c - start) * cell, cell]); start = -1; }
      }
    }
    var sz = Math.min(textSize(text, w), 3.4);
    return { w: w, h: h, rects: rects, mw: cell,
      text: show ? { str: text.length > 40 ? text.slice(0, 39) + '…' : text, cx: w / 2, y: y0 + q + 2 * cell + 4.2, size: sz, cs: sz * 0.06 } : null };
  }

  /* ---------- Render ---------- */
  function f(v) { return v.toFixed(3); }
  function svgOf(L) {
    var d = L.rects.map(function (r) { return 'M' + f(r[0]) + ' ' + f(r[1]) + 'h' + f(r[2]) + 'v' + f(r[3]) + 'h-' + f(r[2]) + 'z'; }).join('');
    var t = '';
    if (L.text) {
      t = '<text x="' + f(L.text.cx) + '" y="' + f(L.text.y) + '" text-anchor="middle" font-family="\'Courier New\',Courier,monospace" font-weight="700" font-size="' + f(L.text.size) + '" letter-spacing="' + f(L.text.cs) + '" fill="#111">' + esc(L.text.str) + '</text>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L.w + ' ' + L.h + '" width="' + L.w + 'mm" height="' + L.h + 'mm"><rect width="' + L.w + '" height="' + L.h + '" fill="#fff"/><path d="' + d + '" fill="#111"/>' + t + '</svg>';
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var current = null;
  function build() {
    var text = state.vals[state.mode], wh = SIZES[state.size];
    if (!text) return { err: '' };
    try {
      if (state.mode === 'bar') {
        if (!/^[\x20-\x7e]+$/.test(text)) return { err: 'Solo se admiten letras sin tilde, números y símbolos comunes (ASCII).' };
        var L = layoutBar(text, wh[0], wh[1], state.show);
        if (L.mw < 0.19) L.warn = 'Contenido largo para este tamaño: elige una etiqueta más grande para que se lea bien.';
        return { L: L };
      }
      return { L: layoutQr(text, wh[0], wh[1], state.show) };
    } catch (e) {
      return { err: 'No se pudo generar el código. Prueba con un texto más corto.' };
    }
  }

  var HINT = {
    bar: 'Admite números, letras y símbolos · máximo 32 caracteres',
    qr: 'Texto, enlaces, contactos… · máximo 200 caracteres'
  };
  function render() {
    var b = build(); current = b.L || null;
    var hint = $('hint');
    hint.className = 'hint' + (b.err ? ' err' : b.L && b.L.warn ? ' warn' : '');
    hint.textContent = b.err || (b.L && b.L.warn) || HINT[state.mode];
    $('label').innerHTML = current ? svgOf(current) : '<div class="empty">Escribe un contenido para ver la vista previa</div>';
    $('print').disabled = $('pdf').disabled = !current;
    var wh = SIZES[state.size];
    $('dims').textContent = wh[0] + ' × ' + wh[1] + ' mm';
    // proporción real de la etiqueta en la vista previa
    $('label').style.aspectRatio = current ? wh[0] + ' / ' + wh[1] : '';
    var bar = state.mode === 'bar';
    $('badge').textContent = bar ? 'Code 128' : 'QR';
    $('foot').textContent = (bar ? 'Code 128' : 'Código QR') + ' · Alta resolución · Listo para impresión';
  }

  /* ---------- Controles ---------- */
  function setMode(m) {
    state.mode = m;
    $('tabBar').setAttribute('aria-selected', m === 'bar');
    $('tabQr').setAttribute('aria-selected', m === 'qr');
    var inp = $('content'); inp.maxLength = m === 'bar' ? 32 : 200; inp.value = state.vals[m];
    $('fieldIc').innerHTML = m === 'bar'
      ? '<path d="M4 5v14M8 5v14M12 5v14M16 5v14M20 5v14"/>'
      : '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20h-3v-3"/>';
    render();
  }
  $('tabBar').onclick = function () { setMode('bar'); };
  $('tabQr').onclick = function () { setMode('qr'); };
  $('content').addEventListener('input', function (e) { state.vals[state.mode] = e.target.value; render(); });
  $('size').addEventListener('change', function (e) { state.size = e.target.value; render(); });
  $('toggle').onclick = function () { state.show = !state.show; this.setAttribute('aria-checked', state.show); render(); };
  function setCopies(v) { v = Math.max(1, Math.min(100, parseInt(v, 10) || 1)); state.copies = v; $('copies').value = v; }
  $('minus').onclick = function () { setCopies(state.copies - 1); };
  $('plus').onclick = function () { setCopies(state.copies + 1); };
  $('copies').addEventListener('change', function (e) { setCopies(e.target.value); });

  /* ---------- Imprimir ---------- */
  $('print').onclick = function () {
    if (!current) return;
    var wh = SIZES[state.size], html = '', i;
    for (i = 0; i < state.copies; i++) html += '<div class="plabel" style="width:' + wh[0] + 'mm;height:' + wh[1] + 'mm">' + svgOf(current) + '</div>';
    $('printArea').innerHTML = html;
    $('pageStyle').textContent = '@page{size:' + wh[0] + 'mm ' + wh[1] + 'mm;margin:0}';
    setTimeout(function () { window.print(); }, 50);
  };

  /* ---------- PDF vectorial (sin librerías) ---------- */
  var PT = 72 / 25.4;
  function pdfStr(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?'); }
  function makePdf(L, copies) {
    var W = L.w * PT, H = L.h * PT, p = function (v) { return v.toFixed(3); };
    var c = 'q\n0.067 g\n';
    L.rects.forEach(function (r) { c += p(r[0] * PT) + ' ' + p((L.h - r[1] - r[3]) * PT) + ' ' + p(r[2] * PT) + ' ' + p(r[3] * PT) + ' re\n'; });
    c += 'f\n';
    if (L.text) {
      var t = L.text, str = t.str.replace(/…/g, '...'), n = str.length;
      var width = n * (0.6 * t.size + t.cs) - t.cs;   // Courier = 0.6 em por carácter
      c += 'BT\n/F1 ' + p(t.size * PT) + ' Tf\n' + p(t.cs * PT) + ' Tc\n' + p((t.cx - width / 2) * PT) + ' ' + p((L.h - t.y) * PT) + ' Td\n(' + pdfStr(str) + ') Tj\nET\n';
    }
    c += 'Q\n';
    var objs = [], i;
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    var kids = [];
    for (i = 0; i < copies; i++) kids.push((4 + i * 2) + ' 0 R');
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + copies + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>';
    for (i = 0; i < copies; i++) {
      objs[4 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p(W) + ' ' + p(H) + '] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>';
      objs[5 + i * 2] = '<< /Length ' + c.length + ' >>\nstream\n' + c + 'endstream';
    }
    var out = '%PDF-1.4\n', offs = [];
    for (i = 1; i < objs.length; i++) { offs[i] = out.length; out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
    var xref = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (i = 1; i < objs.length; i++) out += ('0000000000' + offs[i]).slice(-10) + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    var u8 = new Uint8Array(out.length);
    for (i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
    return u8;
  }
  $('pdf').onclick = function () {
    if (!current) return;
    var blob = new Blob([makePdf(current, state.copies)], { type: 'application/pdf' });
    var a = document.createElement('a');
    var name = (state.vals[state.mode] || 'etiqueta').replace(/[^\w.-]+/g, '_').slice(0, 30);
    a.href = URL.createObjectURL(blob); a.download = 'etiqueta-' + name + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };

  window.__app = { encode128: encode128, state: state };
  render();
})();
