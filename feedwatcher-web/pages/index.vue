<template>
  <div class="page">
    <p>FeedReader: Follow your favorite online resources.</p>
    <p>These are the types of URLs that you can follow on this server:</p>
    <div class="processor-info-layout" v-for="processorInfo in processorInfos" v-bind:key="processorInfo.title">
      <div class="processor-info-title">
        {{ processorInfo.title }}
      </div>
      <div class="processor-info-icon">
        <i :class="'bi bi-' + processorInfo.icon"></i>
      </div>
      <div class="processor-info-description">
        <span v-html="processorInfo.description"></span>
      </div>
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
  overflow-y: auto;
  height: calc(100vh - 5em);
}

.processor-info-layout {
  margin: 1em 1em;
  display: grid;
  grid-template-columns: 3em 1fr;
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
  font-size: 2em;
}
.processor-info-description {
  grid-row: 2;
  grid-column: 2;
  word-break: break-all;
}
.processor-info-description span {
  font-size: 0.8em;
  opacity: 0.5;
}
</style>
