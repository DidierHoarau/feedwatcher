<template>
  <article class="settings-card">
    <header>
      <h4><i class="bi bi-bell"></i> Notifications</h4>
    </header>

    <div v-if="!supported || !notificationsEnabled" class="notification-hint">
      <i class="bi bi-info-circle"></i>
      {{
        !supported
          ? "Push notifications are not supported by this browser."
          : "Push notifications are not enabled on this server."
      }}
    </div>

    <template v-else>
      <div class="preference-row">
        <div class="preference-label">
          <i class="bi bi-bell-fill"></i>
          <span>Web Push</span>
        </div>
        <div class="preference-control">
          <button v-if="!subscribed" @click="enablePush()">
            <i class="bi bi-bell"></i> Enable Push
          </button>
          <button v-else class="secondary" @click="disablePush()">
            <i class="bi bi-bell-slash"></i> Disable Push
          </button>
        </div>
      </div>

      <div class="preference-row">
        <div class="preference-label">
          <i class="bi bi-newspaper"></i>
          <span>Daily digest notification</span>
        </div>
        <div class="preference-control">
          <label class="switch-label">
            <input
              type="checkbox"
              v-model="settings.notifications.digest"
            />
            Send a push when the daily summary is published
          </label>
        </div>
      </div>

      <div class="preference-row">
        <div class="preference-label">
          <i class="bi bi-rss"></i>
          <span>New item notifications</span>
        </div>
        <div class="preference-control">
          <select v-model="settings.notifications.newItems" class="preference-select">
            <option value="off">Off</option>
            <option value="all">All sources</option>
            <option value="labels">Selected labels</option>
          </select>
        </div>
      </div>

      <div v-if="settings.notifications.newItems === 'labels'" class="preference-row">
        <div class="preference-label">
          <i class="bi bi-tags"></i>
          <span>Watched labels</span>
        </div>
        <div class="preference-control">
          <span v-if="labels.length === 0">No labels defined on your sources.</span>
          <label v-for="label in labels" :key="label" class="switch-label label-choice">
            <input
              type="checkbox"
              :value="label"
              v-model="settings.notifications.newItemsLabels"
            />
            {{ label }}
          </label>
        </div>
      </div>

      <label>
        Custom digest prompt
        <textarea
          v-model="settings.summaryPrompt"
          rows="4"
          placeholder="Leave empty to use the default summarization prompt"
        ></textarea>
      </label>
    </template>

    <div class="settings-card-actions">
      <button class="secondary" @click="saveSettings()">
        <i class="bi bi-check-lg"></i> Save
      </button>
    </div>
  </article>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { NotificationsService } from "~~/services/NotificationsService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

const DEFAULT_SETTINGS = () => ({
  notifications: {
    digest: false,
    newItems: "off",
    newItemsLabels: [],
  },
  summaryPrompt: "",
});

export default {
  data() {
    return {
      supported: NotificationsService.isSupported(),
      notificationsEnabled: false,
      vapidPublicKey: "",
      subscribed: false,
      labels: [],
      settings: DEFAULT_SETTINGS(),
    };
  },
  async mounted() {
    try {
      const status = await NotificationsService.getServerStatus();
      this.notificationsEnabled = !!status.notificationsEnabled;
      this.vapidPublicKey = status.vapidPublicKey || "";
    } catch (err) {
      this.notificationsEnabled = false;
    }
    if (this.supported && this.notificationsEnabled) {
      try {
        this.subscribed = !!(await NotificationsService.getSubscription());
      } catch (err) {
        this.subscribed = false;
      }
    }
    try {
      const res = await axios.get(
        `${(await Config.get()).SERVER_URL}/users/settings`,
        await AuthService.getAuthHeader()
      );
      if (res.data && res.data.settings) {
        this.settings = {
          notifications: {
            digest: !!res.data.settings.notifications?.digest,
            newItems: res.data.settings.notifications?.newItems || "off",
            newItemsLabels: res.data.settings.notifications?.newItemsLabels || [],
          },
          summaryPrompt: res.data.settings.summaryPrompt || "",
        };
      }
    } catch (err) {
      handleError(err);
    }
    try {
      const res = await axios.get(
        `${(await Config.get()).SERVER_URL}/sources/labels`,
        await AuthService.getAuthHeader()
      );
      const seen = new Set();
      for (const sourceLabel of res.data.sourceLabels || []) {
        const labelName = sourceLabel.labelName;
        if (labelName && labelName.trim() !== "" && !seen.has(labelName)) {
          seen.add(labelName);
          this.labels.push(labelName);
        }
      }
      this.settings.notifications.newItemsLabels =
        this.settings.notifications.newItemsLabels.filter((label) =>
          this.labels.includes(label)
        );
    } catch (err) {
      handleError(err);
    }
  },
  methods: {
    async enablePush() {
      try {
        await NotificationsService.subscribe(this.vapidPublicKey);
        this.subscribed = true;
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "info",
          text: "Push notifications enabled",
        });
      } catch (err) {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: err.message || "Could not enable push notifications",
        });
      }
    },
    async disablePush() {
      try {
        await NotificationsService.unsubscribe();
        this.subscribed = false;
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "info",
          text: "Push notifications disabled",
        });
      } catch (err) {
        handleError(err);
      }
    },
    async saveSettings() {
      try {
        await axios.put(
          `${(await Config.get()).SERVER_URL}/users/settings`,
          { settings: this.settings },
          await AuthService.getAuthHeader()
        );
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "info",
          text: "Notification settings saved",
        });
      } catch (err) {
        handleError(err);
      }
    },
  },
};
</script>

<style scoped>
.notification-hint {
  color: var(--color-text-muted);
  margin-bottom: var(--space-sm);
}
.notification-hint i {
  margin-right: var(--space-xs);
}
.label-choice {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin-right: var(--space-md);
}
</style>
