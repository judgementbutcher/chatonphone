import { spawn } from 'node:child_process';

const serverUrl = 'http://127.0.0.1:5173';

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    ...options
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForServer(timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(serverUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await wait(250);
  }

  throw new Error(`Timed out waiting for ${serverUrl}`);
}

async function runPlaywright() {
  const processResult = run('node', ['node_modules/playwright/cli.js', 'test']);

  return new Promise((resolve) => {
    processResult.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const server = run('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer();
    const exitCode = await runPlaywright();
    process.exitCode = exitCode;
  } finally {
    server.kill('SIGKILL');
  }
}

await main();
