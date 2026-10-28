<template>
  <div>
    <h1>Update Source: {{ source.info.url }}</h1>
    <div
      v-if="isFromNewsletter"
      class="source-newsletter-badge"
      :title="'Newsletter feed: ' + (source.info.providerFeedId || '')"
    >
      <i class="bi bi-envelope-paper"></i> From newsletter
    </div>
    <div v-if="hasHealthInfo" class="source-health-details">
      <div
        v-if="source.health && source.health !== 'ok'"
        class="source-health-status"
        :class="'source-health-' + source.health"
      >
        <i :class="healthIcon"></i>
        <span v-if="source.health === 'disabled'">
          Fetching paused automatically
          <span v-if="source.info.fetchErrorCount"
            >({{ source.info.fetchErrorCount }} consecutive errors)</span
          >
        </span>
        <span v-else-if="source.health === 'failing'">
          Fetch failing
          <span v-if="source.info.fetchErrorCount"
            >({{ source.info.fetchErrorCount }} consecutive errors)</span
          >
        </span>
        <span v-else>No new items for a long time</span>
      </div>
      <div
        v-if="source.health === 'disabled' && source.info.autoDisabledDate"
        class="source-health-line"
      >
        Paused on: {{ formatDate(source.info.autoDisabledDate) }}
      </div>
      <div
        v-if="source.info.lastFetchError"
        class="source-health-line source-health-diagnosis"
      >
        {{ diagnosisText }}
      </div>
      <div
        v-if="source.info.lastFetchError"
        class="source-health-line source-health-raw-error"
      >
        Last error: {{ source.info.lastFetchError }}
        <span v-if="source.info.lastFetchErrorDate"
          >({{ formatDate(source.info.lastFetchErrorDate) }})</span
        >
      </div>
      <div v-if="source.info.dateFetched" class="source-health-line">
        Last successful fetch: {{ formatDate(source.info.dateFetched) }}
      </div>
      <div v-if="source.info.lastItemDate" class="source-health-line">
        Last item published: {{ formatDate(source.info.lastItemDate) }}
      </div>
      <button
        v-if="source.health === 'disabled'"
        class="secondary source-health-resume"
        :disabled="resuming"
        title="Fetch this source now and resume automatic fetching"
        v-on:click="resumeFetching()"
      >
        <i class="bi bi-play-circle"></i> Resume fetching
      </button>
    </div>
    <label>Name</label>
    <input v-model="source.name" type="text" />
    <label>URL</label>
    <input v-model="source.info.url" type="text" />
    <div class="source-url-finder-block">
      <label>Find a working URL</label>
      <p class="source-finder-hint">
        Paste the site address (or search podcasts below) to discover feeds,
        then use it as the new URL for this source.
      </p>
      <SourceUrlFinder
        confirm-label="Use this URL"
        :podcast-search-enabled="podcastSearchEnabled"
        @select="onFinderSelect"
      />
    </div>
    <label>Labels</label>
    <div class="label-list">
      <kbd v-for="(label, index) of labels" :key="index">
        {{ label.name }}<i class="bi bi-x" v-on:click="removeLabel(label)"></i>
      </kbd>
      <i class="bi bi-plus-square" v-on:click="addLabel()"></i>
    </div>
    <button v-on:click="updateSource()">Update</button>
    <button ref="deleteButton" v-on:click="deleteSource()">Delete</button>
    <ConfirmPopover
      v-model="deleteConfirmOpen"
      :anchor="deleteConfirmAnchor"
      title="Delete source?"
      description="This removes the source and all its items."
      confirm-label="Delete"
      cancel-label="Cancel"
      @confirm="confirmDeleteSource"
      @cancel="deleteConfirmAnchor = null"
    />
    <LabelSelectDialog
      @onLabelSelectCancel="onLabelSelectCancel"
      @onLabelSelected="onLabelSelected"
      v-if="isSelectLabel"
    />
  </div>
</template>

<script>
import { find, findIndex } from "lodash";
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import { sourceDiagnosisText } from "~~/services/SourceHealthUI.ts";

