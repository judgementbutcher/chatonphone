import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

await rm('server-dist', { recursive: true, force: true });
await execFileAsync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], {
  windowsHide: true
});
await mkdir('server-dist', { recursive: true });
await rename('server-dist/proxy.js', 'server-dist/proxy.mjs');
await copyFile('server/chatonphone-server.mjs', 'server-dist/chatonphone-server.mjs');
