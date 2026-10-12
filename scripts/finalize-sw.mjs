import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = readdirSync('dist/assets').filter(name => /\.(?:js|css)$/.test(name)).map(name => `/assets/${name}`);
const revision = createHash('sha256').update(assets.sort().join('|')).digest('hex').slice(0, 12);
const workerPath = join('dist', 'sw.js');
const source = readFileSync(workerPath, 'utf8');
if (!source.includes('__NVF_CACHE_NAME__') || !source.includes('const PRECACHE_ASSETS = [];')) {
  throw new Error('Service worker build placeholders are missing.');
}
writeFileSync(workerPath, source.replace('__NVF_CACHE_NAME__', `nvf-shell-${revision}`).replace('const PRECACHE_ASSETS = [];', `const PRECACHE_ASSETS = ${JSON.stringify(assets)};`));
console.log(`Prepared offline shell with ${assets.length} production assets.`);
