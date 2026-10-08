import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABLER_OUTLINE_DIR = path.join(__dirname, '..', '..', 'node_modules', '@tabler', 'icons', 'icons', 'outline');

/**
 * A curated subset of Tabler's outline icon set (github.com/tabler/tabler-icons,
 * MIT licensed) — a real, professionally designed line-icon library, not
 * hand-drawn SVG paths, since icon quality is exactly the kind of asset where
 * that shows. Every icon uses stroke="currentColor", so a wrapping element's
 * `color` CSS property tints it — no per-icon color editing needed.
 *
 * Curated to the psyllium/B2B-export content domain: nature/agriculture,
 * health benefits, QA/lab, and trade/logistics. Adding an icon later means
 * adding one entry here (id -> Tabler filename) — the id is what the Planner
 * and Writer reference in content, decoupled from the underlying file name.
 */
export const ICONS = {
  leaf: 'leaf', // natural / plant-based
  wheat: 'wheat', // agricultural / crop origin
  seedling: 'seedling', // growth / farming
  heart: 'heart', // heart health / cholesterol
  droplet: 'droplet', // hydration / gel-forming / water-binding
  scale: 'scale', // weight management / measurement
  'shield-check': 'shield-check', // immunity / quality assurance
  'circle-check': 'circle-check', // verified / checklist item
  flask: 'flask', // lab testing / QA
  microscope: 'microscope', // lab analysis
  filter: 'filter', // mesh / sieve / particle size
  'file-certificate': 'file-certificate', // COA / documentation
  'building-factory': 'building-factory', // manufacturing / mill
  'truck-delivery': 'truck-delivery', // shipping / logistics
  world: 'world', // export / global trade
  package: 'package', // packaging / sample
  'test-pipe': 'test-pipe', // sample testing
  'clock-hour-4': 'clock-hour-4', // shelf-life / time
  'activity-heartbeat': 'activity-heartbeat', // metabolic / health activity
};

export const ICON_NAMES = Object.keys(ICONS);

const cache = new Map();

/** Returns the icon's inline <svg>...</svg> markup (fill/stroke driven by
 *  currentColor), read once per process and cached. Strips the hardcoded
 *  width/height attributes so the template's own CSS sizing wins. */
export function getIconSvg(name) {
  if (!ICONS[name]) {
    throw new Error(`Unknown icon "${name}". Known icons: ${ICON_NAMES.join(', ')}`);
  }
  if (cache.has(name)) return cache.get(name);

  const filePath = path.join(TABLER_OUTLINE_DIR, `${ICONS[name]}.svg`);
  let svg = fs.readFileSync(filePath, 'utf8');
  svg = svg.replace(/\s(width|height)="[^"]*"/g, '');
  cache.set(name, svg);
  return svg;
}
