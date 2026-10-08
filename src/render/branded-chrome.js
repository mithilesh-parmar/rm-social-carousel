// Shared chrome for the BRANDED template family. Slide position/total are
// injected by captureSlides.js as window vars — never authored content — so
// the same slide JSON renders at any deck length or position.
//
// Fills:
//   [data-rmp-page-index]  -> "02 / 08"
//   [data-rmp-page-count]  -> "No. 02 — 08" (serif page-count voice)
//   [data-rmp-progress]    -> per-theme indicator, chosen by the
//                             --rmp-progress-style token:
//                             serif-count | mono-bars | seed-dots
(function () {
  var total = window.__RMP_TOTAL_SLIDES__ || 1;
  var index = window.__RMP_SLIDE_INDEX__ || 0;
  var pad = function (n) { return String(n).padStart(2, '0'); };

  document.querySelectorAll('[data-rmp-page-index]').forEach(function (el) {
    el.textContent = pad(index + 1) + ' / ' + pad(total);
  });
  document.querySelectorAll('[data-rmp-page-count]').forEach(function (el) {
    el.textContent = 'No. ' + pad(index + 1) + ' — ' + pad(total);
  });

  var style = getComputedStyle(document.body).getPropertyValue('--rmp-progress-style').trim();
  document.querySelectorAll('[data-rmp-progress]').forEach(function (wrap) {
    if (style === 'mono-bars') {
      // Spec Sheet: solid rectangles, active one wide (progress bars only up
      // to 8 segments — beyond that they'd read as noise at grid size).
      var segments = Math.min(total, 8);
      for (var i = 0; i < segments; i++) {
        var bar = document.createElement('div');
        bar.className = 'rmpb-progress__bar' + (i === Math.min(index, segments - 1) ? ' rmpb-progress__bar--active' : '');
        bar.style.width = i === Math.min(index, segments - 1) ? '56px' : '26px';
        wrap.appendChild(bar);
      }
    } else if (style === 'seed-dots') {
      // Grove: seed dots, active = terracotta pill, trailing "swipe".
      var dots = Math.min(total, 8);
      for (var j = 0; j < dots; j++) {
        var dot = document.createElement('div');
        dot.className = 'rmpb-progress__dot' + (j === Math.min(index, dots - 1) ? ' rmpb-progress__dot--active' : '');
        wrap.appendChild(dot);
      }
      var cue = document.createElement('div');
      cue.className = 'rmpb-progress__cue';
      cue.textContent = 'swipe';
      cue.style.cssText = 'font-size:22px;color:var(--rmp-cover-ink-faint);margin-left:10px;';
      wrap.appendChild(cue);
    } else {
      // Mill Paper default: the serif "No. 01 — 08" page count.
      var count = document.createElement('div');
      count.className = 'rmpb-progress__count';
      count.textContent = 'No. ' + pad(index + 1) + ' — ' + pad(total);
      wrap.appendChild(count);
    }
  });
})();
