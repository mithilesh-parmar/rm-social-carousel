/**
 * Hand-authored Plantago ovata (psyllium) line illustration — the botanical
 * accent for covers. Drawn in-house so there's no licensing question and the
 * stroke language matches the icon set (thin, round-capped, currentColor).
 * Anatomy matters here: slender leafless flower stems each topped with a
 * dense ovoid spike, and narrow grass-like basal leaves — this is a psyllium
 * plant, not a generic leaf motif (which the brand book forbids).
 *
 * Tinted via CSS `color` on the wrapping element; keep it quiet (opacity
 * 0.15-0.25) — it's a document engraving accent, not a hero graphic.
 */
export const BOTANICAL_SVG = `
<svg viewBox="0 0 220 300" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <!-- basal leaves: narrow, grass-like blades -->
  <path d="M110 292 C 74 274, 40 240, 30 186" />
  <path d="M110 292 C 88 268, 66 236, 62 190" />
  <path d="M110 292 C 132 266, 156 238, 166 192" />
  <path d="M110 292 C 148 272, 182 242, 192 196" />
  <path d="M110 292 C 104 258, 98 232, 98 204" />
  <!-- flower stems -->
  <path d="M106 290 C 104 220, 100 170, 96 118" />
  <path d="M116 290 C 124 226, 136 178, 144 132" />
  <path d="M98 290 C 88 236, 76 196, 68 160" />
  <!-- spikes: dense ovoid heads with floret ticks -->
  <g>
    <path d="M96 118 C 88 108, 86 88, 92 74 C 96 64, 104 64, 108 74 C 114 88, 112 108, 104 118 C 101 121, 99 121, 96 118 Z" />
    <path d="M92 84 h16 M90 94 h18 M92 104 h16 M96 112 h10" stroke-width="1.1" />
  </g>
  <g>
    <path d="M144 132 C 138 124, 136 108, 141 96 C 144 88, 151 88, 154 96 C 159 108, 157 124, 151 132 C 148 135, 147 135, 144 132 Z" />
    <path d="M140 104 h14 M139 113 h16 M141 122 h13" stroke-width="1.1" />
  </g>
  <g>
    <path d="M68 160 C 63 153, 61 140, 65 130 C 68 123, 74 123, 77 130 C 81 140, 79 153, 74 160 C 72 163, 70 163, 68 160 Z" />
    <path d="M64 136 h12 M63 144 h14 M65 152 h11" stroke-width="1.1" />
  </g>
  <!-- loose seeds at the base -->
  <ellipse cx="52" cy="282" rx="5" ry="3" transform="rotate(-24 52 282)" />
  <ellipse cx="166" cy="284" rx="5" ry="3" transform="rotate(18 166 284)" />
  <ellipse cx="182" cy="272" rx="4.4" ry="2.6" transform="rotate(-12 182 272)" />
</svg>
`.trim();
