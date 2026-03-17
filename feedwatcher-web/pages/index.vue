<template>
  <div class="page">
    <div v-if="summary" class="summary-section">
      <h2>News Summary</h2>
      <div class="summary-content">
        <p class="summary-meta">
          {{ summary.itemCount }} items in the last 24h
        </p>
        <p v-if="summary.generatedAt" class="summary-meta">
          Generated: {{ new Date(summary.generatedAt).toLocaleString() }}
        </p>
        <div
          v-if="summary.summary"
          class="summary-text"
          v-html="formattedSummary"
        ></div>
        <p v-else class="summary-text">No summary available yet.</p>
      </div>
    </div>
    <p>FeedReader: Follow your favorite online resources.</p>
    <p>These are the types of URLs that you can follow on this server:</p>
    <div class="processor-info-list">
      <div
        class="processor-info-layout"
        v-for="processorInfo in processorInfos"
        v-bind:key="processorInfo.title"
      >
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
    </div>
  </div>
</template>

<script>
import axios from "axios";
import { marked } from "marked";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService.ts";

export default {
  data() {
    return {
      processorInfos: [],
      summary: null,
    };
  },
  computed: {
    formattedSummary() {
      if (!this.summary?.summary) return "";
      return marked(this.summary.summary);
    },
  },
  async created() {
    await axios
      .get(`${(await Config.get()).SERVER_URL}/processors`)
      .then((res) => {
        const catchAllProcessor = res.data.pop();
        res.data.unshift(catchAllProcessor);
        this.processorInfos = res.data;
      });
    if (await AuthService.isAuthenticated()) {
      const headers = await AuthService.getAuthHeader();
      try {
        const res = await axios.get(
          `${(await Config.get()).SERVER_URL}/summary`,
          headers,
        );
        this.summary = res.data;
      } catch (error) {
        console.error("Failed to fetch summary", error);
      }
    }
  },
};
</script>

<style scoped>
.page {
  height: 100%;
  overflow-y: auto;
}

.summary-section {
  margin-bottom: 2em;
  padding: 1em;
  border: 1px solid var(--pico-muted-border-color, #ccc);
  border-radius: 8px;
}
.summary-content {
  margin-top: 0.5em;
}
.summary-meta {
  font-size: 0.85em;
  opacity: 0.6;
  margin-bottom: 0.5em;
}
.summary-text {
  line-height: 1.6;
}
.processor-info-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20em, 1fr));
  gap: 10px;
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
}
.processor-info-description span {
  font-size: 0.8em;
  opacity: 0.5;
  word-break: break-all;
}
</style>
