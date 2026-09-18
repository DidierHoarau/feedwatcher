<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h4>{{ title }}</h4>
    </div>
    <div id="sources-actions" class="actions">
      <slot name="actions">
        <i
          class="bi bi-cloud-arrow-down"
          :class="{ blink: userProcessorInfoStore.status !== 'idle' }"
          v-on:click="refreshAndFetch()"
        ></i>
        <i class="bi bi-arrow-clockwise" v-on:click="refresh()"></i>
        <NuxtLink v-if="showAddSource" to="/sources/new"
          ><i class="bi bi-plus-square"></i
        ></NuxtLink>
      </slot>
      <template v-if="showTreeToggle">
        <i
          class="bi bi-caret-up-square sources-actions-menu-toggle"
          v-if="menuOpened"
          v-on:click="openListMenu()"
        ></i>
        <i
          class="bi bi-caret-down-square sources-actions-menu-toggle"
          v-else
          v-on:click="openListMenu()"
        ></i>
      </template>
    </div>
    <div id="sources-list" :class="{ 'sources-list-closed': !menuOpened }">
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
const menuOpened = ref(true);

function openListMenu() {
  menuOpened.value = !menuOpened.value;
}

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
