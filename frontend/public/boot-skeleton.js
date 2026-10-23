// Shown by index.html before the app's code arrives: a signed-in user's refresh paints the app's
// skeleton instead of a blank page. React replaces it on mount. A separate file because the CSP
// allows no inline scripts.
(function () {
  try {
    var path = location.pathname;
    var dark = localStorage.getItem('cashflow_dark_mode') === 'true';
    var phone = window.matchMedia && window.matchMedia('(max-width: 743px)').matches;
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    var signedIn = localStorage.getItem('cashflow_signed_in') === '1';
    // Phones: opening the app shows the logo with a short animation instead of the skeleton
    // (owner, 2026-10-22). It sits outside #root, so React mounting does not remove it; the app
    // removes it once the page under it is ready (frontend/src/app/splash.ts).
    if (phone && (signedIn || standalone) && !/^\/(login|recover|privacy)/.test(path)) { showSplash(dark); return; }
    if (!signedIn || /^\/(login|recover|privacy)/.test(path)) return;
    var nav = '';
    for (var n = 0; n < 9; n++) nav += '<div style="display:flex;gap:12px;align-items:center;padding:10px 12px"><i style="width:20px;height:20px"></i><i style="width:' + [64, 40, 56, 56, 64, 56, 40, 56, 40][n] + 'px;height:14px"></i></div>';
    var stat = '<div class="card"><i style="width:60%;height:12px"></i><i style="width:45%;height:22px;margin-top:10px"></i></div>';
    var html = '<div class="boot' + (localStorage.getItem('cashflow_dark_mode') === 'true' ? ' dark' : '') + '" aria-busy="true">'
      + '<div class="side"><div style="display:flex;gap:10px;align-items:center;padding:0 8px;margin-bottom:28px"><i style="width:34px;height:34px;border-radius:50%"></i><i style="width:128px;height:20px"></i></div>' + nav + '</div>'
      + '<div class="main"><i style="width:220px;max-width:70%;height:30px"></i><i style="width:380px;max-width:90%;height:14px;margin-top:10px"></i>'
      + '<div class="card" style="margin-top:24px;height:84px"><i style="width:40%;height:14px"></i><i style="width:30%;height:28px;margin-top:12px"></i></div>'
      + '<div class="row">' + stat + stat + stat + stat + '</div>'
      + '<div class="card" style="margin-top:16px;height:260px"><i style="width:30%;height:16px"></i><i style="width:100%;height:190px;margin-top:20px"></i></div></div></div>';
    document.getElementById('root').innerHTML = html;
  } catch (e) { /* storage blocked: blank until the app loads */ }

  function showSplash(dark) {
    var el = document.createElement('div');
    el.id = 'app-splash';
    el.className = 'splash' + (dark ? ' dark' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'กำลังเปิดกระรอกตุนเงิน');
    el.setAttribute('data-shown-at', String(Date.now()));
    el.innerHTML = '<div class="splash-stage" aria-hidden="true"><span class="splash-glow"></span><span class="splash-ring"></span><span class="splash-ring is-late"></span>'
      + '<svg class="splash-mark" viewBox="0 0 1000 1000"><path fill="#E65F2B" fill-rule="evenodd" d="M462.2891 71.133 C634.9705 58.7986 816.0986 143.1701 886.4971 307.4335 C897.3079 332.6583 907.1436 358.7126 912.5548 385.7689 C920.9325 427.6565 923.5996 472.9793 918.867 515.5722 C905.5484 635.4416 835.3596 739.1615 746.659 816.7746 C668.3074 885.3322 565.9157 929.422 461.1561 929.422 C418.5151 929.422 358.5401 922.7653 350.4509 870.185 C349.3618 863.1059 350.0229 855.8166 351.422 848.8208 C361.2645 799.6082 414.5101 798.9129 453.8728 791.0405 C474.4152 786.932 494.9066 778.0173 512.9479 767.5722 C591.6984 721.9798 619.9668 620.2117 584.9711 538.5549 C565.5644 493.2728 518.8689 458.1077 474.2659 440.474 C407.4458 414.0567 327.7454 408.613 262.0809 441.4451 C228.6948 458.1383 197.2659 488.8157 205.4336 529.6531 C212.2983 563.9768 251.1019 578.0934 280.6937 585.4912 C296.1002 589.3431 311.9956 590.6752 327.792 591.8034 C338.9737 592.6021 350.4064 591.9653 361.6185 591.9653 C414.9505 591.9653 497.7971 591.2465 514.4045 657.6764 C516.8075 667.2878 518.5276 675.9879 518.1272 685.9999 C517.8095 693.9399 515.3149 701.5834 512.6243 708.9827 C494.0358 760.101 438.9823 761.9075 393.1792 761.9075 C375.1886 761.9075 353.6752 764.9772 336.6936 757.6995 C312.0255 747.1274 308.624 709.7501 329.7342 693.607 C341.905 684.2998 356.6295 684.2197 371.3295 684.2197 C386.7051 684.2197 402.081 684.2197 417.4566 684.2197 C429.6845 684.2197 446.2587 685.7037 455.977 676.6128 C473.0076 660.6807 453.9532 640.108 438.1733 634.37 C419.1027 627.4352 398.5829 628.3815 378.6127 628.3815 C357.4386 628.3815 336.6086 627.4621 315.4913 625.9538 C288.8679 624.0521 262.3965 620.1388 236.8324 612.3584 C167.6326 591.2977 109.5945 536.6032 88.4163 467.0173 C82.513 447.621 80 427.7057 80 407.4566 C80 276.3183 181.9107 173.2064 292.8325 117.7457 C316.3862 105.9688 340.4711 96.2803 365.6648 88.6128 C396.8589 79.1189 429.8085 73.453 462.2891 71.133 Z"/></svg></div>'
      + '<div class="splash-name" aria-hidden="true">กระรอก<em>ตุนเงิน</em></div>'
      + '<div class="splash-dots" aria-hidden="true"><i></i><i></i><i></i></div>';
    document.body.appendChild(el);
    // The wordmark waits for its own typeface (the subset the app loads too), so it never jumps.
    var font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Prompt:wght@600&text=%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B8%A3%E0%B8%AD%E0%B8%81%E0%B8%95%E0%B8%B8%E0%B8%99%E0%B9%80%E0%B8%87%E0%B8%B4%E0%B8%99&display=swap';
    document.head.appendChild(font);
    var named = false;
    var name = function () { if (!named) { named = true; el.className += ' has-name'; } };
    if (document.fonts && document.fonts.load) {
      font.onload = function () { document.fonts.load('600 24px Prompt', 'กระรอกตุนเงิน').then(name, name); };
    }
    setTimeout(name, 1400);
    // Never cover the app for long, even if its code fails to start.
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 15000);
  }
})();
