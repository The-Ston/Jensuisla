import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { buildDefines } from './build-info.ts';
import { licenses } from './licenses-plugin.ts';

export default defineConfig({
  plugins: [svelte(), licenses()],
  define: buildDefines(),
  resolve: {
    // Shared domain code and API types live in the worker package.
    alias: { $shared: fileURLToPath(new URL('../worker/src', import.meta.url)) },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
