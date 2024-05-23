// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  app: {
    head: {
      charset: "utf-16",
      viewport:
        "width=device-width, initial-scale=1, height=device-height, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
      title: "FeedWatcher",
      meta: [
        { name: "description", content: "FeedWatcher" },
        { name: "theme-color", content: "#212121" },
      ],
      link: [
        { rel: "icon", href: "/icon.png" },
        { rel: "stylesheet", href: "/styles.css" },
        { rel: "stylesheet", href: "https://unpkg.com/@picocss/pico@latest/css/pico.min.css" },
        { rel: "stylesheet", href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.3/font/bootstrap-icons.css" },
      ],
    },
  },
  modules: ["@pinia/nuxt", "@vite-pwa/nuxt"],
  imports: {
    dirs: ["./stores"],
  },
  pinia: {
    autoImports: ["defineStore", "acceptHMRUpdate"],
  },
  pwa: {
    // PWA options
    manifest: {
      name: "FeedWatcher",
      short_name: "FeedWatcher",
      lang: "en-US",
      start_url: "/sources",
      display: "standalone",
      background_color: "#12191f",
      theme_color: "#12191f",
      icons: [
        {
          src: "images/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    },
  },
});
