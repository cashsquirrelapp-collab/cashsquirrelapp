// Legal pages: show the language chosen in the app (cashflow_language), or ?lang=en|th, with a
// switch that also updates the app's choice. Without scripts the page stays in Thai.
(function () {
  var KEY = 'cashflow_language';
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(lang) {
    document.documentElement.lang = lang;
    var button = document.getElementById('lang-toggle');
    if (button) { button.textContent = lang === 'en' ? 'ไทย' : 'EN'; button.setAttribute('aria-label', lang === 'en' ? 'Switch to Thai' : 'เปลี่ยนเป็นภาษาอังกฤษ'); }
    var title = document.querySelector('h1 [lang="' + lang + '"]');
    if (title) document.title = title.textContent + (lang === 'en' ? ' - Krarok Tunngern' : ' - กระรอกตุนเงิน');
  }
  var query = new URLSearchParams(location.search).get('lang');
  var lang = query === 'en' || query === 'th' ? query : stored() === 'en' ? 'en' : 'th';
  apply(lang);
  // Links use #contact; the English section's heading is #contact-en.
  function jump() {
    if (location.hash !== '#contact' && location.hash !== '#contact-en') return;
    var target = document.getElementById(lang === 'en' ? 'contact-en' : 'contact');
    if (target) target.scrollIntoView();
  }
  jump();
  window.addEventListener('hashchange', jump);
  var button = document.getElementById('lang-toggle');
  if (button) button.addEventListener('click', function () {
    lang = lang === 'en' ? 'th' : 'en';
    try { localStorage.setItem(KEY, lang); } catch (e) { /* the page still switches */ }
    apply(lang);
  });
})();
