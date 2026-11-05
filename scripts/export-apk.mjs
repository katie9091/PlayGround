import { copyFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const apk = resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
const outputDir = resolve(root, 'dist');
const output = resolve(outputDir, 'Blocksmith.apk');

const details = await stat(apk).catch(() => null);
if (!details?.isFile() || details.size === 0) {
  throw new Error(`Debug APK was not created: ${apk}`);
}

await mkdir(outputDir, { recursive: true });
await copyFile(apk, output);
console.log(`Exported ${output} (${(details.size / 1024 / 1024).toFixed(2)} MiB)`);
