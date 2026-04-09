import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  optimizeDeps: {
    include: ["@uiw/react-md-editor", "react", "react-dom"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (
            id.match(/[\\/]node_modules[\\/]react[\\/]/) ||
            id.includes("react-dom") ||
            id.includes("react-router-dom")
          ) {
            return "vendor-react";
          }

          if (id.includes("@supabase/supabase-js")) return "vendor-supabase";
          if (id.includes("framer-motion")) return "vendor-ui";
          if (id.includes("recharts")) return "vendor-charts";

          if (
            id.includes("@uiw/react-md-editor") ||
            id.includes("@codemirror") ||
            id.includes("rehype-prism-plus") ||
            id.includes("prismjs") ||
            id.includes("refractor")
          ) {
            return "md-editor";
          }

          if (id.includes("@sentry")) return "sentry";
          if (id.includes("@tanstack")) return "query";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core", "rehype-prism-plus"],
  },
}));
