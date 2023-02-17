<template>
  <div class="page">
    <p>FeedReader: Follow your favorite online resources.</p>
    <p>These are the types of URLs that you can follow on this server:</p>
    <div class="processor-info-layout" v-for="processorInfo in processorInfos" v-bind:key="processorInfo.title">
      <div class="processor-info-title">
        <h6>{{ processorInfo.title }}</h6>
      </div>
      <div class="processor-info-icon">
        <i :class="'bi bi-' + processorInfo.icon"></i>
      </div>
      <span v-html="processorInfo.description"></span>
    </div>
    <p></p>
  </div>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";

export default {
  data() {
    return {
      processorInfos: [],
    };
  },
  async created() {
    await axios.get(`${(await Config.get()).SERVER_URL}/processors`).then((res) => {
      this.processorInfos = res.data;
    });
  },
};
</script>

<style scoped>
.page {
  overflow-y: scroll;
  height: calc(100vh - 5em);
}

.processor-info-layout {
  margin: 2em;
  display: grid;
  grid-template-columns: 5em 1fr;
  grid-template-rows: auto auto;
}
.processor-info-title {
  display: grid;
  grid-row: 1;
  grid-column: 2;
}
.processor-info-icon {
  display: grid;
  grid-column: 1;
  grid-row-start: 1;
  grid-row-end: span 2;
  font-size: 3em;
}
.processor-info-description {
  grid-row: 2;
  grid-column: 2;
}
</style>
