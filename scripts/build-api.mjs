import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
await build({
  entryPoints: [path('../apps/api/src/server.ts')],
  outfile: path('../apps/api/dist/server.js'),
  bundle: true,
  packages: 'external',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  logLevel: 'info',
  plugins: [
    {
      name: 'shared-source',
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^@privacylens\/shared(?:\/(?:sync|trackers|methodology))?$/,
          },
          (args) => ({
            path: path(
              `../packages/shared/src/${args.path.includes('/shared/') ? args.path.split('/').at(-1) : 'index'}.ts`,
            ),
          }),
        );
      },
    },
  ],
});
