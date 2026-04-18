import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const workspaceEsmDeps = [
  "@edv4h/poke-mate-shared-types",
  "@edv4h/poke-mate-data-service",
  "@edv4h/poke-mate-master-data",
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceEsmDeps })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceEsmDeps })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
