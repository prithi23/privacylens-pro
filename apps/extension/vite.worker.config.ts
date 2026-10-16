import { defineConfig } from 'vite';
import { extensionTarget } from './config/target.ts';
const target = extensionTarget(process.env);
export default defineConfig({
  define: { __PRIVACYLENS_SYNC_TARGET__: JSON.stringify(target) },
  publicDir: false,
  build: {
    target: 'chrome120',
    emptyOutDir: false,
    outDir: target.outDir,
    lib: {
      entry: 'src/background/index.ts',
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
});
