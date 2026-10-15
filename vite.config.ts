import { defineConfig } from 'vite';

export default defineConfig({
  // Box2D resolves its WASM next to its JS module. Prebundling relocates only
  // the JS into .vite/deps, leaving the binary URL pointing at a missing file.
  optimizeDeps: { exclude: ['box2d-wasm'] },
  server: { host: 'localhost', port: 5173, strictPort: true },
  preview: { host: 'localhost', port: 4173, strictPort: true },
});
