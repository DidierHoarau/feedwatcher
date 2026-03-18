<template>
  <div class="page">
    <Loading v-if="loading" />
    <div v-if="!summary && recentItems.length > 0" class="summary-section">
      <h2>Posts from the last 24h</h2>
      <div class="summary-items">
        <div class="items-actions">
          <span>{{ displayedRecentItems.length }} posts</span>
          <span class="items-actions-icons">
            <i
              v-if="displayedRecentItems.length > 0"
              v-on:click="markAllRead(displayedRecentItems)"
              class="bi bi-archive"
              title="Mark all as read"
            ></i>
            <i
              v-if="recentShowUnreadOnly"
              v-on:click="toggleFilter('recent')"
              class="bi bi-envelope"
              title="Show all"
            ></i>
            <i
              v-else
              v-on:click="toggleFilter('recent')"
              class="bi bi-envelope-open"
              title="Show unread only"
            ></i>
          </span>
        </div>
        <div class="summary-items-list">
          <div
            class="summary-items-list-item-container"
            v-for="sourceItem in displayedRecentItems"
            v-bind:key="sourceItem.id"
          >
            <LazySourceItem
              class="fade-in-fast summary-items-list-item"
              :item="sourceItem"
            />
          </div>
        </div>
        <div
          v-if="displayedRecentItems.length > 0"
          class="items-mark-read-bottom"
        >
          <button v-on:click="markAllRead(displayedRecentItems)">
            <i class="bi bi-archive"></i> Mark all as read
          </button>
        </div>
      </div>
    </div>

    <div v-if="summary" class="summary-section">
      <div v-if="newItems.length > 0" class="summary-items">
        <div class="items-actions">
          <span>{{ newItems.length }} recent posts</span>
          <span class="items-actions-icons">
            <i
              v-if="displayedNewItems.length > 0"
              v-on:click="markAllRead(displayedNewItems)"
              class="bi bi-archive"
              title="Mark all as read"
            ></i>
            <i
              v-if="newShowUnreadOnly"
              v-on:click="toggleFilter('new')"
              class="bi bi-envelope"
              title="Show all"
            ></i>
            <i
              v-else
              v-on:click="toggleFilter('new')"
              class="bi bi-envelope-open"
              title="Show unread only"
            ></i>
          </span>
        </div>
        <div class="summary-items-list">
          <div
            class="summary-items-list-item-container"
            v-for="sourceItem in displayedNewItems"
            v-bind:key="sourceItem.id"
          >
            <LazySourceItem
              class="fade-in-fast summary-items-list-item"
              :item="sourceItem"
            />
          </div>
        </div>
        <div v-if="displayedNewItems.length > 0" class="items-mark-read-bottom">
          <button v-on:click="markAllRead(displayedNewItems)">
            <i class="bi bi-archive"></i> Mark all as read
          </button>
        </div>
      </div>

      <h2>News Summary</h2>
      <div class="summary-content">
        <div
          v-if="summary.summary"
          class="summary-text"
          v-html="formattedSummary"
        ></div>
      </div>

      <div v-if="summaryItems.length > 0" class="summary-items">
        <div class="items-actions">
          <span>{{ summaryItems.length }} posts from the 24h before</span>
          <span class="items-actions-icons">
            <i
              v-if="displayedSummaryItems.length > 0"
              v-on:click="markAllRead(displayedSummaryItems)"
              class="bi bi-archive"
              title="Mark all as read"
            ></i>
            <i
              v-if="summaryShowUnreadOnly"
              v-on:click="toggleFilter('summary')"
              class="bi bi-envelope"
              title="Show all"
            ></i>
            <i
              v-else
              v-on:click="toggleFilter('summary')"
              class="bi bi-envelope-open"
              title="Show unread only"
            ></i>
          </span>
        </div>
        <div class="summary-items-list">
          <div
            class="summary-items-list-item-container"
            v-for="sourceItem in displayedSummaryItems"
            v-bind:key="sourceItem.id"
          >
            <LazySourceItem
              class="fade-in-fast summary-items-list-item"
              :item="sourceItem"
            />
          </div>
        </div>
        <div
          v-if="displayedSummaryItems.length > 0"
          class="items-mark-read-bottom"
        >
          <button v-on:click="markAllRead(displayedSummaryItems)">
            <i class="bi bi-archive"></i> Mark all as read
          </button>
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
      displayedRecentItems: [],
      displayedNewItems: [],
      displayedSummaryItems: [],
      recentShowUnreadOnly: true,
      newShowUnreadOnly: true,
      summaryShowUnreadOnly: true,
      loading: false,
    };
  },
  computed: {
    formattedSummary() {
      if (!this.summary?.summary) return "";
      return marked(this.summary.summary);
    },
  },
  methods: {
    rebuildDisplayed(listName) {
      const sourceMap = {
        recent: "recentItems",
        new: "newItems",
        summary: "summaryItems",
      };
      const displayMap = {
        recent: "displayedRecentItems",
        new: "displayedNewItems",
        summary: "displayedSummaryItems",
      };
      const filterMap = {
        recent: "recentShowUnreadOnly",
        new: "newShowUnreadOnly",
        summary: "summaryShowUnreadOnly",
      };
      const source = this[sourceMap[listName]];
      if (this[filterMap[listName]]) {
        this[displayMap[listName]] = source.filter(
          (item) => item.status === "unread",
        );
      } else {
        this[displayMap[listName]] = [...source];
      }
    },
    toggleFilter(listName) {
      const filterMap = {
        recent: "recentShowUnreadOnly",
        new: "newShowUnreadOnly",
        summary: "summaryShowUnreadOnly",
      };
      this[filterMap[listName]] = !this[filterMap[listName]];
      this.rebuildDisplayed(listName);
    },
    async markAllRead(items) {
      if (!items || items.length === 0) return;
      let confirmed = false;
      if (items.length > 1) {
        confirmed = confirm("Mark all items as read?");
      } else {
        confirmed = true;
      }
      if (confirmed) {
        const headers = await AuthService.getAuthHeader();
        const itemIds = items.map((item) => item.id);
        try {
          await axios.put(
            `${(await Config.get()).SERVER_URL}/items/status`,
            { status: "read", itemIds },
            headers,
          );
          for (const item of items) {
            item.status = "read";
          }
        } catch (error) {
          console.error("Failed to mark items as read", error);
        }
      }
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
      this.loading = true;
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
        // Build initial displayed lists (snapshot of unread)
        this.rebuildDisplayed("recent");
        this.rebuildDisplayed("new");
        this.rebuildDisplayed("summary");
      } catch (error) {
        console.error("Failed to fetch recent items", error);
      }
      this.loading = false;
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
.items-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5em;
}
.items-actions-icons {
  font-size: 1.1em;
}
.items-actions-icons i {
  cursor: pointer;
  margin-left: 0.6em;
  opacity: 0.7;
}
.items-actions-icons i:hover {
  opacity: 1;
}
.items-mark-read-bottom {
  margin-top: 0.8em;
  text-align: center;
}
.items-mark-read-bottom button {
  cursor: pointer;
  padding: 0.4em 1em;
  font-size: 0.85em;
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
