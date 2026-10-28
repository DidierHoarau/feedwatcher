<template>
  <div id="sources-items-actions" class="actions">
    <input
      id="sources-items-search-filter"
      class="source-filter-input"
      v-model="searchText"
      type="search"
      :placeholder="filterPlaceholder"
      @search="onSearchInput"
    />
    <i
      v-on:click="filtersOpen = !filtersOpen"
      class="bi bi-funnel"
      :class="{ 'filters-active': hasActiveFilters }"
      title="More filters (sort, dates, tags)"
      aria-label="More filters"
      :aria-expanded="filtersOpen"
    ></i>
    <NuxtLink
      v-if="sourceItemsStore.selectedSource"
      :to="'/sources/' + sourceItemsStore.selectedSource"
      title="Edit the selected source"
      aria-label="Edit the selected source"
      ><i class="bi bi-pencil-square"></i
    ></NuxtLink>
    <i
      v-if="sourceItemsStore.sourceItems.length > 0"
      v-on:click="markAllRead($event)"
      class="bi bi-check2-square"
      title="Mark all displayed items as read"
      aria-label="Mark all displayed items as read"
    ></i>
    <i
      v-on:click="cycleFilterStatus()"
      :class="readStatusIcons[filterStatus]"
      :title="readStatusTitles[filterStatus]"
      :aria-label="readStatusTitles[filterStatus]"
    ></i>
    <ConfirmPopover
      v-model="confirmOpen"
      :anchor="confirmAnchor"
      title="Mark all items as read?"
      description="You can undo this for a few seconds."
      confirm-label="Mark read"
      cancel-label="Cancel"
      @confirm="onConfirmMarkAll"
      @cancel="onCancelMarkAll"
    />
    <div v-show="filtersOpen" class="actions-row-advanced">
      <label class="actions-row-field">
        <span class="actions-row-label">Sort</span>
        <select
          v-model="sourceItemsStore.sort"
          class="actions-row-select"
          aria-label="Sort items"
          v-on:change="sourceItemsStore.fetch()"
        >
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="relevance">Best match</option>
        </select>
      </label>
      <label class="actions-row-field">
        <span class="actions-row-label">From</span>
        <input
          class="actions-row-date"
          type="date"
          v-model="sourceItemsStore.minDate"
          aria-label="Show items from date"
          title="Show items from date"
          v-on:change="sourceItemsStore.fetch()"
        />
      </label>
      <label class="actions-row-field">
        <span class="actions-row-label">To</span>
        <input
          class="actions-row-date"
          type="date"
          v-model="sourceItemsStore.maxDate"
          aria-label="Show items until date"
          title="Show items until date"
          v-on:change="sourceItemsStore.fetch()"
        />
      </label>
      <label
        v-if="sourceItemsStore.availableTags.length > 0"
        class="actions-row-field"
      >
        <span class="actions-row-label">Tag</span>
        <select
          v-model="sourceItemsStore.searchTagName"
          class="actions-row-select"
          aria-label="Filter by tag"
          v-on:change="sourceItemsStore.fetch()"
        >
          <option value="">All tags</option>
          <option v-for="tag in sourceItemsStore.availableTags" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import { Timeout } from "~~/services/Timeout";
import { debounce } from "lodash";

const props = defineProps({
  filterPlaceholder: { type: String, required: true },
  filterStatus: { type: String, required: true },
});

const emit = defineEmits(["update:filterStatus"]);

const sourceItemsStore = SourceItemsStore();
const searchText = ref(sourceItemsStore.searchPattern || "");
const confirmOpen = ref(false);
const confirmAnchor = ref(null);

const hasActiveFilters = computed(
  () =>
    sourceItemsStore.sort !== "date_desc" ||
    !!sourceItemsStore.minDate ||
    !!sourceItemsStore.maxDate ||
    !!sourceItemsStore.searchTagName,
);
const filtersOpen = ref(hasActiveFilters.value);

const readStatusIcons = {
  unread: "bi bi-envelope",
  all: "bi bi-inbox",
  read: "bi bi-envelope-open",
};

const readStatusTitles = {
  unread: "Currently showing unread only — show all items",
  all: "Currently showing all items — show read only",
  read: "Currently showing read only — show unread items only",
};

const onSearchInput = debounce(function () {
  sourceItemsStore.setSearchPattern(searchText.value);
}, 300);

watch(searchText, () => {
  onSearchInput();
});

onMounted(() => {
  sourceItemsStore.fetchAvailableTags();
});

function cycleFilterStatus() {
  const nextStatus = {
    unread: "all",
    all: "read",
    read: "unread",
  };
  const filterStatus = nextStatus[props.filterStatus] || "unread";
  emit("update:filterStatus", filterStatus);
  sourceItemsStore.filterStatus = filterStatus;
  sourceItemsStore.fetch();
}

async function markAllRead(event) {
  const sourceItemsStore = SourceItemsStore();
  const items = sourceItemsStore.sourceItems;
  if (items.length === 0) {
    return;
  }
  if (items.length > 1) {
    confirmAnchor.value = event?.currentTarget || null;
    confirmOpen.value = true;
    return;
  }
  await applyMarkAllRead(items);
}

function onConfirmMarkAll() {
  const sourceItemsStore = SourceItemsStore();
  const items = [...sourceItemsStore.sourceItems];
  applyMarkAllRead(items);
}

function onCancelMarkAll() {
  confirmAnchor.value = null;
}

async function applyMarkAllRead(items) {
  const sourceItemsStore = SourceItemsStore();
  const restoreIds = items
    .filter((item) => item.status !== "read")
    .map((item) => item.id);
  const itemIds = items.map((item) => item.id);
  await axios
    .put(
      `${(await Config.get()).SERVER_URL}/items/status`,
      { status: "read", itemIds },
      await AuthService.getAuthHeader(),
    )
    .then(() => {
      for (const item of items) {
        item.status = "read";
      }
      EventBus.emit(EventTypes.ALERT_MESSAGE, {
        text: "All displayed items marked as read",
        actionLabel: "Undo",
        durationMs: 6000,
        onAction: () => undoMarkAllRead(restoreIds),
      });
      EventBus.emit(EventTypes.ITEMS_UPDATED, {});
      return Timeout.wait(1000);
    })
    .then(() => {
      sourceItemsStore.fetch();
    })
    .catch(handleError);
}

async function undoMarkAllRead(restoreIds) {
  if (!restoreIds || restoreIds.length === 0) {
    return;
  }
  const sourceItemsStore = SourceItemsStore();
  await axios
    .put(
      `${(await Config.get()).SERVER_URL}/items/status`,
      { status: "unread", itemIds: restoreIds },
      await AuthService.getAuthHeader(),
    )
    .then(() => {
      EventBus.emit(EventTypes.ITEMS_UPDATED, {});
      return sourceItemsStore.fetch();
    })
    .catch(handleError);
}
</script>
