// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      charset: "utf-16",
      viewport: "width=device-width, initial-scale=1",
      title: "FeedWatcher",
      meta: [
        { name: "description", content: "FeedWatcher" },
        { name: "theme-color", content: "#212121" },
      ],
      link: [
        { rel: "manifest", href: "/manifest.json" },
        { rel: "icon", href: "/icon.png" },
        { rel: "stylesheet", href: "/styles.css" },
        { rel: "stylesheet", href: "https://unpkg.com/@picocss/pico@latest/css/pico.min.css" },
        { rel: "stylesheet", href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.3/font/bootstrap-icons.css" },
      ],
    },
  },
  modules: ["@pinia/nuxt"],
  imports: {
    dirs: ["./stores"],
  },
  pinia: {
    autoImports: ["defineStore", "acceptHMRUpdate"],
  },
});
