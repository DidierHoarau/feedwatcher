<template>
  <div class="page">
    <form class="dashboard-search" v-on:submit.prevent="searchDashboard()">
      <input
        id="dashboard-search-input"
        v-model="dashboardSearch"
        type="search"
        placeholder="Search all items…"
        aria-label="Search all items"
      />
    </form>
    <Loading v-if="loading" />

    <div v-if="summary" class="summary-section">
      <h2>News Summary</h2>
      <div class="summary-content">
        <div
          v-if="summary.summary"
          class="summary-text"
          v-html="formattedSummary"
        ></div>
      </div>
    </div>

    <SourcesAttention v-if="authenticated" />

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
          <span v-html="sanitizedProcessorDescription(processorInfo)"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from "axios";
import DOMPurify from "dompurify";
import { marked } from "marked";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService.ts";

export default {
  data() {
    return {
      dashboardSearch: "",
      processorInfos: [],
      summary: null,
      loading: false,
      authenticated: false,
    };
  },
  computed: {
    formattedSummary() {
      if (!this.summary?.summary) return "";
      return DOMPurify.sanitize(marked(this.summary.summary));
    },
  },
  methods: {
    searchDashboard() {
      const pattern = this.dashboardSearch.trim();
      if (!pattern) return;
      useRouter().push({
        path: "/sources",
        query: { pattern, filterStatus: "all" },
      });
    },
    sanitizedProcessorDescription(processorInfo) {
      if (!processorInfo?.description) return "";
      return DOMPurify.sanitize(processorInfo.description);
    },
  },
  async created() {
    await axios
      .get(`${(await Config.get()).SERVER_URL}/processors`)
      .then((res) => {
        const processors = Array.isArray(res.data) ? [...res.data] : [];
        const catchAllProcessor = processors.pop();
        if (catchAllProcessor) {
          processors.unshift(catchAllProcessor);
        }
        this.processorInfos = processors;
      });
    if (await AuthService.isAuthenticated()) {
      this.authenticated = true;
      SourcesStore().fetch();
      this.loading = true;
      try {
        const res = await axios.get(
          `${(await Config.get()).SERVER_URL}/summary`,
          await AuthService.getAuthHeader(),
        );
        const summaryData = res.data;
        if (summaryData && summaryData.summary) {
          this.summary = summaryData;
        }
      } catch (error) {
        console.error("Failed to fetch summary", error);
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

.dashboard-search {
  margin-bottom: var(--space-md);
}
.dashboard-search input {
  margin-bottom: 0;
  max-width: 32em;
  width: 100%;
}

.summary-section {
  margin-bottom: var(--space-2xl);
  padding: var(--space-base);
  border: 1px solid var(--pico-muted-border-color, var(--color-border));
  border-radius: var(--radius-lg);
}
.summary-content {
  margin-top: var(--space-sm);
}
.summary-meta {
  font-size: var(--font-base);
  opacity: 0.6;
  margin-bottom: var(--space-sm);
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
  margin: var(--space-base) var(--space-base);
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
  font-size: var(--font-base);
  opacity: 0.5;
  word-break: break-all;
}
</style>