export default {
  data() {
    return {
      source: { info: {} },
      labels: [],
      isSelectLabel: false,
      resuming: false,
      podcastSearchEnabled: false,
      deleteConfirmOpen: false,
      deleteConfirmAnchor: null,
    };
  },
  computed: {
    isFromNewsletter() {
      return (
        this.source &&
        this.source.info &&
        this.source.info.provider === "feedwatcher-newsletter"
      );
    },
    hasHealthInfo() {
      const info = this.source.info || {};
      return Boolean(
        (this.source.health && this.source.health !== "ok") ||
          info.lastFetchError ||
          info.dateFetched ||
          info.lastItemDate,
      );
    },
    diagnosisText() {
      return sourceDiagnosisText(this.source.health, this.source.info);
    },
    healthIcon() {
      if (this.source.health === "disabled") {
        return "bi bi-slash-circle";
      }
      if (this.source.health === "failing") {
        return "bi bi-exclamation-triangle-fill";
      }
      return "bi bi-hourglass-split";
    },
  },
  async created() {
    this.loadSource();
    axios
      .get(
        `${(await Config.get()).SERVER_URL}/sources/${this.$route.params.sourceId}/labels`,
        await AuthService.getAuthHeader(),
      )
      .then((res) => {
        this.labels = res.data.labels;
      })
      .catch(handleError);
    axios
      .get(`${(await Config.get()).SERVER_URL}/status`)
      .then((res) => {
        this.podcastSearchEnabled = !!res.data.podcastSearchEnabled;
      })
      .catch(() => {
        this.podcastSearchEnabled = false;
      });
  },
  methods: {
    formatDate(value) {
      return new Date(value).toLocaleString();
    },
    onFinderSelect(url) {
      this.source.info.url = url;
      EventBus.emit(EventTypes.ALERT_MESSAGE, {
        type: "info",
        text: "URL updated — click Update to apply it",
      });
    },
    async loadSource() {
      await axios
        .get(
          `${(await Config.get()).SERVER_URL}/sources/${this.$route.params.sourceId}`,
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          this.source = res.data;
        })
        .catch(handleError);
    },
    async resumeFetching() {
      this.resuming = true;
      await axios
        .put(
          `${(await Config.get()).SERVER_URL}/sources/${this.source.id}/fetch`,
          {},
          await AuthService.getAuthHeader(),
        )
        .then(() => {
          EventBus.emit(EventTypes.ALERT_MESSAGE, {
            type: "info",
            text: "Fetch started — automatic fetching resumes if it succeeds",
          });
          UserProcessorInfoStore().check();
          // The fetch runs asynchronously server-side: reload once it had a
          // chance to complete so a success clears the paused state.
          setTimeout(() => this.loadSource(), 5000);
        })
        .catch(handleError)
        .finally(() => {
          this.resuming = false;
        });
    },
    async updateSource() {
      const labels = [];
      for (const label of this.labels) {
        labels.push(label.name);
      }
      this.source.labels = labels;
      if (!this.source.name) {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Name missing",
        });
        return;
      }
      if (!this.source.info.url) {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "URL missing",
        });
        return;
      }
      await axios
        .put(
          `${(await Config.get()).SERVER_URL}/sources/${this.source.id}`,
          {
            name: this.source.name,
            labels: labels,
            url: this.source.info.url,
          },
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          EventBus.emit(EventTypes.ALERT_MESSAGE, {
            type: "info",
            text: "Source updated",
          });
          return SourcesStore().fetch();
        })
        .then(() => {
          SourcesStore().setSelectedSourceId(this.source.id);
          setTimeout(() => {
            UserProcessorInfoStore().check();
            useRouter().push({
              path: "/sources",
              query: { sourceId: this.source.id },
            });
          }, 100);
        })
        .catch(handleError);
    },
    deleteSource() {
      this.deleteConfirmAnchor = this.$refs.deleteButton;
      this.deleteConfirmOpen = true;
    },
    async confirmDeleteSource() {
      this.deleteConfirmAnchor = null;
      await axios
        .delete(
          `${(await Config.get()).SERVER_URL}/sources/${this.source.id}`,
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          EventBus.emit(EventTypes.ALERT_MESSAGE, {
            text: "Source deleted",
          });
          SourcesStore().selectedIndex = 0;
          useRouter().push({ path: "/sources" });
        })
        .catch(handleError);
    },
    async onLabelSelected(label) {
      this.isSelectLabel = false;
      if (!find(this.labels, { name: label.label })) {
        this.labels.push({ name: label.label });
      }
    },
    async onLabelSelectCancel() {
      this.isSelectLabel = false;
    },
    async removeLabel(label) {
      this.labels.splice(findIndex(this.labels, { name: label.name }), 1);
    },
    addLabel() {
      this.isSelectLabel = true;
    },
  },
};
</script>

<style scoped>
h1 {
  word-break: break-all;
}
.source-health-details {
  margin-bottom: var(--space-2xl);
  font-size: 0.9em;
  color: var(--color-text-secondary, inherit);
}
.source-newsletter-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 0 var(--space-sm);
  margin-bottom: var(--space-base);
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-primary-text);
  font-size: var(--font-sm);
  font-weight: 600;
}
.source-health-status {
  margin-bottom: var(--space-xs);
}
.source-health-disabled {
  color: var(--color-text-muted);
}
.source-health-failing {
  color: var(--color-danger);
}
.source-health-stale {
  color: var(--color-warning);
}
.source-health-line {
  margin-bottom: var(--space-2xs, 0.25rem);
}
.source-health-diagnosis {
  font-weight: 600;
  color: var(--color-text, inherit);
}
.source-health-raw-error {
  color: var(--color-text-secondary, inherit);
}
.source-url-finder-block {
  margin-bottom: var(--space-2xl);
}
.source-finder-hint {
  font-size: var(--font-sm);
  color: var(--color-text-muted, inherit);
  margin-bottom: var(--space-sm);
}
.source-health-resume {
  width: auto;
  height: 2.6rem;
  margin-top: var(--space-sm);
  padding: 0 var(--space-base);
  font-size: var(--font-sm);
}
kbd {
  margin-right: var(--space-2xl);
  margin-bottom: var(--space-base);
}
kbd i {
  margin-left: var(--space-sm);
}
.label-list {
  margin-bottom: var(--space-2xl);
}
button {
  margin-right: var(--space-base);
}
</style>
