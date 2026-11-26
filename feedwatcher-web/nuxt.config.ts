import { fileURLToPath } from "node:url";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  // common-web is consumed as raw .vue/.ts sources (not as a Nuxt layer, so its
  // global CSS does not leak here). Map the package to its installed directory
  // so both Vite and the generated tsconfig resolve the raw subpath imports.
  alias: {
    "@devopsplaybook.io/common-web": fileURLToPath(
      new URL("./node_modules/@devopsplaybook.io/common-web", import.meta.url),
    ),
  },
  // Raw sources must go through Vite's transform pipeline and stay out of
  // pre-bundling.
  build: {
    transpile: ["@devopsplaybook.io/common-web"],
  },
  vite: {
    build: {
      // lightningcss minifier fails on bootstrap-icons CSS
      cssMinify: "esbuild",
    },
    optimizeDeps: {
      exclude: ["@devopsplaybook.io/common-web"],
    },
  },
  app: {
    head: {
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1.0",
      title: "FeedWatcher",
      meta: [
        { name: "description", content: "FeedWatcher - RSS feed reader" },
        { name: "theme-color", content: "#1976d2" },
      ],
      link: [
        { rel: "icon", href: "/icon.png" },
        { rel: "apple-touch-icon", href: "/images/icon-512.png" },
        { rel: "stylesheet", href: "/styles.css" },
        { rel: "manifest", href: "/manifest.json" },
      ],
    },
  },
  css: ["~/assets/css/main.css"],
  modules: ["@pinia/nuxt"],
  imports: {
    dirs: ["./stores"],
  },
  pinia: {
    autoImports: ["defineStore", "acceptHMRUpdate"],
  },
});
