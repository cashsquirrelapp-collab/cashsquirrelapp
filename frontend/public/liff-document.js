// The LINE form for a quotation or invoice draft (owner, 2026-10-30: "ตรงไหนที่ยังไม่กรอก ... ก็จะมีให้กรอก"). liff-add.js
// opens it for draftKind=document after LINE sign-in. Everything the document needs is on one page, filled from the
// draft card; the server (liff-submit, draftKind document) checks it again and saves the document.
(function () {
  'use strict';
  var NAMES = { quotation: 'ใบเสนอราคา', invoice: 'ใบแจ้งหนี้' };
  var TERMS = [0, 7, 15, 30, 45, 60, 90];
  var MAX_ITEMS = 30;
  var ISSUER_KEYS = ['name', 'address', 'taxId', 'phone', 'email', 'bankName', 'bankAccount', 'bankAccountName'];
  var state = { reference: null, type: 'quotation', items: [], creditTerm: 0, issuer: {}, issuerComplete: false, issuerOpen: false, submitting: false, requestId: crypto.randomUUID() };
  var field = function (id) { return document.getElementById(id); };
  var value = function (id) { return field(id).value.trim(); };
  var round2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  var baht = function (n) { return '฿' + (Number.isFinite(n) ? n : 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  function status(title, message, reaction, closeButton) {
    field('form-view').classList.add('hidden');
    var view = field('status-view'); view.classList.remove('hidden'); view.replaceChildren();
    var image = document.createElement('img'); image.className = 'emoji'; image.src = '/line/mascot-v6-' + (reaction || 'guide') + '.png'; image.alt = '';
    var heading = document.createElement('h2'); heading.textContent = title;
    var paragraph = document.createElement('p'); paragraph.textContent = message;
    view.append(image, heading, paragraph);
    if (closeButton) {
      var button = document.createElement('button'); button.type = 'button'; button.textContent = 'กลับไปแชท';
      button.addEventListener('click', close); view.append(button);
    }
  }
  function close() {
    try { if (window.liff && liff.isInClient()) { liff.closeWindow(); return; } } catch (error) {}
    status('กลับไปที่แชท LINE', 'กลับไปที่แอป LINE แล้วเปิดแชทกระรอกตุนเงินได้เลยครับ', 'guide', false);
  }
  function showError(message, focusId) {
    var box = field('document-error-box'); box.textContent = message; box.style.display = 'block';
    if (focusId && field(focusId)) field(focusId).focus(); else box.focus();
  }
  function clearError() { field('document-error-box').style.display = 'none'; }
  // A query value from the LIFF link itself or from LINE's liff.state (read only, never followed).
  // LIFF may rewrite the address during init, so the address as first opened is kept too (this file runs before it).
  var firstSearch = window.location.search;
  function linkParam(name) {
    var found = null;
    [window.location.search, firstSearch].some(function (search) {
      var params = new URLSearchParams(search);
      if (params.has(name)) { found = params.get(name); return true; }
      var state = params.get('liff.state');
      if (!state) return false;
      var at = state.indexOf('?');
      var nested = new URLSearchParams(at >= 0 ? state.slice(at + 1) : state.replace(/^\?/, ''));
      if (nested.has(name)) { found = nested.get(name); return true; }
      return false;
    });
    return found;
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) { var script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script); });
  }
  // The new document's page as a picture in the chat, after its card (owner: "ส่งรูป PDF เข้าแชทเหมือน Paypers").
  async function sendPicture(documentRecord) {
    try {
      status('กำลังส่งรูปเอกสารเข้าแชท', 'รอสักครู่ครับ', 'working', false);
      if (!window.KrarokDocumentImage) await loadScript('/liff-document-image.js');
      var image = await window.KrarokDocumentImage.render(documentRecord);
      var response = await fetch('/api/liff-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'document-image', draftKind: 'document', draftKey: state.reference.key, idToken: liff.getIDToken(), image: image }) });
      var data = await response.json();
      return response.ok && data.ok === true && data.imageSent === true;
    } catch (error) { return false; }
  }

  function totals() {
    var subtotal = state.items.reduce(function (sum, item) { return sum + (Number(item.quantity) || 0) * (Number(item.price) || 0); }, 0);
    var vatRate = Number(value('doc-vat')) || 0, whtRate = Number(value('doc-wht')) || 0;
    var vat = vatRate > 0 ? round2(subtotal * vatRate / 100) : 0;
    var wht = whtRate > 0 ? round2(subtotal * whtRate / 100) : 0;
    return { subtotal: subtotal, vat: vat, wht: wht, whtRate: whtRate, vatRate: vatRate, payable: subtotal + vat - wht };
  }
  function updateTotals() {
    var t = totals();
    field('doc-subtotal').textContent = baht(t.subtotal);
    field('doc-vat-row').classList.toggle('hidden', !t.vatRate);
    field('doc-vat-amount').textContent = baht(t.vat);
    field('doc-wht-row').classList.toggle('hidden', !t.whtRate);
    field('doc-wht-label').textContent = 'หัก ณ ที่จ่าย ' + t.whtRate + '%';
    field('doc-wht-amount').textContent = '−' + baht(t.wht);
    field('doc-payable').textContent = baht(t.payable);
    field('document-summary-amount').textContent = baht(t.payable);
    var named = state.items.filter(function (item) { return item.description.trim(); });
    field('document-summary-name').textContent = value('doc-client-name')
      ? value('doc-client-name') + (named.length ? ' · ' + named[0].description + (named.length > 1 ? ' และอีก ' + (named.length - 1) + ' รายการ' : '') : '')
      : 'ยังไม่ได้กรอกลูกค้า';
    state.items.forEach(function (item, at) {
      var line = field('doc-item-line-' + at);
      if (line) line.textContent = 'รวม ' + baht((Number(item.quantity) || 0) * (Number(item.price) || 0));
    });
  }

  function input(id, type, label, initial, options) {
    var wrap = document.createElement('div'); if (options && options.wide) wrap.className = 'wide';
    var title = document.createElement('label'); title.htmlFor = id; title.textContent = label;
    if (options && options.required) { var star = document.createElement('span'); star.setAttribute('aria-hidden', 'true'); star.textContent = ' *'; title.append(star); }
    var control = document.createElement('input'); control.type = type; control.id = id; control.value = initial === undefined || initial === null ? '' : String(initial);
    if (type === 'number') { control.min = '0'; control.step = options && options.step ? options.step : '0.01'; control.inputMode = 'decimal'; }
    if (options && options.placeholder) control.placeholder = options.placeholder;
    control.maxLength = 200;
    wrap.append(title, control);
    return { wrap: wrap, control: control };
  }
  function renderItems() {
    var list = field('document-items'); list.replaceChildren();
    state.items.forEach(function (item, at) {
      var box = document.createElement('div'); box.className = 'doc-item';
      var head = document.createElement('div'); head.className = 'doc-item-head';
      var name = document.createElement('span'); name.textContent = 'รายการ ' + (at + 1);
      head.append(name);
      if (state.items.length > 1) {
        var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'ลบ';
        remove.setAttribute('aria-label', 'ลบรายการ ' + (at + 1));
        remove.addEventListener('click', function () { state.items.splice(at, 1); renderItems(); updateTotals(); });
        head.append(remove);
      }
      var description = input('doc-item-desc-' + at, 'text', 'รายละเอียด', item.description, { required: true, placeholder: 'เช่น ถ่ายรูปสินค้า' });
      var grid = document.createElement('div'); grid.className = 'doc-item-grid';
      var quantity = input('doc-item-qty-' + at, 'number', 'จำนวน', item.quantity, { step: 'any' });
      var unit = input('doc-item-unit-' + at, 'text', 'หน่วย', item.unit || '', { placeholder: 'เช่น รูป งาน' });
      var price = input('doc-item-price-' + at, 'number', 'ราคาต่อหน่วย (บาท)', item.price || '', { required: true, wide: true });
      description.control.addEventListener('input', function () { item.description = description.control.value; updateTotals(); });
      quantity.control.addEventListener('input', function () { item.quantity = Number(quantity.control.value) || 0; updateTotals(); });
      unit.control.addEventListener('input', function () { item.unit = unit.control.value; });
      price.control.addEventListener('input', function () { item.price = Number(price.control.value) || 0; updateTotals(); });
      grid.append(quantity.wrap, unit.wrap, price.wrap);
      var line = document.createElement('div'); line.className = 'doc-item-line'; line.id = 'doc-item-line-' + at;
      box.append(head, description.wrap, grid, line);
      list.append(box);
    });
    field('document-add-item').classList.toggle('hidden', state.items.length >= MAX_ITEMS);
    updateTotals();
  }
  function renderTerms() {
    var group = field('document-terms'); group.replaceChildren();
    TERMS.forEach(function (days) {
      var chip = document.createElement('button'); chip.type = 'button';
      chip.textContent = days ? days + ' วัน' : 'ไม่มี';
      chip.setAttribute('aria-pressed', String(state.creditTerm === days));
      chip.addEventListener('click', function () { state.creditTerm = days; renderTerms(); });
      group.append(chip);
    });
  }

  // The user's own business (owner, 2026-10-30: "ผู้ออกเอกสารต้องมีที่อยู่ เลขผู้เสียภาษี เบอร์ด้วย เหมือนออกบิล"): its name,
  // address, 13-digit tax ID and phone are needed, as the server checks too; email and the bank account are optional.
  var digitCount = function (text) { return String(text || '').replace(/\D/g, '').length; };
  function issuerProblem(issuer) {
    if (!String(issuer.name || '').trim()) return { id: 'doc-issuer-name', text: 'กรุณากรอกชื่อธุรกิจหรือชื่อของคุณ (ผู้ออกเอกสาร)' };
    if (!String(issuer.address || '').trim()) return { id: 'doc-issuer-address', text: 'กรุณากรอกที่อยู่ของผู้ออกเอกสาร' };
    if (digitCount(issuer.taxId) !== 13) return { id: 'doc-issuer-taxId', text: 'กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลักของผู้ออกเอกสาร' };
    if (digitCount(issuer.phone) < 9) return { id: 'doc-issuer-phone', text: 'กรุณากรอกเบอร์โทรศัพท์ของผู้ออกเอกสาร' };
    if (issuer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(issuer.email)) return { id: 'doc-issuer-email', text: 'อีเมลของผู้ออกเอกสารไม่ถูกต้อง' };
    return null;
  }
  function issuerFromFields() {
    var issuer = {}; ISSUER_KEYS.forEach(function (key) { issuer[key] = value('doc-issuer-' + key); }); return issuer;
  }
  function openIssuer(help) {
    state.issuerOpen = true;
    field('document-issuer-known').classList.add('hidden');
    field('document-issuer-fields').classList.remove('hidden');
    field('document-issuer-help').textContent = help;
  }
  function fillIssuer(issuer) {
    state.issuer = issuer;
    ISSUER_KEYS.forEach(function (key) { field('doc-issuer-' + key).value = issuer[key] || ''; });
    state.issuerComplete = !issuerProblem(issuer);
    field('document-issuer-name').textContent = issuer.name || '';
    var bank = [issuer.bankName, issuer.bankAccount, issuer.bankAccountName].filter(Boolean).join(' ');
    field('document-issuer-details').textContent = [issuer.address, 'เลขผู้เสียภาษี ' + issuer.taxId + ' · โทร ' + issuer.phone, issuer.email, bank && 'รับเงิน ' + bank]
      .filter(Boolean).join('\n');
    state.issuerOpen = false;
    field('document-issuer-known').classList.toggle('hidden', !state.issuerComplete);
    field('document-issuer-fields').classList.toggle('hidden', state.issuerComplete);
    if (!state.issuerComplete) openIssuer(String(issuer.name || '').trim()
      ? 'ข้อมูลผู้ออกเอกสารยังไม่ครบ กรอกครั้งเดียว ระบบจะบันทึกไว้ใช้กับเอกสารใบต่อไป'
      : 'ยังไม่มีข้อมูลธุรกิจของคุณ กรอกครั้งเดียว เอกสารใบต่อไปจะใช้ข้อมูลนี้ให้เอง');
  }

  function fill(data) {
    var draft = data.draft || {}, client = draft.client || {}, issuer = data.issuer || {};
    state.type = draft.type === 'invoice' ? 'invoice' : 'quotation';
    var name = NAMES[state.type];
    field('document-title').textContent = name;
    field('document-submit-btn').textContent = 'สร้าง' + name;
    document.title = name + ' · Krarok Tunngern';
    if (draft.heard) { field('document-heard-text').textContent = 'จากข้อความของคุณ: “' + draft.heard + '”'; field('document-heard').classList.remove('hidden'); }
    fillIssuer(issuer);
    ['name', 'address', 'taxId', 'phone'].forEach(function (key) { field('doc-client-' + key).value = client[key] || ''; });
    field('doc-client-branch').value = client.branch || '';
    field('doc-vat').value = String(draft.vatRate === 7 ? 7 : 0);
    field('doc-wht').value = String([1, 2, 3, 5].indexOf(draft.whtRate) >= 0 ? draft.whtRate : 0);
    state.creditTerm = TERMS.indexOf(draft.creditTerm) >= 0 ? draft.creditTerm : 0;
    if (draft.creditTerm && TERMS.indexOf(draft.creditTerm) < 0) { TERMS.push(draft.creditTerm); TERMS.sort(function (a, b) { return a - b; }); state.creditTerm = draft.creditTerm; }
    field('doc-note').value = draft.note || '';
    state.items = (Array.isArray(draft.items) && draft.items.length ? draft.items : [{ description: '', quantity: 1, price: 0 }]).slice(0, MAX_ITEMS)
      .map(function (item) { return { description: String(item.description || ''), quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1, unit: item.unit ? String(item.unit) : '', price: Number(item.price) > 0 ? Number(item.price) : 0 }; });
    renderItems(); renderTerms();
  }

  function validate() {
    var issuerIssue = issuerProblem(state.issuerOpen ? issuerFromFields() : state.issuer);
    if (issuerIssue) { if (!state.issuerOpen) openIssuer('กรอกให้ครบ ระบบจะบันทึกไว้ใช้กับเอกสารใบต่อไป'); showError(issuerIssue.text, issuerIssue.id); return false; }
    if (!value('doc-client-name')) { showError('กรุณากรอกชื่อลูกค้าหรือบริษัท', 'doc-client-name'); return false; }
    for (var at = 0; at < state.items.length; at++) {
      var item = state.items[at];
      if (!item.description.trim()) { showError('กรุณากรอกรายละเอียดรายการ ' + (at + 1), 'doc-item-desc-' + at); return false; }
      if (!(item.quantity > 0)) { showError('จำนวนของรายการ ' + (at + 1) + ' ต้องมากกว่า 0', 'doc-item-qty-' + at); return false; }
      if (!(item.price > 0) || item.price !== round2(item.price)) { showError('ราคาของรายการ ' + (at + 1) + ' ต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง', 'doc-item-price-' + at); return false; }
    }
    return true;
  }
  async function submit(auto) {
    if (state.submitting) return;
    clearError();
    if (!validate()) return;
    var button = field('document-submit-btn'), original = button.textContent;
    state.submitting = true; button.disabled = true; button.textContent = 'กำลังสร้าง…';
    try {
      var idToken = liff.getIDToken();
      if (!idToken) { if (auto) showForm(); showError('กรุณาเปิดฟอร์มนี้จาก LINE อีกครั้งเพื่อยืนยันบัญชี'); return; }
      var payload = {
        action: 'confirm-draft', draftKind: 'document', draftKey: state.reference.key, requestId: state.requestId, idToken: idToken,
        document: {
          type: state.type,
          client: { name: value('doc-client-name'), address: value('doc-client-address'), taxId: value('doc-client-taxId'), branch: value('doc-client-branch'), phone: value('doc-client-phone') },
          items: state.items.map(function (item) { return { description: item.description.trim(), quantity: item.quantity, unit: (item.unit || '').trim(), price: item.price }; }),
          vatRate: Number(value('doc-vat')) || 0, whtRate: Number(value('doc-wht')) || 0, creditTerm: state.creditTerm, note: value('doc-note'),
        },
      };
      // The business as filled in or changed here; the server keeps it for the next document (the logo and signature stay).
      if (state.issuerOpen) payload.document.issuer = issuerFromFields();
      var response = await fetch('/api/liff-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await response.json();
      if (!response.ok || data.ok !== true) {
        if ([404, 409, 410].indexOf(response.status) >= 0) { status('เปิดแบบร่างนี้ไม่ได้', (data.error || 'แบบร่างนี้หมดเวลาหรือมีแบบร่างใหม่แล้ว') + '\nกลับไปแชทแล้วพิมพ์ “ทำใบเสนอราคา” เพื่อเริ่มใหม่', 'urgent', true); return; }
        if (auto) showForm();
        showError(data.error || 'สร้างเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง'); return;
      }
      var pictured = !data.duplicate && data.document ? await sendPicture(data.document) : false;
      var message = (data.documentNo ? 'เลขที่ ' + data.documentNo + '\n' : '') + (data.notificationSent === false
        ? 'สร้างแล้ว แต่ยังส่งการ์ดเข้าแชทไม่สำเร็จ ดูเอกสารได้ที่เมนู เอกสาร ในแอป'
        : pictured ? 'ส่งการ์ดและรูปเอกสารเข้าแชทแล้ว ดาวน์โหลด PDF ได้จากปุ่มบนการ์ด'
        : 'ส่งการ์ดพร้อมปุ่มดูเอกสารและดาวน์โหลด PDF ไปที่แชทแล้ว');
      status(data.duplicate ? 'สร้างไว้แล้ว' : 'สร้าง' + NAMES[state.type] + 'แล้ว', message, 'document', true);
      // From the card's สร้างเอกสาร: back to the chat by itself, where the card and the picture are.
      if (auto && !data.duplicate) setTimeout(close, 1600);
    } catch (error) {
      if (auto) showForm();
      showError('ยังยืนยันผลไม่ได้ กรุณาลองอีกครั้งจากหน้านี้ ระบบจะไม่สร้างเอกสารซ้ำ');
    } finally { state.submitting = false; button.disabled = false; button.textContent = original; }
  }

  async function open(reference) {
    state.reference = reference;
    var idToken = liff.getIDToken();
    if (!idToken) { status('เปิดแบบร่างไม่ได้', 'กรุณาเปิดจากการ์ดในแชท LINE อีกครั้ง', 'urgent', true); return; }
    var response = await fetch('/api/liff-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load-draft', draftKind: 'document', draftKey: reference.key, idToken: idToken }) });
    var data = await response.json();
    if (!response.ok || data.ok !== true || data.kind !== 'document' || !data.draft) {
      status('เปิดแบบร่างไม่ได้', (data.error || 'แบบร่างนี้หมดเวลาหรือมีแบบร่างใหม่แล้ว') + '\nกลับไปแชทแล้วพิมพ์ “ทำใบเสนอราคา” เพื่อเริ่มใหม่', 'urgent', true); return;
    }
    fill(data);
    document.body.classList.add('draft-mode');
    ['job-card', 'expense-card'].forEach(function (id) { field(id).classList.add('hidden'); });
    document.querySelector('.kind-tabs').classList.add('hidden');
    field('document-card').classList.remove('hidden');
    field('return-chat-btn').classList.remove('hidden');
    // สร้างเอกสาร on a complete card opens here to create at once (so the picture can be drawn); anything missing shows the form.
    if (linkParam('create') === '1' && state.issuerComplete) {
      clearError();
      if (validate()) { status('กำลังสร้าง' + NAMES[state.type], 'รอสักครู่ครับ', 'working', false); await submit(true); return; }
    }
    showForm();
  }
  function showForm() {
    field('status-view').classList.add('hidden'); field('form-view').classList.remove('hidden');
  }

  document.addEventListener('DOMContentLoaded', function () {
    field('document-add-item').addEventListener('click', function () {
      if (state.items.length >= MAX_ITEMS) return;
      state.items.push({ description: '', quantity: 1, unit: '', price: 0 }); renderItems();
      var last = field('doc-item-desc-' + (state.items.length - 1)); if (last) last.focus();
    });
    ['doc-vat', 'doc-wht', 'doc-client-name'].forEach(function (id) { field(id).addEventListener('input', updateTotals); field(id).addEventListener('change', updateTotals); });
    field('document-submit-btn').addEventListener('click', function () { submit(false); });
    field('document-issuer-edit').addEventListener('click', function () {
      openIssuer('แก้ไขแล้วจะบันทึกเป็นข้อมูลธุรกิจของคุณ ใช้กับเอกสารใบต่อไปด้วย');
      field('doc-issuer-name').focus();
    });
  });
  window.KrarokDocumentForm = { open: open, fill: fill };
})();
