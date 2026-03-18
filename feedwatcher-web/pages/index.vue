<template>
  <div class="page">
    <!-- No summary: show posts from the last 24h -->
    <div v-if="!summary && recentItems.length > 0" class="summary-section">
      <h2>Posts from the last 24h</h2>
      <div class="summary-items">
        <h3>{{ recentItems.length }} posts</h3>
        <div class="summary-items-list">
          <div
            class="summary-items-list-item-container"
            v-for="sourceItem in recentItems"
            v-bind:key="sourceItem.id"
          >
            <LazySourceItem
              class="fade-in-fast summary-items-list-item"
              :item="sourceItem"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Has summary -->
    <div v-if="summary" class="summary-section">
      <!-- Posts since the summary -->
      <div v-if="newItems.length > 0" class="summary-items">
        <h2>{{ newItems.length }} recent posts</h2>
        <div class="summary-items-list">
          <div
            class="summary-items-list-item-container"
            v-for="sourceItem in newItems"
            v-bind:key="sourceItem.id"
          >
            <LazySourceItem
              class="fade-in-fast summary-items-list-item"
              :item="sourceItem"
            />
          </div>
        </div>
      </div>

      <!-- The summary itself -->
      <h2>News Summary</h2>
      <div class="summary-content">
        <div
          v-if="summary.summary"
          class="summary-text"
          v-html="formattedSummary"
        ></div>
      </div>

      <!-- Posts from the 24h before the summary -->
      <div v-if="summaryItems.length > 0" class="summary-items">
        <h3>{{ summaryItems.length }} posts from the 24h before</h3>
        <div class="summary-items-list">
          <div
            class="summary-items-list-item-container"
            v-for="sourceItem in summaryItems"
            v-bind:key="sourceItem.id"
          >
            <LazySourceItem
              class="fade-in-fast summary-items-list-item"
              :item="sourceItem"
            />
          </div>
        </div>
      </div>
    </div>

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
      recentItems: [],
      newItems: [],
      summaryItems: [],
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

      // Fetch summary
      let summaryData = null;
      try {
        const res = await axios.get(
          `${(await Config.get()).SERVER_URL}/summary`,
          headers,
        );
        summaryData = res.data;
        if (summaryData && summaryData.summary) {
          this.summary = summaryData;
        }
      } catch (error) {
        console.error("Failed to fetch summary", error);
      }

      // Fetch items based on summary availability
      try {
        let sinceDate;
        if (this.summary && this.summary.generatedAt) {
          // Fetch items from 24h before the summary until now
          sinceDate = new Date(
            new Date(this.summary.generatedAt).getTime() - 24 * 60 * 60 * 1000,
          ).toISOString();
        } else {
          // No summary: fetch items from the last 24h
          sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        }

        const res = await axios.post(
          `${(await Config.get()).SERVER_URL}/items/search`,
          {
            searchCriteria: "all",
            page: -1,
            filterStatus: "all",
            sinceDate,
          },
          headers,
        );
        const allItems = res.data.sourceItems || [];

        if (this.summary && this.summary.generatedAt) {
          const summaryTime = new Date(this.summary.generatedAt).getTime();
          // Posts newer than the summary
          this.newItems = allItems.filter(
            (item) => new Date(item.datePublished).getTime() > summaryTime,
          );
          // Posts from the 24h before the summary
          this.summaryItems = allItems.filter(
            (item) => new Date(item.datePublished).getTime() <= summaryTime,
          );
        } else {
          // No summary: all items are recent
          this.recentItems = allItems;
        }
      } catch (error) {
        console.error("Failed to fetch recent items", error);
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
.summary-items {
  margin-top: 1.5em;
}
.summary-items h3 {
  margin-bottom: 0.5em;
}
.summary-items-list {
  display: flex;
  align-items: flex-start;
  align-content: flex-start;
  flex-wrap: wrap;
  gap: 0.6em;
}
.summary-items-list-item-container {
  flex: 1 1 20em;
  min-width: 20em;
  align-self: flex-start;
}
.summary-items-list-item-container,
.summary-items-list-item {
  margin: 0;
  padding: 0;
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
