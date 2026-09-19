<template>
  <div>
    <h1>Update Source: {{ source.info.url }}</h1>
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
      <div v-if="source.info.lastFetchError" class="source-health-line">
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
    <label>Labels</label>
    <div class="label-list">
      <kbd v-for="(label, index) of labels" :key="index">
        {{ label.name }}<i class="bi bi-x" v-on:click="removeLabel(label)"></i>
      </kbd>
      <i class="bi bi-plus-square" v-on:click="addLabel()"></i>
    </div>
    <button v-on:click="updateSource()">Update</button>
    <button v-on:click="deleteSource()">Delete</button>
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

export default {
  data() {
    return {
      source: { info: {} },
      labels: [],
      isSelectLabel: false,
      resuming: false,
    };
  },
  computed: {
    hasHealthInfo() {
      const info = this.source.info || {};
      return Boolean(
        (this.source.health && this.source.health !== "ok") ||
          info.lastFetchError ||
          info.dateFetched ||
          info.lastItemDate,
      );
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
  },
  methods: {
    formatDate(value) {
      return new Date(value).toLocaleString();
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
      if (this.source.name) {
        await axios
          .put(
            `${(await Config.get()).SERVER_URL}/sources/${this.source.id}`,
            this.source,
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
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Name missing",
        });
      }
    },
    async deleteSource() {
      if (confirm("Delete the source?") == true) {
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
      }
    },
    async onLabelSelected(label) {
      this.isSelectLabel = false;
      if (!find(this.labels, { name: label.name })) {
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
