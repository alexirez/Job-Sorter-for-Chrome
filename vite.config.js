import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

const isWatchMode = process.argv.includes('--watch');

export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    crx({ manifest })
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    modulePreload: false,
    rolldownOptions: {
      input: {
        offscreen: 'src/offscreen/offscreen.html',
        postings: 'postings.html'
      },
      checks: { pluginTimings: false }
    },
    watch: isWatchMode ? { exclude: ['dist/**', 'node_modules/**'] } : null
  }
});