import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const esbuild = {
  tsconfigRaw: {
    compilerOptions: {
      jsx: "react-jsx",
      target: "ES2022",
      useDefineForClassFields: true
    }
  }
};

export default defineConfig({
  root: projectRoot,
  envDir: projectRoot,
  cacheDir: path.resolve(projectRoot, "node_modules/.vite-renderer"),
  esbuild,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src")
    }
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true
  }
});
