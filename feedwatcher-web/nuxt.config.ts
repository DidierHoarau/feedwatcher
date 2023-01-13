// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      charset: "utf-16",
      viewport: "width=500, initial-scale=1",
      title: "FeedWatcher",
      meta: [{ name: "description", content: "FeedWatcher" }],
      link: [{ rel: "stylesheet", href: "/styles.css" }],
    },
  },
});
