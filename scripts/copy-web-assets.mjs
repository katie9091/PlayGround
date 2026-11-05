import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const webDir = resolve(root, 'www');
const assets = ['index.html', 'app.js', 'style.css'];

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });
for (const asset of assets) {
  await cp(resolve(root, asset), resolve(webDir, asset));
}
console.log(`Copied ${assets.length} web assets to ${webDir}`);
