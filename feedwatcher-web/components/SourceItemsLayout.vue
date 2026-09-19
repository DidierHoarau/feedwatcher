<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h4>{{ title }}</h4>
      <span
        v-if="
          showTreeToggle &&
          !sourcesStore.listMenuOpened &&
          sourcesStore.scopeText
        "
        class="sources-scope"
        >{{ sourcesStore.scopeText }}</span
      >
    </div>
    <div id="sources-actions" class="actions">
      <slot name="actions">
        <i
          class="bi bi-cloud-arrow-down"
          :class="{ blink: userProcessorInfoStore.status !== 'idle' }"
          v-on:click="refreshAndFetch()"
          title="Fetch all sources now"
          aria-label="Fetch all sources now"
        ></i>
        <i
          class="bi bi-arrow-clockwise"
          v-on:click="refresh()"
          title="Refresh the list"
          aria-label="Refresh the list"
        ></i>
        <NuxtLink
          v-if="showAddSource"
          to="/sources/new"
          title="Add a source"
          aria-label="Add a source"
          ><i class="bi bi-plus-square"></i
        ></NuxtLink>
      </slot>
      <button
        v-if="showTreeToggle"
        class="sources-actions-menu-toggle"
        :aria-expanded="sourcesStore.listMenuOpened"
        :aria-label="
          sourcesStore.listMenuOpened
            ? 'Hide the sources list'
            : 'Show the sources list'
        "
        :title="
          sourcesStore.listMenuOpened
            ? 'Hide the sources list'
            : 'Show the sources list'
        "
        v-on:click="sourcesStore.toggleListMenu()"
      >
        <i
          :class="
            sourcesStore.listMenuOpened
              ? 'bi bi-layout-sidebar'
              : 'bi bi-layout-sidebar-inset'
          "
        ></i>
      </button>
    </div>
    <div
      id="sources-list"
      :class="{ 'sources-list-closed': showTreeToggle && !sourcesStore.listMenuOpened }"
    >
      <SourceList
        v-if="!lazyTree"
        :displayCount="displayCount"
        @onSourceSelected="emit('onSourceSelected', $event)"
        @onLabelSelected="emit('onLabelSelected', $event)"
        @onRootSelected="emit('onRootSelected', $event)"
      />
      <LazySourceList
        v-else
        :displayCount="displayCount"
        @onSourceSelected="emit('onSourceSelected', $event)"
        @onLabelSelected="emit('onLabelSelected', $event)"
        @onRootSelected="emit('onRootSelected', $event)"
      />
    </div>
    <slot></slot>
  </div>
</template>

<script setup>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError } from "~~/services/EventBus";

const props = defineProps({
  title: { type: String, required: true },
  displayCount: { type: String, default: undefined },
  lazyTree: { type: Boolean, default: false },
  showAddSource: { type: Boolean, default: false },
  showTreeToggle: { type: Boolean, default: true },
});

const emit = defineEmits([
  "onSourceSelected",
  "onLabelSelected",
  "onRootSelected",
]);

const userProcessorInfoStore = UserProcessorInfoStore();
const sourcesStore = SourcesStore();

async function refreshAndFetch() {
  await axios
    .put(
      `${(await Config.get()).SERVER_URL}/sources/fetch`,
      {},
      await AuthService.getAuthHeader(),
    )
    .then((res) => {})
    .catch(handleError);
  UserProcessorInfoStore().check();
}

async function refresh() {
  SourceItemsStore().fetch();
  UserProcessorInfoStore().check();
  SourcesStore().fetch();
}
</script>
