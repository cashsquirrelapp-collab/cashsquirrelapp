(function () {
  'use strict';
  var submissionId = crypto.randomUUID();
  var currentKind = 'job';
  var ready = false;
  var submitting = false;
  var draftReference = null;
  var draftLoaded = false;
  // Sign-up inside LINE (owner, 2026-11-13): offered when the server says so (/api/liff-config signup).
  var signupOffered = false;
  var field = function (id) { return document.getElementById(id); };
  var valueOf = function (id) { return field(id).value.trim(); };
  var roundMoney = function (value) { return Math.round((value + Number.EPSILON) * 100) / 100; };
  var hasCentsPrecision = function (value) { return Number.isFinite(value) && value === roundMoney(value); };

  function fmtCurrency(value) {
    return '฿' + (Number.isFinite(value) ? value : 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function setValue(id, value) { field(id).value = value === undefined || value === null ? '' : String(value); }

  function mascotUrl(reaction) { return '/line/mascot-v6-' + reaction + '.png'; }

  // The job and expense forms open only for a draft from the chat, in design B (owner 2026-11-13: "ดูง่ายกว่า").
  function setKind(kind) {
    if (draftReference && draftLoaded && kind !== draftReference.kind) return;
    currentKind = kind;
    field('job-card').classList.toggle('hidden', kind !== 'job'); field('expense-card').classList.toggle('hidden', kind !== 'expense');
  }
  // Choices to tap standing in for a select: the hidden input keeps the value the rest of the form reads. A group with
  // data-empty (ประเภทงาน) can have none chosen, which keeps that word as its value.
  function setPick(groupId, value) {
    var group = field(groupId); var selected = value === undefined || value === null ? '' : String(value);
    var empty = group.getAttribute('data-empty');
    if (selected && selected !== empty && !Array.from(group.children).some(function (button) { return button.getAttribute('data-value') === selected; })) {
      // A value the draft carries but the row does not offer (2%, 20 วัน, a category of its own): its own choice, never dropped.
      var extra = document.createElement('button'); extra.type = 'button'; extra.setAttribute('role', 'radio'); extra.setAttribute('data-value', selected);
      extra.textContent = selected + (group.getAttribute('data-suffix') || '');
      var numeric = /^\d+(\.\d+)?$/.test(selected);
      var after = numeric ? Array.from(group.children).find(function (button) { return Number(button.getAttribute('data-value')) > Number(selected); }) : null;
      group.insertBefore(extra, after || null);
    }
    Array.from(group.children).forEach(function (button) { button.setAttribute('aria-checked', String(button.getAttribute('data-value') === selected)); });
    field(group.getAttribute('data-input')).value = selected;
  }
  function updateReceipt() {
    var value = Number(valueOf('job-value')) || 0;
    var rate = Number(valueOf('job-whtRate')) || 0;
    var wht = roundMoney(value * rate / 100);
    var net = roundMoney(value - wht);
    var status = valueOf('job-paymentStatus');
    var count = Number(valueOf('job-installmentCount')) || 0;
    var firstPaid = status === 'installment' && count >= 2 && field('job-installmentFirstPaid').checked;
    var received = status === 'paid' ? net : status === 'partial' ? Number(valueOf('job-receivedAmount')) || 0
      : firstPaid ? Math.floor((net / count) * 100) / 100 : 0;
    field('received-amount-field').classList.toggle('hidden', status !== 'partial');
    field('installment-field').classList.toggle('hidden', status !== 'installment');
    field('job-receivedAmount').required = status === 'partial';
    field('receipt-value').textContent = fmtCurrency(value);
    field('receipt-wht-row').classList.toggle('hidden', rate === 0);
    field('receipt-wht-row').querySelector('span').textContent = 'หัก ณ ที่จ่าย ' + rate + '%';
    field('receipt-wht').textContent = '−' + fmtCurrency(wht);
    field('receipt-net').textContent = fmtCurrency(net);
    field('receipt-received').textContent = status ? fmtCurrency(received) : 'ยังไม่เลือก';
    field('receipt-pending').textContent = status ? fmtCurrency(roundMoney(Math.max(0, net - received))) : 'ยังไม่เลือก';
    field('job-band-amount').textContent = fmtCurrency(value);
    field('job-band-who').textContent = [valueOf('job-name'), valueOf('job-client')].filter(Boolean).join(' · ') || 'กรอกชื่องาน';
  }
  function updateExpenseSummary() {
    var amount = Number(valueOf('expense-amount')) || 0;
    field('expense-summary-amount').textContent = fmtCurrency(amount);
    field('expense-summary-name').textContent = [valueOf('expense-name') || 'รายการใหม่', valueOf('expense-category')].filter(Boolean).join(' · ');
  }
  function showError(kind, message, focusId) {
    var box = field(kind + '-error-box'); box.textContent = message; box.style.display = 'block';
    if (focusId) field(focusId).focus(); else box.focus();
  }
  function clearError(kind) { field(kind + '-error-box').style.display = 'none'; }
  function validateJob() {
    if (!valueOf('job-name')) { showError('job', 'กรุณากรอกชื่องาน', 'job-name'); return false; }
    {
      var value = Number(valueOf('job-value')); var rate = Number(valueOf('job-whtRate')); var status = valueOf('job-paymentStatus');
      if (!Number.isFinite(value) || value <= 0) { showError('job', 'กรุณากรอกมูลค่างานมากกว่า 0 บาท', 'job-value'); return false; }
      if (!hasCentsPrecision(value)) { showError('job', 'มูลค่างานระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง', 'job-value'); return false; }
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) { showError('job', 'กรุณาเลือกอัตราหัก ณ ที่จ่ายให้ถูกต้อง', 'job-wht-pick'); return false; }
      if (['paid', 'partial', 'installment', 'pending'].indexOf(status) === -1) { showError('job', 'กรุณาเลือกสถานะการรับเงินก่อนยืนยัน', 'job-status-pick'); return false; }
      var parts = Number(valueOf('job-installmentCount'));
      if (status === 'installment' && !(Number.isInteger(parts) && parts >= 2 && parts <= 24)) { showError('job', 'กรุณาเลือกจำนวนงวด', 'job-installment-pick'); return false; }
      var received = Number(valueOf('job-receivedAmount')); var net = roundMoney(value - roundMoney(value * rate / 100));
      if (status === 'partial' && (!Number.isFinite(received) || received <= 0 || received >= net)) { showError('job', 'ยอดรับบางส่วนต้องมากกว่า 0 และน้อยกว่ายอดหลังหัก ณ ที่จ่าย หากรับครบแล้วให้เลือก “รับเงินครบแล้ว”', 'job-receivedAmount'); return false; }
      if (status === 'partial' && !hasCentsPrecision(received)) { showError('job', 'ยอดรับบางส่วนระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง', 'job-receivedAmount'); return false; }
    }
    {
      var credit = Number(valueOf('job-creditTerm'));
      if (!Number.isInteger(credit) || credit < 0 || credit > 3650) { showError('job', 'เครดิตเทอมต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 3,650 วัน', 'job-credit-pick'); return false; }
    }
    return true;
  }
  function jobNext() {
    if (!ready || submitting) return;
    clearError('job');
    if (validateJob()) submitJob();
  }
  // While a page opens: the app's opening logo with one line under it (owner, 2026-11-13: the logo, not a mascot).
  function showLoading(caption) {
    field('form-view').classList.add('hidden'); field('status-view').classList.add('hidden');
    field('loading-caption').textContent = caption; field('loading-view').classList.remove('hidden');
  }
  // again: a ลองอีกครั้ง button above กลับไปแชท (owner, 2026-11-13: the draft form said เปิดรายการร่างไม่ได้ when LINE
  // dropped the connection, with no way but to go back).
  function showStatus(title, message, closeButton, reaction, again) {
    field('loading-view').classList.add('hidden');
    field('form-view').classList.add('hidden');
    var view = field('status-view'); view.classList.remove('hidden'); view.replaceChildren();
    var image = document.createElement('img'); image.className = 'emoji'; image.src = mascotUrl(reaction || 'guide'); image.alt = '';
    var heading = document.createElement('h2'); heading.textContent = title;
    var paragraph = document.createElement('p'); paragraph.textContent = message; view.append(image, heading, paragraph);
    if (again) { var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'ลองอีกครั้ง'; retry.addEventListener('click', again); view.append(retry); }
    if (closeButton) { var button = document.createElement('button'); button.type = 'button'; button.textContent = 'กลับไปแชท'; if (again) button.className = 'secondary'; button.addEventListener('click', closeLiff); view.append(button); }
  }
  // A request to the server that LINE's browser dropped on the way (seen on an iPhone, 2026-11-13: the request reached
  // the server and was cut off within a second, nothing else happened) is sent again twice before the page gives up.
  // Only a dropped connection is retried; an answer from the server, even a refusal, is final.
  async function postLiff(body) {
    var waits = [500, 1500];
    for (var attempt = 0; ; attempt++) {
      try {
        return await fetch('/api/liff-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (error) {
        if (attempt >= waits.length) throw error;
        await new Promise(function (resolve) { setTimeout(resolve, waits[attempt]); });
      }
    }
  }
  window.KrarokLiffPost = postLiff;
  function closeLiff() {
    try { if (window.liff && liff.isInClient()) { liff.closeWindow(); return; } } catch (error) {}
    // A normal browser tab may refuse window.close(); leave clear instructions visible.
    showStatus('กลับไปที่แชท LINE', 'กลับไปที่แอป LINE แล้วเปิดแชทกระรอกตุนเงินได้เลยครับ', false);
    try { window.close(); } catch (error) {}
  }
  function blockDraft(message, again) {
    ready = false; draftLoaded = false;
    showStatus('เปิดรายการร่างไม่ได้', message + (again ? '' : '\nกลับไปแชทแล้วเปิดรายการล่าสุด หรือสร้างรายการใหม่อีกครั้ง'), true, 'urgent', again);
  }
  // Opening the draft again from the error screen: the logo while it loads, the same error with the button if it fails.
  function openDraftAgain() {
    showLoading('กำลังเปิดรายการ');
    var opening = draftReference.kind === 'document' && window.KrarokDocumentForm ? window.KrarokDocumentForm.open(draftReference) : loadDraft(draftReference);
    Promise.resolve(opening).catch(function () { blockDraft('ยังโหลดรายการไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', openDraftAgain); });
  }
  function appDestination(search) {
    var params = new URLSearchParams(search);
    if (params.has('openPath')) return params.get('openPath');
    var state = params.get('liff.state');
    if (state) {
      var at = state.indexOf('?');
      var nested = new URLSearchParams(at >= 0 ? state.slice(at + 1) : state.replace(/^\?/, ''));
      if (nested.has('openPath')) return nested.get('openPath');
    }
    return null;
  }
  async function openLinkedApp(destination) {
    // The logo alone, laid out as the app's own opening logo, so this page and the app read as one screen.
    showLoading('');
    var idToken = liff.getIDToken();
    if (!idToken) throw new Error('ไม่พบข้อมูลยืนยันตัวตน กรุณาเปิดใหม่จาก LINE');
    var response = await fetch('/api/line-session', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' },
      body: JSON.stringify({ idToken: idToken, destination: destination })
    });
    var result = await response.json();
    if (!response.ok) {
      // A LINE chat without an account starts one here instead of being sent to the website.
      if (result.code === 'line_not_linked' && signupOffered) { showSignup(destination); return; }
      showStatus('เปิดบัญชีไม่ได้', result.error || 'กรุณาลองเปิดใหม่จาก LINE', true, 'urgent');
      if (result.code === 'line_not_linked' || result.code === 'additional_verification_required') {
        var link = document.createElement('a'); link.href = '/login'; link.textContent = 'เข้าสู่เว็บไซต์'; link.className = 'secondary-btn'; field('status-view').append(link);
      }
      return;
    }
    var target = new URL(result.destination, window.location.origin);
    if (target.origin !== window.location.origin || target.hash) throw new Error('ปลายทางไม่ถูกต้อง');
    // The app carries on this logo instead of starting it again (boot-skeleton.js).
    try { sessionStorage.setItem('krarok:splash', String(Date.now())); } catch (error) { /* it starts again */ }
    window.location.replace(target.href);
  }
  // ใช้แบบไหน and a record tried in the chat ride in the เก็บไว้ link (services/lineTry.ts); the server checks them again.
  var launchSearch = window.location.search;
  function startExtras() {
    var found = { use: null, keep: null };
    [launchSearch, window.location.search].forEach(function (search) {
      var params = new URLSearchParams(search);
      var state = params.get('liff.state');
      if (state) { var at = state.indexOf('?'); params = new URLSearchParams(at >= 0 ? state.slice(at + 1) : state.replace(/^\?/, '')); }
      var use = params.get('use'); var keep = params.get('keep');
      if (!found.use && (use === 'personal' || use === 'business' || use === 'company')) found.use = use;
      if (!found.keep && keep && /^[A-Za-z0-9_-]{8,600}$/.test(keep)) found.keep = keep;
    });
    return found;
  }
  function startRequested(search) {
    var params = new URLSearchParams(search);
    if (params.has('start')) return true;
    var state = params.get('liff.state');
    if (!state) return false;
    var at = state.indexOf('?');
    return new URLSearchParams(at >= 0 ? state.slice(at + 1) : state.replace(/^\?/, '')).has('start');
  }
  function showSignup(destination) {
    // The website's own welcome screens (/line-start, WelcomeOnboarding mode 'line'); this tab keeps the LINE ID token
    // for an hour, and the server checks it again.
    showLoading('กำลังเปิดหน้าเริ่มใช้งาน');
    var go = function (name) {
      try {
        var extra = startExtras();
        sessionStorage.setItem('krarok_line_signup', JSON.stringify({ idToken: liff.getIDToken(), name: name || '', destination: destination || null, at: Date.now(), use: extra.use, keep: extra.keep }));
      } catch (error) { showStatus('เปิดหน้าเริ่มใช้งานไม่ได้', 'กรุณาลองเปิดใหม่จากแชท LINE', true, 'urgent'); return; }
      window.location.replace('/line-start');
    };
    try { liff.getProfile().then(function (profile) { go(profile && profile.displayName); }).catch(function () { go(''); }); }
    catch (error) { go(''); }
  }
  function connectRequested(search) {
    var params = new URLSearchParams(search);
    if (params.get('connect') === 'sheets') return true;
    var state = params.get('liff.state');
    if (!state) return false;
    var at = state.indexOf('?');
    return new URLSearchParams(at >= 0 ? state.slice(at + 1) : state.replace(/^\?/, '')).get('connect') === 'sheets';
  }
  function newSheetRequested(search) {
    var params = new URLSearchParams(search);
    if (params.get('new') === '1') return true;
    var state = params.get('liff.state');
    if (!state) return false;
    var at = state.indexOf('?');
    return new URLSearchParams(at >= 0 ? state.slice(at + 1) : state.replace(/^\?/, '')).get('new') === '1';
  }
  async function openConnect(makeNew) {
    // makeNew: สร้างชีตใหม่ให้ on the sheet offer card; the page in the browser makes the sheet instead of picking one.
    // Google refuses sign-in inside LINE: a one-use link opens the phone's own browser, already signed in.
    showLoading('กำลังเปิดเบราว์เซอร์');
    var idToken = liff.getIDToken();
    if (!idToken) throw new Error('missing id token');
    var response = await fetch('/api/line-handoff', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' },
      body: JSON.stringify(makeNew ? { idToken: idToken, purpose: 'sheets', mode: 'new' } : { idToken: idToken, purpose: 'sheets' })
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok || !result.url) {
      if (result.code === 'line_not_linked' && signupOffered) { showSignup(null); return; }
      showStatus('เปิดหน้าเชื่อมชีตไม่ได้', result.error || 'กรุณาลองใหม่จากแชท LINE', true, 'urgent');
      return;
    }
    try { liff.openWindow({ url: result.url, external: true }); }
    catch (error) { window.location.href = result.url; return; }
    showStatus('ทำต่อในเบราว์เซอร์ได้เลย', (makeNew ? 'ล็อกอิน Google แล้วกดสร้างชีต' : 'ล็อกอิน Google เลือกไฟล์ แล้วตรวจคอลัมน์') + ' เสร็จแล้วกลับมาที่แชทนี้ เลขาจะส่งการ์ดยืนยันให้\nลิงก์ใช้ได้ครั้งเดียวภายใน 5 นาที', true, 'document');
  }
  async function openStart() {
    // Someone already linked who taps เริ่มใช้งาน again is told so; a chat without an account gets the sign-up form.
    var idToken = liff.getIDToken();
    if (!idToken) throw new Error('missing id token');
    var response = await fetch('/api/line-session', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' },
      // A destination the server accepts (shared/lineDestination.ts); nothing is opened from this answer.
      body: JSON.stringify({ idToken: idToken, destination: '/app' })
    });
    var result = await response.json().catch(function () { return {}; });
    if (response.ok) { showStatus('บัญชีนี้พร้อมใช้อยู่แล้ว', 'กลับไปที่แชทแล้วพิมพ์บอกเลขาได้เลยครับ', true, 'review'); return; }
    if (result.code === 'line_not_linked') { showSignup(null); return; }
    showStatus('เปิดหน้านี้ไม่ได้', result.error || 'กรุณาลองเปิดใหม่จาก LINE', true, 'urgent');
  }
  function draftParams(search) {
    var params = new URLSearchParams(search);
    var kind = params.get('draftKind'); var key = params.get('draftKey');
    var state = params.get('liff.state');
    if ((!kind || !key) && state) {
      // Read query parameters only. Never navigate to, fetch, or execute the state URL.
      var queryAt = state.indexOf('?');
      var nested = new URLSearchParams(queryAt >= 0 ? state.slice(queryAt + 1) : state.replace(/^\?/, ''));
      kind = kind || nested.get('draftKind'); key = key || nested.get('draftKey');
    }
    if (kind === null && key === null) return null;
    if (['job', 'expense', 'document'].indexOf(kind) === -1 || !/^[a-f0-9]{16}$/i.test(key || '')) return { invalid: true };
    return { kind: kind, key: key.toLowerCase() };
  }
  function populateDraft(kind, draft) {
    document.body.classList.add('draft-mode', 'bf-mode');
    setKind(kind);
    if (kind === 'expense') {
      setValue('expense-name', draft.name); setValue('expense-amount', draft.amount); setValue('expense-note', draft.note);
      setPick('expense-category-pick', typeof draft.category === 'string' && draft.category.trim() ? draft.category.trim() : 'อื่นๆ');
      field('category-help').textContent = draft.category ? 'หมวดหมู่นี้มาจากรายการร่าง กรุณาตรวจสอบและเปลี่ยนได้ตามต้องการ' : 'ยังไม่ได้ระบุหมวดหมู่ เลือกหมวดที่เหมาะกับรายการนี้ได้เลย';
      updateExpenseSummary();
    } else {
      setValue('job-name', draft.name); setValue('job-client', draft.client); setValue('job-value', draft.value);
      setValue('job-receivedAmount', draft.receivedAmount); setValue('job-note', draft.note);
      var credit = Number(draft.creditTerm); setPick('job-credit-pick', Number.isInteger(credit) && credit >= 0 ? String(credit) : '0');
      setPick('job-type-pick', typeof draft.type === 'string' && draft.type.trim() ? draft.type.trim() : 'ยังไม่ระบุ');
      var rate = Number(draft.whtRate); setPick('job-wht-pick', Number.isFinite(rate) && rate >= 0 && rate <= 100 ? String(rate) : '0');
      var status = ['paid', 'partial', 'installment', 'pending'].indexOf(draft.paymentStatus) >= 0 ? draft.paymentStatus : '';
      setPick('job-status-pick', status);
      var parts = Number(draft.installmentCount); setPick('job-installment-pick', Number.isInteger(parts) && parts >= 2 ? String(parts) : '');
      setValue('job-installmentFirstDue', typeof draft.installmentFirstDue === 'string' ? draft.installmentFirstDue : '');
      field('job-installmentFirstPaid').checked = draft.installmentFirstPaid === true;
      field('payment-help').textContent = status ? 'สถานะจากรายการร่าง เปลี่ยนให้ตรงกับเงินที่ได้รับจริงได้' : 'รายการร่างยังไม่ระบุสถานะ กรุณาเลือกเองก่อนยืนยัน';
      updateReceipt();
    }
  }
  async function loadDraft(reference) {
    var idToken = liff.getIDToken();
    if (!idToken) { blockDraft('กรุณาเปิดรายการนี้จาก LINE เพื่อยืนยันบัญชี'); return; }
    var response = await postLiff({ action: 'load-draft', draftKind: reference.kind, draftKey: reference.key, idToken: idToken });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || data.ok !== true || data.kind !== reference.kind || !data.draft || typeof data.draft !== 'object' || Array.isArray(data.draft)) {
      // A busy or failing server can be tried again; an expired or replaced draft cannot (its card is out of date).
      blockDraft(data.error || 'รายการนี้อาจหมดอายุหรือถูกแก้ไขแล้ว', response.status >= 500 || response.status === 429 ? openDraftAgain : undefined); return;
    }
    draftLoaded = true; populateDraft(reference.kind, data.draft); ready = true;
    field('loading-view').classList.add('hidden'); field('status-view').classList.add('hidden'); field('form-view').classList.remove('hidden');
  }
  async function submitPayload(payload, button, kind) {
    if (!ready || submitting || (draftReference && !draftLoaded)) return;
    submitting = true; button.disabled = true;
    var originalText = button.textContent; button.textContent = 'กำลังบันทึก…';
    payload.requestId = submissionId;
    if (draftLoaded) { payload.action = 'confirm-draft'; payload.draftKind = draftReference.kind; payload.draftKey = draftReference.key; }
    try {
      var idToken = liff.getIDToken();
      if (!idToken) { showError(kind, 'กรุณาเปิดฟอร์มนี้จาก LINE อีกครั้งเพื่อยืนยันบัญชี'); return; }
      payload.idToken = idToken;
      var response = await fetch('/api/liff-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await response.json();
      if (!response.ok || data.ok !== true) {
        if (draftLoaded && [404, 409, 410].indexOf(response.status) >= 0) { blockDraft(data.error || 'รายการร่างนี้หมดอายุหรือถูกเปลี่ยนแล้ว'); return; }
        showError(kind, data.error || 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง'); return;
      }
      ready = false;
      var message = data.duplicate === true ? 'รายการนี้บันทึกไว้แล้ว ไม่มีการสร้างรายการซ้ำครับ' : 'รายการนี้บันทึกเข้าบัญชีแล้วครับ';
      if (data.notificationSent === true) message += '\nส่งการ์ดสรุปกลับไปในแชทแล้ว';
      else if (data.notificationSent === false) message += '\nยังส่งการ์ดเข้าแชทไม่สำเร็จ แต่ข้อมูลบันทึกแล้ว ไม่ต้องบันทึกซ้ำ';
      else message += '\nดูรายการได้ในแอปกระรอกตุนเงิน';
      // A saved job is not necessarily paid. Only show the money-received pose for an actual paid/deposit state.
      var successPose = kind === 'expense' ? 'spent' : payload.paymentStatus === 'paid' || payload.paymentStatus === 'partial' || payload.installmentFirstPaid === true ? 'received' : 'review';
      showStatus(data.duplicate === true ? 'บันทึกไว้แล้ว' : 'บันทึกสำเร็จ', message, true, successPose);
    } catch (error) {
      showError(kind, 'ยังยืนยันผลการบันทึกไม่ได้ กรุณาลองอีกครั้งจากหน้านี้ ระบบจะใช้คำขอเดิมเพื่อลดรายการซ้ำ');
    } finally { submitting = false; button.disabled = false; button.textContent = originalText; }
  }
  function submitJob() {
    var payload = { kind: 'job', name: valueOf('job-name'), client: valueOf('job-client'), type: valueOf('job-type'), value: valueOf('job-value'), whtRate: valueOf('job-whtRate'), creditTerm: valueOf('job-creditTerm'), paymentStatus: valueOf('job-paymentStatus'), note: valueOf('job-note') };
    // The server merges a saved draft. Explicitly clear a previous deposit when changing
    // payment status, rather than allowing an omitted field to retain its stale amount.
    payload.receivedAmount = payload.paymentStatus === 'partial' ? valueOf('job-receivedAmount') : 0;
    if (payload.paymentStatus === 'installment') {
      payload.installmentCount = valueOf('job-installmentCount');
      payload.installmentFirstPaid = field('job-installmentFirstPaid').checked;
      payload.installmentFirstDue = payload.installmentFirstPaid ? null : valueOf('job-installmentFirstDue') || null;
    }
    submitPayload(payload, field('job-next-btn'), 'job');
  }
  function submitExpense() {
    if (!ready || submitting) return;
    clearError('expense');
    if (!valueOf('expense-name')) { showError('expense', 'กรุณากรอกชื่อรายการ', 'expense-name'); return; }
    var amount = Number(valueOf('expense-amount'));
    if (!Number.isFinite(amount) || amount <= 0) { showError('expense', 'กรุณากรอกจำนวนเงินมากกว่า 0 บาท', 'expense-amount'); return; }
    if (!hasCentsPrecision(amount)) { showError('expense', 'จำนวนเงินระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง', 'expense-amount'); return; }
    submitPayload({ kind: 'expense', name: valueOf('expense-name'), category: valueOf('expense-category'), amount: valueOf('expense-amount'), note: valueOf('expense-note') }, field('expense-submit-btn'), 'expense');
  }

  ['job-value', 'job-whtRate', 'job-receivedAmount', 'job-paymentStatus', 'job-name'].forEach(function (id) { field(id).addEventListener('input', updateReceipt); field(id).addEventListener('change', updateReceipt); });
  ['expense-name', 'expense-amount'].forEach(function (id) { field(id).addEventListener('input', updateExpenseSummary); });
  field('job-installmentFirstPaid').addEventListener('change', updateReceipt);
  ['job-wht-pick', 'job-status-pick', 'job-installment-pick', 'job-type-pick', 'job-credit-pick', 'expense-category-pick'].forEach(function (id) {
    var group = field(id); var kind = id.indexOf('expense') === 0 ? 'expense' : 'job';
    group.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-value]'); if (!button || !ready || submitting) return;
      var empty = group.getAttribute('data-empty');
      // Tapping the chosen type again leaves it unchosen.
      var next = empty && button.getAttribute('aria-checked') === 'true' ? empty : button.getAttribute('data-value');
      setPick(id, next); clearError(kind); updateReceipt(); updateExpenseSummary();
    });
  });
  document.querySelectorAll('[data-close]').forEach(function (button) { button.addEventListener('click', closeLiff); });
  field('job-next-btn').addEventListener('click', jobNext); field('expense-submit-btn').addEventListener('click', submitExpense); field('return-chat-btn').addEventListener('click', closeLiff);
  setPick('job-wht-pick', '0'); setPick('job-status-pick', ''); setPick('job-installment-pick', ''); setPick('job-type-pick', 'ยังไม่ระบุ'); setPick('job-credit-pick', '0'); setPick('expense-category-pick', 'อื่นๆ');
  updateReceipt(); updateExpenseSummary();

  (function splash() {
    // The opening logo as the app shows it: dark when the app is dark, the name once its typeface is in.
    var view = field('loading-view');
    try { if (localStorage.getItem('cashflow_dark_mode') === 'true') view.classList.add('dark'); } catch (error) {}
    // On screen moments ago in this tab (the app before this page): carry on as it ends, never the entrance again.
    try {
      var last = Number(sessionStorage.getItem('krarok:splash')) || 0;
      if (last && Date.now() - last < 20000) view.classList.add('is-settled', 'has-name');
      sessionStorage.setItem('krarok:splash', String(Date.now()));
    } catch (error) { /* it plays as usual */ }
    var named = false;
    var name = function () { if (!named) { named = true; view.classList.add('has-name'); } };
    if (document.fonts && document.fonts.load) document.fonts.load('600 24px Prompt', 'กระรอกตุนเงิน').then(name, name);
    setTimeout(name, 1400);
  })();
  // LINE opens this page with what to do in liff.state ("?openPath=/app"), and liff.init() then loads the page a second
  // time at that address: the opening logo came up three times on the way into the app (owner, 2026-11-14: "หน้าโหลด
  // 3 ชั้น ... ทำแค่หน้าเดียวไม่ได้เหรอ"). The query is ours, so it is put on this address first (LINE's sign-in data in the
  // # stays as it is) and LIFF has nothing left to load again. A liff.state with a path of its own is left to LIFF.
  function foldLiffState() {
    var params = new URLSearchParams(window.location.search);
    var state = params.get('liff.state');
    if (!state || !window.history || !window.history.replaceState) return;
    var at = state.indexOf('?');
    var path = at >= 0 ? state.slice(0, at) : (state.charAt(0) === '?' ? '' : state);
    if (path && path !== '/') return;
    params.delete('liff.state');
    new URLSearchParams(at >= 0 ? state.slice(at + 1) : '').forEach(function (value, key) { if (!params.has(key)) params.set(key, value); });
    var query = params.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
  }
  (async function init() {
    foldLiffState();
    // LIFF can rewrite its redirect query during init. Keep the original only as a fallback;
    // all values are identifiers, and are verified against the signed-in owner by the API.
    var originalSearch = window.location.search;
    try {
      var configResponse = await fetch('/api/liff-config'); var config = await configResponse.json();
      if (!configResponse.ok || !config.liffId || !window.liff) { showStatus('ยังไม่พร้อมใช้งาน', 'ลองเปิดฟอร์มใหม่จากแชท LINE อีกครั้งครับ', true, 'urgent'); return; }
      signupOffered = config.signup === true;
      await liff.init({ liffId: config.liffId });
      if (!liff.isLoggedIn()) { if (!liff.isInClient()) { liff.login(); return; } showStatus('ยืนยันบัญชีไม่ได้', 'กรุณาเปิดฟอร์มใหม่จากแชท LINE อีกครั้งครับ', true, 'urgent'); return; }
      // Back from /line-start after signing up: close the window, the welcome card is already in the chat.
      if (new URLSearchParams(originalSearch).has('done')) { showStatus('พร้อมแล้วครับ', 'กลับไปที่แชทแล้วพิมพ์บอกเลขาได้เลย เช่น “ค่ากาแฟ 60”', true, 'review'); closeLiff(); return; }
      if (signupOffered && (startRequested(window.location.search) || startRequested(originalSearch))) { await openStart(); return; }
      if (connectRequested(window.location.search) || connectRequested(originalSearch)) { await openConnect(newSheetRequested(window.location.search) || newSheetRequested(originalSearch)); return; }
      var openPath = appDestination(window.location.search);
      if (openPath === null) openPath = appDestination(originalSearch);
      if (openPath !== null) { await openLinkedApp(openPath); return; }
      draftReference = draftParams(window.location.search) || draftParams(originalSearch);
      if (draftReference && draftReference.invalid) { blockDraft('ลิงก์รายการร่างไม่ถูกต้อง'); return; }
      // A quotation or invoice draft has its own form (liff-document.js).
      if (draftReference && draftReference.kind === 'document' && window.KrarokDocumentForm) { await window.KrarokDocumentForm.open(draftReference); return; }
      if (draftReference) { await loadDraft(draftReference); return; }
      // Old rich-menu links now use the real app form after the same verified LINE sign-in.
      await openLinkedApp('/jobs?openAddJob=1');
    } catch (error) {
      if (draftReference && !draftReference.invalid) blockDraft('โหลดรายการไม่สำเร็จ การเชื่อมต่อหลุดระหว่างเปิด', openDraftAgain);
      else if (draftReference) blockDraft('โหลดรายการร่างไม่สำเร็จ กรุณาลองเปิดรายการจากแชทอีกครั้ง');
      else showStatus('เปิดฟอร์มไม่สำเร็จ', 'ลองเปิดใหม่จากปุ่มในแชท LINE อีกครั้งครับ', true, 'urgent');
    }
  })();
})();
