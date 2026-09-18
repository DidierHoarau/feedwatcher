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
      ><i class="bi bi-pencil-square"></i
    ></NuxtLink>
    <i
      v-if="sourceItemsStore.sourceItems.length > 0"
      v-on:click="markAllRead()"
      class="bi bi-archive"
    ></i>
    <i
      v-if="filterStatus == 'unread'"
      v-on:click="toggleUnreadFIlter()"
      class="bi bi-envelope"
    ></i>
    <i v-else v-on:click="toggleUnreadFIlter()" class="bi bi-envelope-open"></i>
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

async function markAllRead() {
  const sourceItemsStore = SourceItemsStore();
  let confirmed = false;
  if (sourceItemsStore.sourceItems.length > 1) {
    confirmed = confirm("Mark all item read?");
  } else {
    confirmed = true;
  }
  if (confirmed === true) {
    const itemIds = [];
    for (const item of sourceItemsStore.sourceItems) {
      itemIds.push(item.id);
    }
    await axios
      .put(
        `${(await Config.get()).SERVER_URL}/items/status`,
        { status: "read", itemIds },
        await AuthService.getAuthHeader(),
      )
      .then(() => {
        for (const item of sourceItemsStore.sourceItems) {
          item.status = "read";
        }
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          text: "All displayed items marked as read",
        });
        EventBus.emit(EventTypes.ITEMS_UPDATED, {});
        return Timeout.wait(1000);
      })
      .then(() => {
        sourceItemsStore.fetch();
      })
      .catch(handleError);
  }
}
</script>
