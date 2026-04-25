import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const nodeBuiltins = [...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)];
const external = ["electron", ...nodeBuiltins];
const esbuild = {
  tsconfigRaw: {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true
    }
  }
};

export default defineConfig({
  root: projectRoot,
  envDir: projectRoot,
  cacheDir: path.resolve(projectRoot, "node_modules/.vite-electron"),
  esbuild,
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src")
    }
  },
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    target: "node20",
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        main: path.resolve(projectRoot, "src/main/main.ts"),
        preload: path.resolve(projectRoot, "src/preload/index.ts")
      },
      formats: ["cjs"],
      fileName: (_format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      external,
      output: {
        entryFileNames: "[name].js"
      }
    }
  }
});
