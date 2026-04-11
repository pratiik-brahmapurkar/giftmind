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
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("posthog-js")) return "vendor-posthog";
          if (id.includes("date-fns")) return "vendor-date";
          if (id.includes("dompurify")) return "vendor-sanitize";
          if (id.includes("marked")) return "vendor-markdown";

          if (
            id.includes("@uiw/react-md-editor")
          ) {
            return "md-editor";
          }

          if (id.includes("@codemirror")) return "md-editor-codemirror";
          if (id.includes("rehype-prism-plus")) return "md-editor-rehype";
          if (id.includes("prismjs")) return "md-editor-prism";
          if (id.includes("refractor/lang")) {
            const refractorMatch = id.match(/refractor[\\/]lang[\\/](.+)\.(js|mjs|cjs)$/);
            if (refractorMatch?.[1]) {
              return `md-editor-lang-${refractorMatch[1].replace(/[^a-z0-9_-]/gi, "-")}`;
            }
            return "md-editor-refractor-lang";
          }
          if (id.includes("refractor")) return "md-editor-refractor";

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
