<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h4>Rules</h4>
    </div>
    <div id="sources-actions" class="actions">
      <i class="bi bi-save" v-on:click="saveRules()"></i>
    </div>
    <div id="sources-list" :class="{ 'sources-list-closed': !menuOpened }">
      <SourceList
        @onSourceSelected="onSourceSelected"
        @onRootSelected="onRootSelected"
        @onLabelSelected="onLabelSelected"
      />
    </div>
    <div id="sources-rules">
      <article>
        <header>Auto-Archive</header>
        <div
          v-for="(rule, index) of currentRule.autoRead"
          v-bind:key="index"
          class="rule-layout"
        >
          <i
            class="bi bi-trash-fill"
            v-on:click="removeAutoArchive(rule.pattern)"
          ></i>
          <div class="rule-separator"></div>
          <div>
            <label for="pattern">
              Pattern (glob pattern)
              <input type="text" v-model="rule.pattern" />
            </label>
            <label for="firstname">
              Older than (days)
              <input type="number" v-model="rule.ageDays" />
            </label>
          </div>
        </div>
        <i class="bi bi-plus-square" v-on:click="addAutoArchive()"></i>
      </article>
      <article>
        <header>Auto-Delete</header>
        <div
          v-for="(rule, index) of currentRule.autoDelete"
          v-bind:key="index"
          class="rule-layout"
        >
          <i
            class="bi bi-trash-fill"
            v-on:click="removeAutoDelete(rule.pattern)"
          ></i>
          <div class="rule-separator"></div>
          <div>
            <label for="pattern">
              Pattern (glob pattern)
              <input type="text" v-model="rule.pattern" />
            </label>
            <label for="firstname">
              Older than (days)
              <input type="number" v-model="rule.ageDays" />
            </label>
          </div>
        </div>
        <i class="bi bi-plus-square" v-on:click="addAutoDelete()"></i>
      </article>
    </div>
  </div>
</template>

<script setup>
const sourceItemsStore = SourceItemsStore();
const userProcessorInfoStore = UserProcessorInfoStore();
</script>

<script>
import axios from "axios";
import { find } from "lodash";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

export default {
  data() {
    return {
      selectedSource: "",
      menuOpened: true,
      filterStatus: "unread",
      markingUnreead: false,
      rules: { info: [] },
      currentRule: { autoDelete: [], autoRead: [] },
    };
  },
  async created() {
    if (!(await AuthenticationStore().ensureAuthenticated())) {
      useRouter().push({ path: "/users" });
    }
    axios
      .get(
        `${(await Config.get()).SERVER_URL}/rules`,
        await AuthService.getAuthHeader(),
      )
      .then((res) => {
        this.rules = res.data.rules;
        this.onRootSelected();
      })
      .catch(handleError);
  },
  methods: {
    async saveRules() {
      axios
        .put(
          `${(await Config.get()).SERVER_URL}/rules`,
          { rules: this.rules },
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          EventBus.emit(EventTypes.ALERT_MESSAGE, {
            type: "info",
            text: "Rules updated",
          });
        })
        .catch(handleError);
    },
    async onRootSelected() {
      const existingRule = find(this.rules.info, { isRoot: true });
      if (existingRule) {
        this.currentRule = existingRule;
      } else {
        this.currentRule = {
          isRoot: true,
          autoRead: [],
          autoDelete: [],
        };
        this.rules.info.push(this.currentRule);
      }
    },
    async onLabelSelected(source) {
      const existingRule = find(this.rules.info, {
        labelName: source.labelName,
      });
      if (existingRule) {
        this.currentRule = existingRule;
      } else {
        this.currentRule = {
          labelName: source.labelName,
          autoRead: [],
          autoDelete: [],
        };
        this.rules.info.push(this.currentRule);
      }
    },
    async onSourceSelected(source) {
      const existingRule = find(this.rules.info, { sourceId: source.sourceId });
      if (existingRule) {
        this.currentRule = existingRule;
      } else {
        this.currentRule = {
          sourceId: source.sourceId,
          autoRead: [],
          autoDelete: [],
        };
        this.rules.info.push(this.currentRule);
      }
    },
    async addAutoArchive() {
      this.currentRule.autoRead.push({ pattern: "*", ageDays: "100" });
    },
    async addAutoDelete() {
      this.currentRule.autoDelete.push({ pattern: "*", ageDays: "100" });
    },
    async removeAutoArchive(pattern) {
      this.currentRule.autoRead.splice(
        findIndex(this.currentRule.autoRead, { pattern }),
        1,
      );
    },
    async removeAutoDelete(pattern) {
      this.currentRule.autoDelete.splice(
        findIndex(this.currentRule.autoDelete, { pattern }),
        1,
      );
    },
  },
};
</script>

<style scoped>
@media (max-width: 700px) {
  #sources-rules {
    overflow: scroll;
    grid-row-start: 3;
    grid-row-end: span 2;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
}

@media (min-width: 701px) {
  #sources-rules {
    overflow: auto;
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
}

.rule-layout {
  display: grid;
  grid-template-columns: auto 3px 1fr;
  column-gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.rule-separator {
  background-color: var(--color-border);
}
</style>
