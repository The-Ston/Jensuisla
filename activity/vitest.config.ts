import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: { $shared: fileURLToPath(new URL('../worker/src', import.meta.url)) },
    // Use Svelte's browser build in tests (mount() is browser-only).
    conditions: ['browser'],
  },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
});
