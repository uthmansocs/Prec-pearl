import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1600, // increase warning threshold (in KB)
    outDir: "dist", // ensure proper build output folder
    sourcemap: false, // disable sourcemaps in production (optional)
    rollupOptions: {
      output: {
        manualChunks: undefined, // allow automatic chunking
      },
    },
  },
});
