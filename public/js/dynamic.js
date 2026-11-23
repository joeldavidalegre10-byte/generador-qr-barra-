/* Códigos dinámicos: se guardan en el servidor y se pueden editar después.
   - QR dinámico: el QR contiene BASE/q/<id>; el servidor redirige al destino actual.
   - Código de barras: se guarda y se puede editar el contenido (hay que reimprimirlo). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var K = window.CodeKit, esc = K.esc, SIZES = K.SIZES;
  var LS_BASE = 'bs-base-url', LS_KEY = 'bs-admin-key';

  var cfg = { baseUrl: '', authRequired: false };
  var items = [];
  var form = { type: 'qr', name: '', content: '', size: 'm', copies: 1, show: true };
  var editing = null;      // objeto guardado que se está editando
  var busy = false;

  /* ---------- Utilidades ---------- */
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  function base() {
    var b = $('dBase').value.trim() || lsGet(LS_BASE) || cfg.baseUrl || location.origin;
    return b.replace(/\/+$/, '');
  }
  function shortUrl(id) { return base() + '/q/' + id; }
  function toast(t) {
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }
  function msg(t, ok) { var m = $('dMsg'); m.textContent = t || ''; m.style.color = ok ? 'var(--accent)' : 'var(--danger)'; }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }

  /* ---------- API ---------- */
  function askKey(retry) {
    return new Promise(function (resolve) {
      var o = document.createElement('div');
      o.className = 'keybox';
      o.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-labelledby="kbT"><h3 id="kbT">Clave de administrador</h3><p>' +
        (retry ? 'La clave no es correcta. ' : '') + 'Este servidor pide una clave para crear o modificar códigos.</p>' +
        '<div class="field plain"><input type="password" id="kbIn" autocomplete="current-password" placeholder="Clave"></div>' +
        '<div class="row"><button class="btn" type="button" id="kbNo">Cancelar</button><button class="btn p" type="button" id="kbOk">Entrar</button></div></div>';
      document.body.appendChild(o);
      var inp = o.querySelector('#kbIn'); inp.focus();
      function done(v) { o.remove(); resolve(v); }
      o.querySelector('#kbOk').onclick = function () { done(inp.value); };
      o.querySelector('#kbNo').onclick = function () { done(null); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); });
    });
  }
  function api(method, url, body, retried) {
    var headers = { 'Content-Type': 'application/json' };
    var key = lsGet(LS_KEY);
    if (key) headers['X-Admin-Key'] = key;
    return fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) {
          return askKey(retried).then(function (k) {
            if (k == null) throw new Error('Operación cancelada.');
            lsSet(LS_KEY, k);
            return api(method, url, body, true);
          });
        }
        if (!r.ok) throw new Error(j.error || 'Error del servidor (' + r.status + ').');
        return j;
      });
    }, function () { throw new Error('No se pudo conectar con el servidor.'); });
  }

  /* ---------- Etiqueta ---------- */
  function layoutFor(item, show) {
    var wh = SIZES[item.size] || SIZES.m;
    if (item.type === 'bar') return K.layoutBar(item.content, wh[0], wh[1], show);
    return K.layoutQr(shortUrl(item.id), wh[0], wh[1], show, item.name || '');
  }

  /* ---------- Formulario ---------- */
  var HINT = {
    qr: 'Enlace (https://…) o texto. Puedes cambiarlo cuando quieras sin reimprimir el QR.',
    bar: 'Letras sin tilde, números y símbolos · máximo 32 caracteres'
  };
  var INFO = {
    qr: 'El QR guarda un enlace corto de este servidor y redirige al destino que definas. Al editar el destino, el QR ya impreso apunta a lo nuevo.',
    bar: 'Un código de barras no puede redirigir: su contenido va impreso en las barras. Si lo editas, hay que volver a imprimirlo; el código viejo seguirá leyendo el valor anterior.'
  };

  function previewLayout() {
    var wh = SIZES[form.size];
    if (form.type === 'bar') {
      var txt = form.content.trim();
      if (txt && /^[\x20-\x7e]+$/.test(txt) && txt.length <= 32) {
        try { return { L: K.layoutBar(txt, wh[0], wh[1], form.show) }; } catch (e) {}
      }
      if (txt && !/^[\x20-\x7e]+$/.test(txt)) return { err: 'Solo se admiten caracteres ASCII (sin tildes ni ñ).' };
      return { L: K.layoutBar('8437012345678', wh[0], wh[1], form.show), sample: true };
    }
    if (editing) return { L: K.layoutQr(shortUrl(editing.id), wh[0], wh[1], form.show, form.name.trim()) };
    return { L: K.layoutQr(shortUrl('xxxxxxx'), wh[0], wh[1], form.show, form.name.trim()), sample: true };
  }

  function renderForm() {
    var bar = form.type === 'bar', wh = SIZES[form.size], pv = previewLayout();
    $('dTabQr').setAttribute('aria-selected', !bar);
    $('dTabBar').setAttribute('aria-selected', bar);
    $('dTabQr').disabled = $('dTabBar').disabled = !!editing;   // el tipo no cambia al editar
    $('dBadge').textContent = bar ? 'Barras' : 'QR dinámico';
    $('dContentLbl').textContent = bar ? 'Contenido del código' : 'Destino del QR';
    $('dContent').maxLength = bar ? 32 : 2000;
    $('dContent').placeholder = bar ? 'Ej. 8437012345678' : 'https://tu-sitio.com o un texto';
    $('dSwSub').textContent = bar ? 'Texto bajo el código' : 'Nombre bajo el QR';
    $('dInfoTxt').textContent = INFO[form.type];
    var hint = $('dHint');
    hint.className = 'hint' + (pv.err ? ' err' : '');
    hint.textContent = pv.err || HINT[form.type];
    $('dLabel').innerHTML = pv.L ? K.svgOf(pv.L) : '';
    $('dLabel').className = 'label' + (pv.sample ? ' sample' : '');
    $('dLabel').style.aspectRatio = wh[0] + ' / ' + wh[1];
    $('dSampleTag').classList.toggle('hide', !pv.sample);
    $('dDims').textContent = wh[0] + ' × ' + wh[1] + ' mm';
    $('dTitle').textContent = editing ? 'Editar código' : 'Nuevo código';
    $('dEditing').classList.toggle('hide', !editing);
    if (editing) $('dEditingTxt').textContent = 'Editando: ' + (editing.name || (bar ? editing.content : 'QR ' + editing.id));
    $('dSaveTxt').textContent = busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar código';
    $('dSave').disabled = busy || !form.content.trim() || !!pv.err;
    var canOut = bar ? (!pv.sample && !pv.err) : !!editing;
    // Un QR nuevo aún no tiene código real: se imprime después de guardarlo
    $('dPrint').disabled = $('dPdf').disabled = !canOut;
    $('dPvSub').textContent = !bar && !editing ? 'Guarda el código para obtener el QR definitivo' : 'Así se verá tu etiqueta final';
  }

  function resetForm() {
    editing = null;
    form.name = ''; form.content = ''; form.copies = 1;
    $('dName').value = ''; $('dContent').value = ''; $('dCopies').value = 1;
    msg('');
    renderForm();
  }

  function startEdit(item) {
    editing = item;
    form.type = item.type; form.name = item.name || ''; form.content = item.content;
    form.size = item.size || 'm'; form.show = item.show !== false; form.copies = 1;
    $('dName').value = form.name; $('dContent').value = form.content; $('dSize').value = form.size; $('dCopies').value = 1;
    $('dToggle').setAttribute('aria-checked', form.show);
    msg('');
    renderForm();
    renderCards();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function save() {
    if (busy) return;
    var payload = { type: form.type, name: form.name.trim(), content: form.content.trim(), size: form.size, show: form.show };
    busy = true; msg(''); renderForm();
    var req = editing ? api('PUT', '/api/codes/' + editing.id, payload) : api('POST', '/api/codes', payload);
    req.then(function (saved) {
      var wasNew = !editing;
      var i = items.findIndex(function (x) { return x.id === saved.id; });
      if (i >= 0) items[i] = saved; else items.unshift(saved);
      busy = false;
      editing = saved;
      $('dContent').value = saved.content; form.content = saved.content;   // refleja el destino normalizado (https://…)
      msg(wasNew ? 'Guardado. Ya puedes imprimir o exportar el código.' : 'Cambios guardados.', true);
      renderForm(); renderCards();
    }).catch(function (e) { busy = false; msg(e.message); renderForm(); });
  }

  /* ---------- Lista ---------- */
  function renderCards() {
    var box = $('dCards');
    $('dCount').textContent = items.length ? items.length + (items.length === 1 ? ' código' : ' códigos') : '';
    if (!items.length) {
      box.innerHTML = '<div class="empty" style="grid-column:1/-1">Todavía no guardaste ningún código. Crea el primero con el formulario de arriba.</div>';
      return;
    }
    box.innerHTML = items.map(function (it) {
      var bar = it.type === 'bar', svg = '';
      try { svg = K.svgOf(layoutFor(it, it.show !== false)); } catch (e) {}
      var meta = bar ? 'Actualizado ' + fmtDate(it.updated)
        : (it.scans || 0) + (it.scans === 1 ? ' escaneo' : ' escaneos') + ' · Actualizado ' + fmtDate(it.updated);
      return '<article class="dcard' + (editing && editing.id === it.id ? ' on' : '') + '" data-id="' + esc(it.id) + '">' +
        '<div class="th"><div class="label" style="aspect-ratio:' + (SIZES[it.size] || SIZES.m).join(' / ') + '">' + svg + '</div></div>' +
        '<div class="bd"><div class="tp"><span class="badge' + (bar ? ' o' : '') + '">' + (bar ? 'Barras' : 'QR dinámico') + '</span></div>' +
        '<div class="nm" title="' + esc(it.name || '') + '">' + esc(it.name || (bar ? 'Sin nombre' : 'QR ' + it.id)) + '</div>' +
        '<div class="dest" title="' + esc(it.content) + '">' + (bar ? '' : '→ ') + esc(it.content) + '</div>' +
        '<div class="meta">' + esc(meta) + '</div></div>' +
        '<div class="ac2"><button type="button" data-a="edit">Editar</button><button type="button" data-a="pdf">PDF</button>' +
        '<button type="button" data-a="copy"' + (bar ? ' disabled title="Solo para QR"' : '') + '>Copiar enlace</button>' +
        '<button type="button" class="del" data-a="del">Eliminar</button></div></article>';
    }).join('');
  }

  $('dCards').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-a]'); if (!b || b.disabled) return;
    var id = b.closest('.dcard').getAttribute('data-id');
    var it = items.find(function (x) { return x.id === id; }); if (!it) return;
    var a = b.getAttribute('data-a');
    if (a === 'edit') startEdit(it);
    else if (a === 'pdf') K.downloadPdf(layoutFor(it, it.show !== false), 1, it.name || it.content);
    else if (a === 'copy') {
      var url = shortUrl(it.id);
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Enlace copiado'); },
        function () { window.prompt('Copia este enlace:', url); });
    } else if (a === 'del') {
      if (!window.confirm('¿Eliminar "' + (it.name || it.content) + '"?' + (it.type === 'qr' ? '\n\nLos QR ya impresos dejarán de funcionar.' : ''))) return;
      api('DELETE', '/api/codes/' + it.id).then(function () {
        items = items.filter(function (x) { return x.id !== id; });
        if (editing && editing.id === id) resetForm();
        renderCards(); toast('Código eliminado');
      }).catch(function (err) { toast(err.message); });
    }
  });

  /* ---------- Eventos ---------- */
  function setType(t) { if (editing) return; form.type = t; form.content = ''; $('dContent').value = ''; msg(''); renderForm(); }
  $('dTabQr').onclick = function () { setType('qr'); };
  $('dTabBar').onclick = function () { setType('bar'); };
  $('dName').addEventListener('input', function (e) { form.name = e.target.value; renderForm(); });
  $('dContent').addEventListener('input', function (e) { form.content = e.target.value; renderForm(); });
  $('dContent').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !$('dSave').disabled) save(); });
  $('dSize').addEventListener('change', function (e) { form.size = e.target.value; renderForm(); });
  $('dToggle').onclick = function () { form.show = !form.show; this.setAttribute('aria-checked', form.show); renderForm(); };
  function setCopies(v) { v = Math.max(1, Math.min(100, parseInt(v, 10) || 1)); form.copies = v; $('dCopies').value = v; }
  $('dMinus').onclick = function () { setCopies(form.copies - 1); };
  $('dPlus').onclick = function () { setCopies(form.copies + 1); };
  $('dCopies').addEventListener('change', function (e) { setCopies(e.target.value); });
  $('dSave').onclick = save;
  $('dCancel').onclick = function () { resetForm(); renderCards(); };
  $('dBase').addEventListener('change', function () {
    var v = $('dBase').value.trim().replace(/\/+$/, '');
    if (v && !/^https?:\/\/[^\s/]+/i.test(v)) { msg('La dirección debe empezar por http:// o https://'); $('dBase').value = ''; v = ''; }
    lsSet(LS_BASE, v); renderForm(); renderCards();
  });

  function currentLayout() {
    var p = previewLayout();
    if (p.err || p.sample || (form.type === 'qr' && !editing)) return null;
    return p.L;
  }
  $('dPrint').onclick = function () { var L = currentLayout(); if (L) K.printLabels(L, SIZES[form.size], form.copies); };
  $('dPdf').onclick = function () { var L = currentLayout(); if (L) K.downloadPdf(L, form.copies, form.name || form.content); };

  /* ---------- Inicio ---------- */
  $('dBase').value = lsGet(LS_BASE);
  renderForm(); renderCards();
  fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
    cfg = c; renderForm(); renderCards();
    return api('GET', '/api/codes');
  }).then(function (list) {
    items = list; renderCards();
  }).catch(function (e) { msg(e.message); });
})();
