<template>
  <article v-if="enabled" class="newsletter-repair">
    <header class="repair-header">
      <h4><i class="bi bi-wrench-adjustable"></i> Source health</h4>
      <div class="repair-actions">
        <button class="secondary" :disabled="busy" v-on:click="run(true)">
          Check sources
        </button>
        <button
          :disabled="busy || !canRepair"
          v-on:click="run(false)"
        >
          Repair now
        </button>
      </div>
    </header>

    <p class="repair-hint">
      Newsletter feed URLs change when their private token rotates. Checking
      reports the sources that can be updated to the current catalogue URL;
      repair updates them in place, keeping their items, labels and state.
      Feeds no longer offered by the newsletter are reported as orphaned and
      never deleted.
    </p>

    <div v-if="busy" class="repair-loading"><Loading /></div>

    <div v-else-if="report" class="repair-report">
      <div class="repair-summary">
        <span>{{ report.repaired.length }} repairable</span>
        <span>{{ report.orphaned.length }} orphaned</span>
        <span>{{ report.unchanged }} unchanged</span>
        <span v-if="report.unverified">{{ report.unverified }} unverified</span>
        <span v-if="!report.dryRun">Repaired {{ report.repaired.length }}</span>
      </div>

      <div v-if="report.repaired.length > 0" class="repair-group">
        <h5>{{ report.dryRun ? "Can be repaired" : "Repaired" }}</h5>
        <ul class="repair-list">
          <li v-for="entry in report.repaired" :key="entry.sourceId">
            <NuxtLink :to="'/sources/' + entry.sourceId">
              {{ entry.sourceName }}
            </NuxtLink>
            <span class="repair-feed-id">{{ entry.feedId }}</span>
          </li>
        </ul>
      </div>

      <div v-if="report.orphaned.length > 0" class="repair-group">
        <h5>Orphaned feeds</h5>
        <p class="repair-hint">
          These newsletters are no longer offered. Their sources are kept
          untouched.
        </p>
        <ul class="repair-list">
          <li v-for="entry in report.orphaned" :key="entry.sourceId">
            <NuxtLink :to="'/sources/' + entry.sourceId">
              {{ entry.sourceName }}
            </NuxtLink>
            <span class="repair-feed-id">{{ entry.feedId }}</span>
          </li>
        </ul>
      </div>

      <div
        v-if="report.repaired.length === 0 && report.orphaned.length === 0"
        class="repair-empty"
      >
        Everything is up to date.
      </div>
    </div>
  </article>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

export default {
  data() {
    return {
      enabled: false,
      busy: false,
      report: null,
    };
  },
  computed: {
    canRepair() {
      return !!(this.report && this.report.repaired.length > 0);
    },
  },
  async mounted() {
    try {
      const res = await axios.get(`${(await Config.get()).SERVER_URL}/status`);
      this.enabled = !!res.data.newsletterEnabled;
    } catch {
      this.enabled = false;
    }
  },
  methods: {
    async run(dryRun) {
      this.busy = true;
      try {
        const res = await axios.post(
          `${(await Config.get()).SERVER_URL}/sources/newsletter/repair`,
          { dryRun },
          await AuthService.getAuthHeader(),
        );
        this.report = res.data;
        if (this.report && this.report.dryRun === false) {
          EventBus.emit(EventTypes.ALERT_MESSAGE, {
            type: "info",
            text: `Repaired ${this.report.repaired.length} newsletter source(s)`,
          });
        }
      } catch (err) {
        handleError(err);
      }
      this.busy = false;
    },
  },
};
</script>

<style scoped>
.newsletter-repair {
  margin: var(--space-lg) 0 0;
}

.repair-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.repair-header h4 {
  margin: 0;
}

.repair-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.repair-actions button {
  width: auto;
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-sm);
}

.repair-hint {
  color: var(--color-text-muted);
  font-size: var(--font-sm);
}

.repair-loading {
  padding: var(--space-base) 0;
}

.repair-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  font-size: var(--font-sm);
}

.repair-group {
  margin-top: var(--space-base);
}

.repair-group h5 {
  margin: 0 0 var(--space-xs);
}

.repair-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.repair-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
}

.repair-feed-id {
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  overflow-wrap: anywhere;
}

.repair-empty {
  margin-top: var(--space-base);
  padding: var(--space-base);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: var(--font-body);
}
</style>
