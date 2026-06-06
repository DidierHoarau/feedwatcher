// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  app: {
    head: {
      charset: "utf-16",
      viewport:
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
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
