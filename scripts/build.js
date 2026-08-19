import { build } from "esbuild";
import sveltePlugin from "esbuild-svelte";

await build({
  entryPoints: ["src/offscreen.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/offscreen.bundle.js",
});

await build({
  entryPoints: ["src/popup/main.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/popup.bundle.js",
  plugins: [sveltePlugin()],
});

console.log("Build complete.");