<template>
  <nav>
    <ul class="menu-links">
      <li>
        <NuxtLink to="/"><strong>FeedWatcher</strong></NuxtLink>
      </li>
    </ul>
    <ul class="menu-links">
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink to="/sources"><i class="bi bi-rss-fill"></i></NuxtLink>
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink to="/bookmarks"><i class="bi bi-bookmark-check-fill"></i></NuxtLink>
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink to="/rules"><i class="bi bi-robot"></i></NuxtLink>
      </li>
      <li>
        <NuxtLink to="/users"><i class="bi bi-person-circle"></i></NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { AuthService } from "~~/services/AuthService";
const authenticationStore = AuthenticationStore();
</script>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";

export default {
  async created() {
    if (await AuthenticationStore().ensureAuthenticated()) {
      setTimeout(async () => {
        // Renew session tocken
        axios
          .post(`${(await Config.get()).SERVER_URL}/users/session`, {}, await AuthService.getAuthHeader())
          .then((res) => {
            AuthService.saveToken(res.data.token);
          });
      }, 10000);
    }
    UserProcessorInfoStore().check();
  },
};
</script>

<style scoped>
.menu-links li {
  padding-right: 1em;
  font-size: 1.2em;
}
</style>
