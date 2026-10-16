import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { extensionTarget } from './config/target.ts';
import { readFileSync } from 'node:fs';
const target = extensionTarget(process.env);
export default defineConfig({
  base: './',
  define: { __PRIVACYLENS_SYNC_TARGET__: JSON.stringify(target) },
  plugins: [
    react(),
    {
      name: 'explicit-extension-target',
      generateBundle() {
        const manifest = JSON.parse(
          readFileSync(
            new URL('./public/manifest.json', import.meta.url),
            'utf8',
          ),
        );
        manifest.host_permissions = [target.hostPermission];
        manifest.content_security_policy.extension_pages = `script-src 'self'; object-src 'none'; base-uri 'none'; connect-src ${target.connectSource}; frame-src 'none'; form-action 'none'`;
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.json',
          source: JSON.stringify(manifest, null, 2) + '\n',
        });
        this.emitFile({
          type: 'asset',
          fileName: 'release-config.json',
          source:
            JSON.stringify(
              { mode: target.mode, apiOrigin: target.origin },
              null,
              2,
            ) + '\n',
        });
      },
    },
  ],
  build: { target: 'chrome120', outDir: target.outDir },
});
