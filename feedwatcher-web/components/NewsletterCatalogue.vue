<template>
  <article class="newsletter-catalogue">
    <header class="catalogue-header">
      <h4><i class="bi bi-envelope-paper"></i> Newsletters</h4>
      <button
        v-if="enabled"
        class="secondary catalogue-refresh"
        :disabled="loading"
        v-on:click="loadCatalogue(true)"
      >
        <i class="bi bi-arrow-clockwise"></i> Refresh catalogue
      </button>
    </header>

    <div v-if="statusChecked && !enabled" class="catalogue-hint">
      <i class="bi bi-info-circle"></i>
      The newsletter integration is not configured on this server. Set
      <code>NEWSLETTER_URL</code> to the address of your feedwatcher-newsletter
      service, then reload this page.
    </div>

    <template v-else-if="statusChecked">
      <div v-if="loading" class="catalogue-loading"><Loading /></div>

      <div v-else-if="error" class="catalogue-error">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>{{ error }}</span>
        <button class="secondary" v-on:click="loadCatalogue(true)">Retry</button>
      </div>

      <div v-else-if="feeds.length === 0" class="catalogue-empty">
        The newsletter service does not offer any feeds yet.
      </div>

      <template v-else>
        <div class="catalogue-toolbar">
          <input
            v-model="search"
            type="search"
            placeholder="Search by title, sender or email…"
          />
          <select v-model="filter">
            <option value="all">All feeds</option>
            <option value="available">Available</option>
            <option value="added">Added</option>
            <option value="ignored">Ignored</option>
          </select>
        </div>

        <div class="catalogue-bulk">
          <label class="catalogue-label">
            Label
            <input
              v-model="label"
              type="text"
              placeholder="Newsletters"
              maxlength="200"
            />
          </label>
          <button
            :disabled="selectedFeedIds.length === 0 || subscribing"
            v-on:click="addSelected()"
          >
            <Loading v-if="subscribing" />
            <span v-else>Add selected ({{ selectedFeedIds.length }})</span>
          </button>
        </div>

        <div v-if="notice" class="catalogue-notice">
          <i class="bi bi-check-circle-fill"></i> {{ notice }}
        </div>

        <div class="catalogue-list">
          <div
            v-for="feed in visibleFeeds"
            :key="feed.providerFeedId"
            class="catalogue-row"
          >
            <div class="catalogue-select">
              <input
                v-if="feed.state === 'available'"
                type="checkbox"
                :value="feed.providerFeedId"
                v-model="selectedFeedIds"
                :aria-label="'Select ' + feed.title"
              />
              <i
                v-else-if="feed.state === 'added'"
                class="bi bi-check-circle-fill catalogue-state-icon-added"
              ></i>
              <i
                v-else
                class="bi bi-eye-slash catalogue-state-icon-ignored"
              ></i>
            </div>

            <div class="catalogue-main">
              <div class="catalogue-title">{{ feed.title }}</div>
              <div class="catalogue-meta">
                <span v-if="feed.senderName">{{ feed.senderName }}</span>
                <span v-if="feed.senderEmail" class="catalogue-email">{{
                  feed.senderEmail
                }}</span>
              </div>
            </div>

            <div class="catalogue-stats">
              <span class="catalogue-count">{{ feed.itemCount }} items</span>
              <span v-if="feed.latestDate" class="catalogue-date">{{
                formatDate(feed.latestDate)
              }}</span>
            </div>

            <span class="catalogue-badge" :class="'catalogue-badge-' + feed.state">
              {{ stateLabel(feed.state) }}
            </span>

            <div class="catalogue-actions">
              <template v-if="feed.state === 'added'">
                <NuxtLink
                  class="catalogue-open-source"
                  :to="'/sources/' + feed.existingSourceId"
                >
                  Open source
                </NuxtLink>
              </template>
              <template v-else-if="feed.state === 'ignored'">
                <button
                  class="secondary"
                  :disabled="savingIgnore"
                  v-on:click="unignore(feed)"
                >
                  Unignore
                </button>
                <button
                  class="secondary"
                  :disabled="addingFeedId === feed.providerFeedId"
                  v-on:click="addOne(feed, true)"
                >
                  Add anyway
                </button>
              </template>
              <template v-else>
                <button
                  :disabled="addingFeedId === feed.providerFeedId"
                  v-on:click="addOne(feed, false)"
                >
                  Add
                </button>
                <button
                  class="secondary"
                  :disabled="savingIgnore"
                  v-on:click="ignore(feed)"
                >
                  Ignore
                </button>
              </template>
            </div>
          </div>

          <div v-if="visibleFeeds.length === 0" class="catalogue-empty">
            No newsletter matches this search or filter.
          </div>
        </div>
      </template>
    </template>
  </article>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { UserSettingsService } from "~~/services/UserSettingsService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

