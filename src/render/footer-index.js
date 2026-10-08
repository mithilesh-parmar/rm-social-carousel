// Shared across templates. Slide position/total are injected by captureSlides.js as
// window.__RMP_SLIDE_INDEX__ / __RMP_TOTAL_SLIDES__ — never authored content — so a
// deck can be any length without the Writer having to know its own position.
(function () {
  var total = window.__RMP_TOTAL_SLIDES__ || 1;
  var index = window.__RMP_SLIDE_INDEX__ || 0;
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var el = document.querySelector('.rmp-footer-slot');
  if (!el) return;
  var suffix = el.hasAttribute('data-no-suffix') ? '' : ' — RM Psyllium';
  el.textContent = pad(index + 1) + ' / ' + pad(total) + suffix;
})();
