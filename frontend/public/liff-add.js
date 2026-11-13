(function () {
  'use strict';
  var submissionId = crypto.randomUUID();
  var currentKind = 'job';
  var jobStep = 1;
  var ready = false;
  var submitting = false;
  var draftReference = null;
  var draftLoaded = false;
  // Sign-up inside LINE (owner, 2026-11-13): offered when the server says so (/api/liff-config signup).
  var signupOffered = false;
  var JOB_TIPS = {
    1: 'เริ่มจากชื่องานและลูกค้า แล้วเลือกประเภทงาน',
    2: 'ใส่มูลค่างานเต็ม และเลือกสถานะตามเงินที่ได้รับจริง',
    3: 'ระบุเครดิตเทอมและรายละเอียดเพิ่มเติม แล้วตรวจทานก่อนบันทึก',
  };
  var JOB_STEP_NAMES = ['รายละเอียด', 'ยอดรับเงิน', 'เงื่อนไข'];
  var field = function (id) { return document.getElementById(id); };
  var valueOf = function (id) { return field(id).value.trim(); };
  var roundMoney = function (value) { return Math.round((value + Number.EPSILON) * 100) / 100; };
  var hasCentsPrecision = function (value) { return Number.isFinite(value) && value === roundMoney(value); };

  function fmtCurrency(value) {
    return '฿' + (Number.isFinite(value) ? value : 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function setValue(id, value) { field(id).value = value === undefined || value === null ? '' : String(value); }
  function ensureOption(id, value, fallback) {
    var select = field(id);
    var selected = typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
    if (!selected) selected = fallback;
    if (!Array.from(select.options).some(function (option) { return option.value === selected; })) {
      var option = document.createElement('option'); option.value = selected; option.textContent = selected; select.append(option);
    }
    select.value = selected;
  }

  function mascotUrl(reaction) { return '/line/mascot-v6-' + reaction + '.png'; }
  function updateFormMascot(kind, reaction) {
    var pose = reaction || (kind === 'expense' ? 'spent' : draftLoaded || jobStep === 3 ? 'review' : 'working');
    field(kind + '-mascot').src = mascotUrl(pose);
  }

  function renderStepsRow() {
    var row = field('job-steps-row'); row.replaceChildren();
    for (var i = 1; i <= 3; i++) {
      var pill = document.createElement('div'); pill.className = 'step-pill ' + (i < jobStep ? 'done' : i === jobStep ? 'current' : '');
      if (i === jobStep) pill.setAttribute('aria-current', 'step');
      var dot = document.createElement('span'); dot.className = 'step-dot'; dot.textContent = i < jobStep ? '✓' : String(i);
      var label = document.createElement('span'); label.className = 'step-label'; label.textContent = JOB_STEP_NAMES[i - 1]; pill.append(dot, label); row.append(pill);
      if (i < 3) { var line = document.createElement('div'); line.className = 'step-line'; line.setAttribute('aria-hidden', 'true'); row.append(line); }
    }
  }
  function setKind(kind) {
    if (draftReference && draftLoaded && kind !== draftReference.kind) return;
    currentKind = kind;
    field('tab-income').classList.toggle('active', kind === 'job'); field('tab-income').setAttribute('aria-pressed', String(kind === 'job'));
    field('tab-expense').classList.toggle('active', kind === 'expense'); field('tab-expense').setAttribute('aria-pressed', String(kind === 'expense'));
    field('job-card').classList.toggle('hidden', kind !== 'job'); field('expense-card').classList.toggle('hidden', kind !== 'expense');
  }
  function jobStepTo(step) {
    jobStep = Math.min(3, Math.max(1, step));
    document.querySelectorAll('.step-fields[data-job-step]').forEach(function (el) { el.classList.toggle('visible', draftLoaded || Number(el.getAttribute('data-job-step')) === jobStep); });
    field('job-step-eyebrow').textContent = draftLoaded ? 'รายการจากแชท · งาน / รายรับ' : 'ขั้นตอน ' + jobStep + ' จาก 3';
    field('job-tip-text').textContent = JOB_TIPS[jobStep];
    field('job-back-btn').classList.toggle('hidden', draftLoaded || jobStep === 1);
    field('job-next-btn').textContent = draftLoaded || jobStep === 3 ? 'ยืนยันบันทึก' : 'ถัดไป';
    field('job-save-caption').classList.toggle('hidden', !draftLoaded && jobStep !== 3);
    updateFormMascot('job'); renderStepsRow(); updateReceipt();
  }
  function updateReceipt() {
    var value = Number(valueOf('job-value')) || 0;
    var rate = Number(valueOf('job-whtRate')) || 0;
    var wht = roundMoney(value * rate / 100);
    var net = roundMoney(value - wht);
    var status = valueOf('job-paymentStatus');
    var received = status === 'paid' ? net : status === 'partial' ? Number(valueOf('job-receivedAmount')) || 0 : 0;
    field('received-amount-field').classList.toggle('hidden', status !== 'partial');
    field('job-receivedAmount').required = status === 'partial';
    field('receipt-value').textContent = fmtCurrency(value);
    field('receipt-wht-row').classList.toggle('hidden', rate === 0);
    field('receipt-wht-row').querySelector('span').textContent = 'หัก ณ ที่จ่าย (' + rate + '%)';
    field('receipt-wht').textContent = '−' + fmtCurrency(wht);
    field('receipt-net').textContent = fmtCurrency(net);
    field('receipt-received').textContent = status ? fmtCurrency(received) : 'ยังไม่เลือก';
    field('receipt-pending').textContent = status ? fmtCurrency(roundMoney(Math.max(0, net - received))) : 'ยังไม่เลือก';
    field('job-summary-amount').textContent = fmtCurrency(value);
    field('job-summary-name').textContent = valueOf('job-name') || 'กรอกชื่องาน';
  }
  function updateExpenseSummary() {
    var amount = Number(valueOf('expense-amount')) || 0;
    field('expense-summary-amount').textContent = (amount > 0 ? '−' : '') + fmtCurrency(amount);
    field('expense-summary-name').textContent = valueOf('expense-name') || 'รายการใหม่';
  }
  function showError(kind, message, focusId) {
    var box = field(kind + '-error-box'); box.textContent = message; box.style.display = 'block';
    updateFormMascot(kind, 'urgent');
    if (focusId) field(focusId).focus(); else box.focus();
  }
  function clearError(kind) { field(kind + '-error-box').style.display = 'none'; updateFormMascot(kind); }
  function validateJob(step) {
    if ((!step || step === 1) && !valueOf('job-name')) { showError('job', 'กรุณากรอกชื่องาน', 'job-name'); return false; }
    if (!step || step === 2) {
      var value = Number(valueOf('job-value')); var rate = Number(valueOf('job-whtRate')); var status = valueOf('job-paymentStatus');
      if (!Number.isFinite(value) || value <= 0) { showError('job', 'กรุณากรอกมูลค่างานมากกว่า 0 บาท', 'job-value'); return false; }
      if (!hasCentsPrecision(value)) { showError('job', 'มูลค่างานระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง', 'job-value'); return false; }
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) { showError('job', 'กรุณาเลือกอัตราหัก ณ ที่จ่ายให้ถูกต้อง', 'job-whtRate'); return false; }
      if (['paid', 'partial', 'pending'].indexOf(status) === -1) { showError('job', 'กรุณาเลือกสถานะการรับเงินก่อนยืนยัน', 'job-paymentStatus'); return false; }
      var received = Number(valueOf('job-receivedAmount')); var net = roundMoney(value - roundMoney(value * rate / 100));
      if (status === 'partial' && (!Number.isFinite(received) || received <= 0 || received >= net)) { showError('job', 'ยอดรับบางส่วนต้องมากกว่า 0 และน้อยกว่ายอดหลังหัก ณ ที่จ่าย หากรับครบแล้วให้เลือก “รับเงินครบแล้ว”', 'job-receivedAmount'); return false; }
      if (status === 'partial' && !hasCentsPrecision(received)) { showError('job', 'ยอดรับบางส่วนระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง', 'job-receivedAmount'); return false; }
    }
    if (!step || step === 3) {
      var credit = Number(valueOf('job-creditTerm'));
      if (!Number.isInteger(credit) || credit < 0 || credit > 3650) { showError('job', 'เครดิตเทอมต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 3,650 วัน', 'job-creditTerm'); return false; }
    }
    return true;
  }
  function jobNext() {
    if (!ready || submitting) return;
    clearError('job');
    if (draftLoaded) { if (validateJob()) submitJob(); return; }
    if (!validateJob(jobStep)) return;
    if (jobStep < 3) { jobStepTo(jobStep + 1); return; }
    submitJob();
  }
  // While a page opens: the app's opening logo with one line under it (owner, 2026-11-13: the logo, not a mascot).
  function showLoading(caption) {
    field('form-view').classList.add('hidden'); field('status-view').classList.add('hidden');
    field('loading-caption').textContent = caption; field('loading-view').classList.remove('hidden');
  }
  function showStatus(title, message, closeButton, reaction) {
    field('loading-view').classList.add('hidden');
    field('form-view').classList.add('hidden');
    var view = field('status-view'); view.classList.remove('hidden'); view.replaceChildren();
    var image = document.createElement('img'); image.className = 'emoji'; image.src = mascotUrl(reaction || 'guide'); image.alt = '';
    var heading = document.createElement('h2'); heading.textContent = title;
    var paragraph = document.createElement('p'); paragraph.textContent = message; view.append(image, heading, paragraph);
    if (closeButton) { var button = document.createElement('button'); button.type = 'button'; button.textContent = 'กลับไปแชท'; button.addEventListener('click', closeLiff); view.append(button); }
  }
  function closeLiff() {
    try { if (window.liff && liff.isInClient()) { liff.closeWindow(); return; } } catch (error) {}
    // A normal browser tab may refuse window.close(); leave clear instructions visible.
    showStatus('กลับไปที่แชท LINE', 'กลับไปที่แอป LINE แล้วเปิดแชทกระรอกตุนเงินได้เลยครับ', false);
    try { window.close(); } catch (error) {}
  }
  function blockDraft(message) {
    ready = false; draftLoaded = false;
    showStatus('เปิดรายการร่างไม่ได้', message + '\nกลับไปแชทแล้วเปิดรายการล่าสุด หรือสร้างรายการใหม่อีกครั้ง', true, 'urgent');
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
    showLoading('กำลังเปิดบัญชีที่เชื่อมกับ LINE');
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
    document.body.classList.add('draft-mode');
    setKind(kind); field('return-chat-btn').classList.remove('hidden');
    field('tab-income').disabled = true; field('tab-expense').disabled = true;
    if (kind === 'expense') {
      field('expense-eyebrow').textContent = 'รายการจากแชท · รายจ่าย'; field('expense-title').textContent = 'ตรวจสอบและแก้ไข';
      field('expense-subtitle').textContent = 'แก้ข้อมูลด้านล่างได้เลย ก่อนยืนยันบันทึก';
      setValue('expense-name', draft.name); setValue('expense-amount', draft.amount); setValue('expense-note', draft.note);
      ensureOption('expense-category', draft.category, 'อื่นๆ');
      field('category-help').textContent = draft.category ? 'หมวดหมู่นี้มาจากรายการร่าง กรุณาตรวจสอบและเปลี่ยนได้ตามต้องการ' : 'ยังไม่ได้ระบุหมวดหมู่ เลือกหมวดที่เหมาะกับรายการนี้ได้เลย';
      updateExpenseSummary();
    } else {
      field('job-title').textContent = 'ตรวจสอบและแก้ไข'; field('job-subtitle').textContent = 'รายละเอียดทั้งหมดอยู่ด้านล่าง ตรวจยอดและสถานะก่อนบันทึก';
      field('job-summary').classList.remove('hidden');
      setValue('job-name', draft.name); setValue('job-client', draft.client); setValue('job-value', draft.value);
      setValue('job-creditTerm', draft.creditTerm == null ? 0 : draft.creditTerm); setValue('job-receivedAmount', draft.receivedAmount); setValue('job-note', draft.note);
      ensureOption('job-type', draft.type, 'ยังไม่ระบุ'); ensureOption('job-whtRate', draft.whtRate, '0');
      var status = ['paid', 'partial', 'pending'].indexOf(draft.paymentStatus) >= 0 ? draft.paymentStatus : '';
      setValue('job-paymentStatus', status);
      field('payment-help').textContent = status ? 'สถานะจากรายการร่าง เปลี่ยนให้ตรงกับเงินที่ได้รับจริงได้' : 'รายการร่างยังไม่ระบุสถานะ กรุณาเลือกเองก่อนยืนยัน';
      jobStepTo(3);
    }
  }
  async function loadDraft(reference) {
    var idToken = liff.getIDToken();
    if (!idToken) { blockDraft('กรุณาเปิดรายการนี้จาก LINE เพื่อยืนยันบัญชี'); return; }
    var response = await fetch('/api/liff-submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load-draft', draftKind: reference.kind, draftKey: reference.key, idToken: idToken }),
    });
    var data = await response.json();
    if (!response.ok || data.ok !== true || data.kind !== reference.kind || !data.draft || typeof data.draft !== 'object' || Array.isArray(data.draft)) {
      blockDraft(data.error || 'รายการนี้อาจหมดอายุหรือถูกแก้ไขแล้ว'); return;
    }
    draftLoaded = true; populateDraft(reference.kind, data.draft); ready = true;
    field('loading-view').classList.add('hidden'); field('status-view').classList.add('hidden'); field('form-view').classList.remove('hidden');
  }
  async function submitPayload(payload, button, kind) {
    if (!ready || submitting || (draftReference && !draftLoaded)) return;
    submitting = true; button.disabled = true;
    var originalText = button.textContent; button.textContent = 'กำลังบันทึก…';
    updateFormMascot(kind, 'working');
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
      var successPose = kind === 'expense' ? 'spent' : payload.paymentStatus === 'paid' || payload.paymentStatus === 'partial' ? 'received' : 'review';
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
  field('tab-income').addEventListener('click', function () { setKind('job'); }); field('tab-expense').addEventListener('click', function () { setKind('expense'); });
  field('job-back-btn').addEventListener('click', function () { clearError('job'); jobStepTo(jobStep - 1); });
  field('job-next-btn').addEventListener('click', jobNext); field('expense-submit-btn').addEventListener('click', submitExpense); field('return-chat-btn').addEventListener('click', closeLiff);
  renderStepsRow(); updateReceipt(); updateExpenseSummary();

  (function splash() {
    // The opening logo as the app shows it: dark when the app is dark, the name once its typeface is in.
    var view = field('loading-view');
    try { if (localStorage.getItem('cashflow_dark_mode') === 'true') view.classList.add('dark'); } catch (error) {}
    var named = false;
    var name = function () { if (!named) { named = true; view.classList.add('has-name'); } };
    if (document.fonts && document.fonts.load) document.fonts.load('600 24px Prompt', 'กระรอกตุนเงิน').then(name, name);
    setTimeout(name, 1400);
  })();
  (async function init() {
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
      if (draftReference) blockDraft('โหลดรายการร่างไม่สำเร็จ กรุณาลองเปิดรายการจากแชทอีกครั้ง');
      else showStatus('เปิดฟอร์มไม่สำเร็จ', 'ลองเปิดใหม่จากปุ่มในแชท LINE อีกครั้งครับ', true, 'urgent');
    }
  })();
})();