const NEWSLETTER_ERRORS = {
  newsletter_timeout: "The newsletter service did not answer in time.",
  newsletter_auth_failed:
    "The newsletter service rejected FeedWatcher's credentials.",
  newsletter_invalid_response:
    "The newsletter service returned an unexpected response.",
  newsletter_unreachable: "The newsletter service is unreachable.",
  newsletter_disabled: "The newsletter integration is not configured.",
};

const STATE_LABELS = {
  added: "Added",
  available: "Available",
  ignored: "Ignored",
};

export default {
  data() {
    return {
      statusChecked: false,
      enabled: false,
      loading: false,
      error: "",
      feeds: [],
      search: "",
      filter: "all",
      selectedFeedIds: [],
      label: "Newsletters",
      notice: "",
      subscribing: false,
      addingFeedId: "",
      savingIgnore: false,
    };
  },
  computed: {
    visibleFeeds() {
      const term = this.search.trim().toLowerCase();
      return this.feeds.filter((feed) => {
        if (this.filter !== "all" && feed.state !== this.filter) {
          return false;
        }
        if (term === "") {
          return true;
        }
        return [feed.title, feed.senderName, feed.senderEmail].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(term),
        );
      });
    },
  },
  async mounted() {
    let enabled = false;
    try {
      const res = await axios.get(`${(await Config.get()).SERVER_URL}/status`);
      enabled = !!res.data.newsletterEnabled;
    } catch {
      enabled = false;
    }
    this.enabled = enabled;
    this.statusChecked = true;
    if (enabled) {
      await this.loadCatalogue(false);
    }
  },
  methods: {
    async loadCatalogue(force) {
      this.loading = true;
      this.error = "";
      this.notice = "";
      try {
        const res = await axios.get(
          `${(await Config.get()).SERVER_URL}/sources/newsletter`,
          {
            ...(await AuthService.getAuthHeader()),
            ...(force ? { params: { refresh: 1 } } : {}),
          },
        );
        this.feeds = res.data.feeds || [];
        const availableIds = new Set(
          this.feeds
            .filter((feed) => feed.state === "available")
            .map((feed) => feed.providerFeedId),
        );
        this.selectedFeedIds = this.selectedFeedIds.filter((feedId) =>
          availableIds.has(feedId),
        );
      } catch (err) {
        this.error = this.errorMessage(err);
      }
      this.loading = false;
    },
    errorMessage(err) {
      const data = err.response && err.response.data ? err.response.data : {};
      if (data.code && NEWSLETTER_ERRORS[data.code]) {
        return NEWSLETTER_ERRORS[data.code];
      }
      const status = err.response ? err.response.status : 0;
      if (status === 504) {
        return NEWSLETTER_ERRORS.newsletter_timeout;
      }
      if (status >= 500) {
        return NEWSLETTER_ERRORS.newsletter_unreachable;
      }
      return (
        data.error || err.message || "Could not load the newsletter catalogue."
      );
    },
    async addSelected() {
      await this.subscribe(this.selectedFeedIds.slice(), false);
    },
    async addOne(feed, includeIgnored) {
      this.addingFeedId = feed.providerFeedId;
      await this.subscribe([feed.providerFeedId], includeIgnored);
      this.addingFeedId = "";
    },
    async subscribe(feedIds, includeIgnored) {
      if (feedIds.length === 0) {
        return;
      }
      this.subscribing = true;
      try {
        const body = { feedIds, label: this.label.trim() || "Newsletters" };
        if (includeIgnored) {
          body.includeIgnored = true;
        }
        const res = await axios.post(
          `${(await Config.get()).SERVER_URL}/sources/newsletter/subscribe`,
          body,
          await AuthService.getAuthHeader(),
        );
        const data = res.data || {};
        const added = data.added ? data.added.length : 0;
        const existing = data.existing ? data.existing.length : 0;
        const failed = data.failed ? data.failed.length : 0;
        const ignored = data.ignored ? data.ignored.length : 0;
        this.selectedFeedIds = [];
        await this.loadCatalogue(false);
        await SourcesStore().fetch();
        let notice =
          `Added ${added}, already present ${existing}` +
          (ignored ? `, ignored ${ignored}` : "") +
          (failed ? `, failed ${failed}` : "") +
          ".";
        if (failed && data.failed[0] && data.failed[0].error) {
          notice += ` ${data.failed[0].error}`;
        }
        this.notice = notice;
      } catch (err) {
        handleError(err);
      }
      this.subscribing = false;
    },
    async ignore(feed) {
      await this.setIgnored(feed.providerFeedId, true);
    },
    async unignore(feed) {
      await this.setIgnored(feed.providerFeedId, false);
    },
    async setIgnored(feedId, ignored) {
      this.savingIgnore = true;
      try {
        const settings = await UserSettingsService.getSettings();
        const current =
          settings.newsletter && Array.isArray(settings.newsletter.ignoredFeedIds)
            ? settings.newsletter.ignoredFeedIds
            : [];
        const ids = new Set(current);
        if (ignored) {
          ids.add(feedId);
        } else {
          ids.delete(feedId);
        }
        await UserSettingsService.updateSettings({
          newsletter: { ignoredFeedIds: Array.from(ids) },
        });
        const feed = this.feeds.find((entry) => entry.providerFeedId === feedId);
        if (feed && feed.state !== "added") {
          feed.state = ignored ? "ignored" : "available";
        }
        this.selectedFeedIds = this.selectedFeedIds.filter(
          (selectedId) => selectedId !== feedId,
        );
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "info",
          text: ignored ? "Feed ignored" : "Feed restored",
        });
      } catch (err) {
        handleError(err);
      }
      this.savingIgnore = false;
    },
    stateLabel(state) {
      return STATE_LABELS[state] || state;
    },
    formatDate(value) {
      if (!value) {
        return "";
      }
      return new Date(value).toLocaleDateString();
    },
  },
};
</script>

