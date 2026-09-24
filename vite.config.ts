import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  clearScreen: false,
  publicDir: process.env.TAURI_ENV_PLATFORM === undefined ? "data" : false,
  optimizeDeps: {
    include: ["@tauri-apps/api/core"],
    exclude: ["kaizen-ui"]
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/dist/**", "**/data/**"] }
  },
  build: {
    outDir: "src-tauri/dist",
    emptyOutDir: true,
    target: "esnext"
  },
  define: { "import.meta.vitest": "undefined" },
  test: {
    environment: "node",
    includeSource: ["src/**/*.ts", "tools/**/*.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "vendor/**", "tests/e2e/**"]
  }
});
