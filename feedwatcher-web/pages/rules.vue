<template>
  <SourceItemsLayout
    title="Rules"
    :show-tree-toggle="false"
    @onSourceSelected="onSourceSelected"
    @onLabelSelected="onLabelSelected"
    @onRootSelected="onRootSelected"
  >
    <template #actions>
      <i
        class="bi bi-save"
        v-on:click="saveRules()"
        title="Save rules"
        aria-label="Save rules"
      ></i>
    </template>
    <div id="sources-rules">
      <article>
        <header>Auto-Archive</header>
        <div
          v-for="(rule, index) of currentRule.autoRead"
          v-bind:key="index"
          class="rule-layout"
        >
          <i
            class="bi bi-trash-fill rule-action"
            v-on:click="removeAutoArchive(rule.pattern)"
            title="Remove auto-archive rule"
            aria-label="Remove auto-archive rule"
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
        <i
          class="bi bi-plus-square rule-action"
          v-on:click="addAutoArchive()"
          title="Add an auto-archive rule"
          aria-label="Add an auto-archive rule"
        ></i>
      </article>
      <article>
        <header>Auto-Delete</header>
        <div
          v-for="(rule, index) of currentRule.autoDelete"
          v-bind:key="index"
          class="rule-layout"
        >
          <i
            class="bi bi-trash-fill rule-action"
            v-on:click="removeAutoDelete(rule.pattern)"
            title="Remove auto-delete rule"
            aria-label="Remove auto-delete rule"
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
        <i
          class="bi bi-plus-square rule-action"
          v-on:click="addAutoDelete()"
          title="Add an auto-delete rule"
          aria-label="Add an auto-delete rule"
        ></i>
      </article>
    </div>
  </SourceItemsLayout>
</template>

<script setup>
import axios from "axios";
import { find, findIndex } from "lodash";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

const rules = ref({ info: [] });
const currentRule = ref({ autoDelete: [], autoRead: [] });

(async () => {
  axios
    .get(
      `${(await Config.get()).SERVER_URL}/rules`,
      await AuthService.getAuthHeader(),
    )
    .then((res) => {
      rules.value = res.data.rules;
      onRootSelected();
    })
    .catch(handleError);
})();

async function saveRules() {
  axios
    .put(
      `${(await Config.get()).SERVER_URL}/rules`,
      { rules: rules.value },
      await AuthService.getAuthHeader(),
    )
    .then((res) => {
      EventBus.emit(EventTypes.ALERT_MESSAGE, {
        type: "info",
        text: "Rules updated",
      });
    })
    .catch(handleError);
}

async function onRootSelected() {
  const existingRule = find(rules.value.info, { isRoot: true });
  if (existingRule) {
    currentRule.value = existingRule;
  } else {
    currentRule.value = {
      isRoot: true,
      autoRead: [],
      autoDelete: [],
    };
    rules.value.info.push(currentRule.value);
  }
}

async function onLabelSelected(source) {
  const existingRule = find(rules.value.info, {
    labelName: source.labelName,
  });
  if (existingRule) {
    currentRule.value = existingRule;
  } else {
    currentRule.value = {
      labelName: source.labelName,
      autoRead: [],
      autoDelete: [],
    };
    rules.value.info.push(currentRule.value);
  }
}

async function onSourceSelected(source) {
  const existingRule = find(rules.value.info, { sourceId: source.sourceId });
  if (existingRule) {
    currentRule.value = existingRule;
  } else {
    currentRule.value = {
      sourceId: source.sourceId,
      autoRead: [],
      autoDelete: [],
    };
    rules.value.info.push(currentRule.value);
  }
}

async function addAutoArchive() {
  currentRule.value.autoRead.push({ pattern: "*", ageDays: "100" });
}

async function addAutoDelete() {
  currentRule.value.autoDelete.push({ pattern: "*", ageDays: "100" });
}

async function removeAutoArchive(pattern) {
  currentRule.value.autoRead.splice(
    findIndex(currentRule.value.autoRead, { pattern }),
    1,
  );
}

async function removeAutoDelete(pattern) {
  currentRule.value.autoDelete.splice(
    findIndex(currentRule.value.autoDelete, { pattern }),
    1,
  );
}
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
