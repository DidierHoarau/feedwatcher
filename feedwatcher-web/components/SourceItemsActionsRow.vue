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
      v-if="filterStatus == 'unread'"
      v-on:click="toggleUnreadFIlter()"
      class="bi bi-envelope"
      title="Currently showing unread only — show all items"
      aria-label="Show all items"
    ></i>
    <i
      v-else
      v-on:click="toggleUnreadFIlter()"
      class="bi bi-envelope-open"
      title="Currently showing all items — show unread only"
      aria-label="Show unread items only"
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
const searchText = ref("");
const confirmOpen = ref(false);
const confirmAnchor = ref(null);

const onSearchInput = debounce(function () {
  sourceItemsStore.searchPattern = searchText.value;
  sourceItemsStore.fetch();
}, 300);

watch(searchText, () => {
  onSearchInput();
});

function toggleUnreadFIlter() {
  const filterStatus = props.filterStatus === "all" ? "unread" : "all";
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
