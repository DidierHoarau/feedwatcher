<template>
  <nav>
    <ul class="menu-links">
      <li>
        <NuxtLink to="/"><strong>FeedWatcher</strong></NuxtLink>
      </li>
    </ul>
    <ul class="menu-links">
      <li>
        <NuxtLink to="/sources"><i class="bi bi-rss-fill"></i></NuxtLink>
      </li>
      <li>
        <NuxtLink to="/users"><i class="bi bi-person-circle"></i></NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.menu-links li {
  padding-right: 1em;
  font-size: 1.2em;
}
</style>
