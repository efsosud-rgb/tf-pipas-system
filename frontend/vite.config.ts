import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Em desenvolvimento a interface roda no Vite (porta 5173) e a API no servidor
// do TF Pipas (porta 4747). No programa da loja, o servidor entrega o "dist".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:4747", changeOrigin: true } },
  },
  build: {
    target: "es2022",
    // Imagens pequenas viram data: URI; as da capa ficam em arquivo próprio.
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900,
  },
});
