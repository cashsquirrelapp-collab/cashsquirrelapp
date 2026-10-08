// Shown by index.html before the app's code arrives: a signed-in user's refresh paints the app's
// skeleton instead of a blank page. React replaces it on mount. A separate file because the CSP
// allows no inline scripts.
(function () {
  try {
    var path = location.pathname;
    if (localStorage.getItem('cashflow_signed_in') !== '1' || /^\/(login|recover|privacy)/.test(path)) return;
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
})();
