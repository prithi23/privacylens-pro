import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extensionTarget } from '../apps/extension/config/target.ts';
const env = { ...process.env, EXTENSION_TARGET: 'production' };
extensionTarget(env); // Validate before creating or overwriting any artifact.
const root = fileURLToPath(new URL('../', import.meta.url));
const built = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'run', 'build', '-w', '@privacylens/extension'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true },
);
if (built.status !== 0) process.exit(built.status ?? 1);
const verified = spawnSync(
  process.execPath,
  ['scripts/verify-extension.mjs', '--production'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true },
);
process.exitCode = verified.status ?? 1;
