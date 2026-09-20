  var submissionId = crypto.randomUUID();
  var currentKind = 'job';
  var jobStep = 1;
  var jobType = 'ยังไม่ระบุ';
  var jobStatus = 'paid';

  var JOB_TIPS = {
    1: 'กรอก "ชื่องาน" แล้วเลือก "ประเภทงาน" ด้านล่างได้เลยนะ เปลี่ยนทีหลังได้เสมอ',
    2: 'ใส่มูลค่าค่าจ้างเต็มก่อน แล้วเลือกสถานะการจ่ายเงินให้ตรงกับความจริง',
    3: 'เครดิตเทอมคือจำนวนวันที่ลูกค้าจะโอนเงินหลังส่งงาน ถ้าได้เงินทันทีใส่ 0 ได้เลย',
  };
  var JOB_STEP_NAMES = ['ข้อมูลดีล', 'เงินและภาษี', 'ส่งมอบงาน'];

  function fmtCurrency(n) {
    return '฿' + Math.round(n || 0).toLocaleString('th-TH');
  }

  function renderStepsRow() {
    var row = document.getElementById('job-steps-row');
    var html = '';
    for (var i = 1; i <= 3; i++) {
      var state = i < jobStep ? 'done' : (i === jobStep ? 'current' : '');
      html += '<div class="step-pill ' + state + '"><div class="step-dot">' + (i < jobStep ? '✓' : i) + '</div><span class="step-label">' + JOB_STEP_NAMES[i - 1] + '</span></div>';
      if (i < 3) html += '<div class="step-line ' + (i < jobStep ? 'done' : '') + '"></div>';
    }
    row.innerHTML = html;
  }

  function setKind(kind) {
    currentKind = kind;
    document.getElementById('tab-income').className = 'kind-tab' + (kind === 'job' ? ' active income' : '');
    document.getElementById('tab-expense').className = 'kind-tab' + (kind === 'expense' ? ' active expense' : '');
    document.getElementById('job-card').classList.toggle('hidden', kind !== 'job');
    document.getElementById('expense-card').classList.toggle('hidden', kind !== 'expense');
  }

  function jobStepTo(n) {
    jobStep = n;
    document.querySelectorAll('.step-fields[data-job-step]').forEach(function (el) {
      el.classList.toggle('visible', Number(el.getAttribute('data-job-step')) === jobStep);
    });
    document.getElementById('job-step-eyebrow').textContent = 'ขั้นตอน ' + jobStep + ' จาก 3';
    document.getElementById('job-tip-text').textContent = JOB_TIPS[jobStep];
    document.getElementById('job-back-btn').classList.toggle('hidden', jobStep === 1);
    document.getElementById('job-next-btn').textContent = jobStep === 3 ? 'บันทึกข้อมูลดีลงาน' : 'ขั้นตอนถัดไป →';
    renderStepsRow();
    updateReceipt();
  }

  function updateReceipt() {
    var value = Number(document.getElementById('job-value').value) || 0;
    var whtRate = Number(document.getElementById('job-whtRate').value) || 0;
    var whtAmount = Math.round(value * (whtRate / 100));
    var netReceivable = value - whtAmount;
    var received = jobStatus === 'paid' ? netReceivable : (jobStatus === 'partial' ? (Number(document.getElementById('job-receivedAmount').value) || 0) : 0);
    document.getElementById('receipt-value').textContent = fmtCurrency(value);
    document.getElementById('receipt-wht-row').classList.toggle('hidden', whtRate === 0);
    document.getElementById('receipt-wht-row').querySelector('span').textContent = 'หัก ณ ที่จ่าย (' + whtRate + '%)';
    document.getElementById('receipt-wht').textContent = '-' + fmtCurrency(whtAmount);
    document.getElementById('receipt-net').textContent = fmtCurrency(netReceivable);
    document.getElementById('receipt-received').textContent = fmtCurrency(received);
    document.getElementById('receipt-pending').textContent = fmtCurrency(Math.max(0, netReceivable - received));
  }

  document.getElementById('job-value').addEventListener('input', updateReceipt);
  document.getElementById('job-whtRate').addEventListener('change', updateReceipt);
  document.getElementById('job-receivedAmount').addEventListener('input', updateReceipt);

  document.querySelectorAll('#job-type-pills .pill-choice').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('#job-type-pills .pill-choice').forEach(function (p) { p.classList.remove('selected'); });
      pill.classList.add('selected');
      jobType = pill.getAttribute('data-type');
    });
  });

  document.querySelectorAll('#job-status-pills .pill-choice').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('#job-status-pills .pill-choice').forEach(function (p) { p.classList.remove('selected'); });
      pill.classList.add('selected');
      jobStatus = pill.getAttribute('data-status');
      document.getElementById('received-amount-field').classList.toggle('hidden', jobStatus !== 'partial');
      updateReceipt();
    });
  });

  function showJobError(message) {
    var box = document.getElementById('job-error-box');
    box.textContent = message;
    box.style.display = 'block';
  }

  function jobNext() {
    document.getElementById('job-error-box').style.display = 'none';
    if (jobStep === 1) {
      if (!document.getElementById('job-name').value.trim()) {
        showJobError('กรุณากรอกชื่องานครับ');
        return;
      }
      jobStepTo(2);
      return;
    }
    if (jobStep === 2) {
      if (!Number(document.getElementById('job-value').value)) {
        showJobError('กรุณากรอกมูลค่างานครับ');
        return;
      }
      jobStepTo(3);
      return;
    }
    submitJob();
  }

  function showStatus(title, message, showCloseButton) {
    document.getElementById('form-view').classList.add('hidden');
    var view = document.getElementById('status-view');
    view.classList.remove('hidden');
    view.replaceChildren();
    var img=document.createElement('img'); img.className='emoji'; img.src='/favicon.svg'; img.alt='กระรอกตุนเงิน';
    var heading=document.createElement('h2'); heading.textContent=title;
    var paragraph=document.createElement('p'); paragraph.textContent=message;
    view.append(img,heading,paragraph);
    if(showCloseButton){var button=document.createElement('button');button.textContent='ปิดหน้าต่าง';button.addEventListener('click',closeLiff);view.append(button);}
  }

  function closeLiff() {
    try {
      if (window.liff && liff.isInClient && liff.isInClient()) {
        liff.closeWindow();
        return;
      }
    } catch (e) {}
    window.close();
  }

  async function submitPayload(payload, btn, errorBoxId) {
    payload.requestId = submissionId;
    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = 'กำลังบันทึก...';
    try {
      var idToken = liff.getIDToken();
      if (!idToken) {
        document.getElementById(errorBoxId).textContent = 'ไม่พบข้อมูลยืนยันตัวตนจาก LINE กรุณาเปิดฟอร์มนี้ผ่านแอป LINE อีกครั้ง';
        document.getElementById(errorBoxId).style.display = 'block';
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      payload.idToken = idToken;
      var res = await fetch('/api/liff-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = await res.json();
      if (!res.ok) {
        document.getElementById(errorBoxId).textContent = data.error || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ';
        document.getElementById(errorBoxId).style.display = 'block';
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      submissionId = crypto.randomUUID();
      showStatus('บันทึกสำเร็จ!', 'ระบบส่งการ์ดสรุปกลับไปในแชทให้แล้วครับ', true);
    } catch (err) {
      document.getElementById(errorBoxId).textContent = 'เกิดข้อผิดพลาด ลองใหม่อีกครั้งครับ';
      document.getElementById(errorBoxId).style.display = 'block';
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function submitJob() {
    var payload = {
      kind: 'job',
      name: document.getElementById('job-name').value.trim(),
      client: document.getElementById('job-client').value.trim(),
      type: jobType,
      value: document.getElementById('job-value').value,
      whtRate: document.getElementById('job-whtRate').value,
      creditTerm: document.getElementById('job-creditTerm').value,
      paymentStatus: jobStatus,
    };
    if (jobStatus === 'partial') {
      payload.receivedAmount = document.getElementById('job-receivedAmount').value;
    }
    submitPayload(payload, document.getElementById('job-next-btn'), 'job-error-box');
  }

  function submitExpense() {
    document.getElementById('expense-error-box').style.display = 'none';
    var name = document.getElementById('expense-name').value.trim();
    var amount = document.getElementById('expense-amount').value;
    if (!name || !Number(amount)) {
      document.getElementById('expense-error-box').textContent = 'กรุณากรอกชื่อรายการและจำนวนเงินให้ครบถ้วนครับ';
      document.getElementById('expense-error-box').style.display = 'block';
      return;
    }
    var payload = {
      kind: 'expense',
      name: name,
      category: document.getElementById('expense-category').value,
      amount: amount,
    };
    submitPayload(payload, document.getElementById('expense-submit-btn'), 'expense-error-box');
  }

  document.getElementById('tab-income').addEventListener('click',function(){setKind('job');});
  document.getElementById('tab-expense').addEventListener('click',function(){setKind('expense');});
  document.getElementById('job-back-btn').addEventListener('click',function(){jobStepTo(jobStep-1);});
  document.getElementById('job-next-btn').addEventListener('click',jobNext);
  document.getElementById('expense-submit-btn').addEventListener('click',submitExpense);
  renderStepsRow();

  (async function init() {
    try {
      var configRes = await fetch('/api/liff-config');
      var config = await configRes.json();
      if (!config.liffId) {
        showStatus('ยังไม่พร้อมใช้งาน', 'ฟอร์มนี้ยังไม่ได้ตั้งค่า LIFF_ID ครับ', false);
        return;
      }
      await liff.init({ liffId: config.liffId });
      if (!liff.isLoggedIn() && !liff.isInClient()) {
        liff.login();
      }
    } catch (err) {
      showStatus('เปิดฟอร์มไม่สำเร็จ', 'ลองเปิดใหม่จากปุ่มในแชท LINE อีกครั้งครับ', false);
    }
  })();
