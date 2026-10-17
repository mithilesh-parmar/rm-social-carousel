#!/usr/bin/env node
// Thin hook into the Python video module (video/rmvideo). Everything after `video`
// is passed through, e.g.  video build video/scripts/*.yaml --langs en,hi
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = process.env.PYTHON || 'python3';
const r = spawnSync(py, [path.join(root, 'video', 'run.py'), ...process.argv.slice(2)], { stdio: 'inherit' });
if (r.error) {
  console.error(`Could not start ${py}: ${r.error.message}. Install Python 3.10+ and: pip install -r video/requirements.txt`);
  process.exit(1);
}
process.exit(r.status ?? 1);