<style scoped>
.newsletter-catalogue {
  margin: 0;
}

.catalogue-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.catalogue-header h4 {
  margin: 0;
}

.catalogue-refresh {
  width: auto;
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-sm);
}

.catalogue-hint,
.catalogue-error,
.catalogue-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-base);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: var(--font-body);
}

.catalogue-error {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  color: var(--color-danger);
}

.catalogue-error button {
  margin: 0 0 0 auto;
}

.catalogue-loading {
  padding: var(--space-lg) 0;
}

.catalogue-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-sm);
  margin: var(--space-base) 0 var(--space-sm);
}

.catalogue-toolbar input,
.catalogue-toolbar select {
  margin: 0;
}

.catalogue-bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-sm);
  margin-bottom: var(--space-base);
}

.catalogue-label {
  flex: 1 1 12em;
  margin: 0;
  font-size: var(--font-sm);
}

.catalogue-label input {
  margin-bottom: 0;
}

.catalogue-bulk button {
  width: auto;
  margin: 0;
  white-space: nowrap;
}

.catalogue-notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm);
  margin-bottom: var(--space-sm);
  border-radius: var(--radius-sm);
  background: var(--color-primary-light);
  color: var(--color-primary-text);
  font-size: var(--font-sm);
}

.catalogue-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.catalogue-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  grid-template-areas:
    "select main stats badge"
    "select actions actions actions";
  align-items: center;
  gap: var(--space-xs) var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.catalogue-select {
  grid-area: select;
  display: flex;
  align-items: center;
}

.catalogue-select input {
  margin: 0;
}

.catalogue-state-icon-added {
  color: var(--color-success);
}

.catalogue-state-icon-ignored {
  color: var(--color-text-muted);
}

.catalogue-main {
  grid-area: main;
  min-width: 0;
}

.catalogue-title {
  font-weight: 600;
  font-size: var(--font-base);
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.catalogue-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.catalogue-email {
  overflow-wrap: anywhere;
}

.catalogue-stats {
  grid-area: stats;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.catalogue-badge {
  grid-area: badge;
  justify-self: end;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-full);
  font-size: var(--font-xs);
  font-weight: 600;
  white-space: nowrap;
}

.catalogue-badge-added {
  background: var(--color-success);
  color: var(--color-text-inverse);
}

.catalogue-badge-available {
  background: var(--color-primary-light);
  color: var(--color-primary-text);
}

.catalogue-badge-ignored {
  background: var(--color-bg-hover);
  color: var(--color-text-muted);
}

.catalogue-actions {
  grid-area: actions;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-xs);
}

.catalogue-actions button {
  width: auto;
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-sm);
}

.catalogue-open-source {
  font-size: var(--font-sm);
  white-space: nowrap;
}

@media (min-width: 48em) {
  .catalogue-row {
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    grid-template-areas: "select main stats badge actions";
  }
}
</style>
