<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h3>Rules</h3>
    </div>
    <div id="sources-actions" class="actions">
      <button v-on:click="saveRules()">Save</button>
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
        await AuthService.getAuthHeader()
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
          await AuthService.getAuthHeader()
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
        1
      );
    },
    async removeAutoDelete(pattern) {
      this.currentRule.autoDelete.splice(
        findIndex(this.currentRule.autoDelete, { pattern }),
        1
      );
    },
  },
};
</script>

<style scoped>
#sources-layout > * {
  min-height: 0px;
}
#sources-actions {
  text-align: right;
  white-space: nowrap;
}
#sources-list div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#sources-items-actions {
  text-align: right;
  font-size: 0.9em;
  padding-top: 0.2em;
  padding-bottom: 0.2em;
}

@media (max-width: 700px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 2.7em auto 3em 2fr;
    grid-template-columns: auto auto;
    height: 100%;
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 3;
    grid-column-start: 1;
    grid-column-end: span 2;
    display: flex;
    justify-content: right;
    align-items: center;
  }
  #sources-rules {
    overflow: scroll;
    grid-row-start: 3;
    grid-row-end: span 2;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  #sources-header {
    grid-row: 1;
    grid-column: 1;
  }
  #sources-list {
    overflow: auto;
    height: 25vh;
    grid-row: 2;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  .sources-list-closed {
    height: 0px !important;
  }
}

@media (min-width: 701px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 2.7em 3em 1fr;
    grid-template-columns: auto 1fr 1fr;
    height: 100%;
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 2;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
  #sources-rules {
    overflow: auto;
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
  #sources-header {
    grid-row: 1;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  #sources-list {
    width: 30vw;
    max-width: 20em;
    overflow: auto;
    height: auto;
    grid-row-start: 2;
    grid-row-end: span 2;
    grid-column: 1;
  }
  .sources-actions-menu-toggle {
    visibility: hidden;
    font-size: 0px;
    padding: 0px;
    margin: 0px;
  }
}

:root[data-theme="dark"] .source-active {
  background-color: #333;
}
:root[data-theme="dark"] #sources-list {
  background-color: #33333333;
}
:root[data-theme="light"] .source-active {
  background-color: #bbb;
}
:root[data-theme="light"] #sources-list {
  background-color: #aaaaaa33;
}

.source-name-layout {
  display: grid;
  grid-template-columns: auto 1fr auto;
  padding: 0.3em 0.5em;
}
.source-name-indent {
  grid-column: 1;
  padding-right: 0.5em;
}
.source-name-name {
  grid-column: 2;
}
.source-name-count {
  grid-column: 3;
}

#sources-items-list {
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
  align-items: center;
}
#sources-items-list-page-next {
  padding-bottom: 0.6em;
  padding-top: 0.6em;
  text-align: center;
}
.page-inactive {
  opacity: 0.1;
}

#sources-items-list-page {
  height: 100%;
  overflow-y: auto;
}

.rule-layout {
  display: grid;
  grid-template-columns: auto 3px 1fr;
  column-gap: 0.5em;
  margin-bottom: 0.8em;
}

.rule-separator {
  background-color: #33333399;
}
</style>
