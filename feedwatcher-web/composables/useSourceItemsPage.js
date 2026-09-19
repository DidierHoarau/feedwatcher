import { AuthenticationStore } from "~~/stores/AuthenticationStore";
import { SourceItemsStore } from "~~/stores/SourceItemsStore";
import { SourcesStore } from "~~/stores/SourcesStore";
import { UserProcessorInfoStore } from "~~/stores/UserProcessorInfoStore";
import { EventBus, EventTypes } from "~~/services/EventBus";

export async function ensureAuthenticatedUser() {
  if (!(await AuthenticationStore().ensureAuthenticated())) {
    useRouter().push({ path: "/users" });
  }
}

export function useSourceItemsPage({
  filterStatus,
  filterSaved,
  syncSourcesStore = false,
  syncRoute = false,
  routeQueryInit = false,
}) {
  const { onSourceSelected, onLabelSelected, onRootSelected } =
    useSourceItemsSelection({
      filterStatus,
      filterSaved,
      syncSourcesStore,
      syncRoute,
    });
  (async () => {
    await ensureAuthenticatedUser();
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      if (
        SourceItemsStore().sourceItems.length === 0 &&
        UserProcessorInfoStore().status === "idle"
      ) {
        SourceItemsStore().fetch();
      }
    });
    if (routeQueryInit) {
      if (useRoute().query.filterStatus) {
        filterStatus.value = useRoute().query.filterStatus;
      }
      if (useRoute().query.sourceId) {
        onSourceSelected({ sourceId: useRoute().query.sourceId }, false);
      } else if (useRoute().query.labelName) {
        onLabelSelected({ labelName: useRoute().query.labelName }, false);
      } else {
        onRootSelected(false);
      }
    } else {
      onRootSelected(false);
    }
  })();
  return { onSourceSelected, onLabelSelected, onRootSelected };
}

export function useSourceItemsInfiniteScroll() {
  let scrollObserver = null;

  onMounted(() => {
    if (scrollObserver) {
      scrollObserver.disconnect();
    }
    const store = SourceItemsStore();
    const scrollRoot = document.getElementById("sources-items-list-page");
    const sentinel = document.getElementById("sources-items-list-page-next");
    scrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && store.pageHasMore && !store.loadingMore) {
          store.fetchMore();
        }
      },
      { root: scrollRoot, rootMargin: "0px" },
    );
    if (sentinel) {
      scrollObserver.observe(sentinel);
    }
  });

  onBeforeUnmount(() => {
    if (scrollObserver) {
      scrollObserver.disconnect();
      scrollObserver = null;
    }
  });
}

function useSourceItemsSelection({
  filterStatus,
  filterSaved,
  syncSourcesStore,
  syncRoute,
}) {
  function updateRouteQuery() {
    const sourceItemsStore = SourceItemsStore();
    const query = {};
    if (sourceItemsStore.searchCriteria !== "all") {
      query[sourceItemsStore.searchCriteria] =
        sourceItemsStore.searchCriteriaValue;
    }
    if (sourceItemsStore.filterStatus !== "unread") {
      query.filterStatus = sourceItemsStore.filterStatus;
    }
    if (sourceItemsStore.filterSaved) {
      query.filterSaved = sourceItemsStore.filterSaved;
    }
    useRouter().push({ query });
  }

  async function onSourceSelected(source, userAction = true) {
    const sourceItemsStore = SourceItemsStore();
    sourceItemsStore.selectedSource = source.sourceId;
    sourceItemsStore.searchCriteria = "sourceId";
    sourceItemsStore.searchCriteriaValue = source.sourceId;
    sourceItemsStore.filterStatus = filterStatus.value;
    sourceItemsStore.filterSaved = filterSaved;
    sourceItemsStore.fetch();
    if (syncSourcesStore) {
      SourcesStore().setSelectedSourceId(source.sourceId);
      if (userAction) {
        SourcesStore().collapseListMenuOnMobile();
      }
    }
    if (syncRoute) {
      updateRouteQuery();
    }
  }

  async function onLabelSelected(source, userAction = true) {
    const sourceItemsStore = SourceItemsStore();
    sourceItemsStore.selectedSource = null;
    sourceItemsStore.searchCriteria = "labelName";
    sourceItemsStore.searchCriteriaValue = source.labelName;
    sourceItemsStore.filterStatus = filterStatus.value;
    sourceItemsStore.filterSaved = filterSaved;
    sourceItemsStore.fetch();
    if (syncSourcesStore) {
      SourcesStore().setSelectedLabel(source.labelName);
      if (userAction) {
        SourcesStore().collapseListMenuOnMobile();
      }
    }
    if (syncRoute) {
      updateRouteQuery();
    }
  }

  async function onRootSelected(userAction = true) {
    const sourceItemsStore = SourceItemsStore();
    sourceItemsStore.selectedSource = null;
    sourceItemsStore.searchCriteria = "all";
    sourceItemsStore.filterStatus = filterStatus.value;
    sourceItemsStore.filterSaved = filterSaved;
    sourceItemsStore.fetch();
    if (syncSourcesStore) {
      SourcesStore().setSelectedRoot();
      if (userAction) {
        SourcesStore().collapseListMenuOnMobile();
      }
    }
    if (syncRoute) {
      updateRouteQuery();
    }
  }

  return { onSourceSelected, onLabelSelected, onRootSelected };
}
