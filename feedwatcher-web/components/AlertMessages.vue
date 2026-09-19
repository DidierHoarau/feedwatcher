<template>
  <div role="status" aria-live="polite">
    <div v-for="message in messages" v-bind:key="message.id">
      <div :class="message.type ? 'message message-' + message.type : 'message'">
        <span class="message-text"
          ><b v-if="message.type">{{ message.type }}</b>
          {{ message.text }}</span
        >
        <button
          v-if="message.actionLabel"
          type="button"
          class="message-action"
          v-on:click="runAction(message)"
        >
          {{ message.actionLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { EventBus, EventTypes } from "../services/EventBus";

export default {
  name: "AlertMessages",
  data() {
    return {
      messages: [],
      nextId: 1,
    };
  },
  async created() {
    EventBus.on(EventTypes.ALERT_MESSAGE, (message) => {
      const entry = { ...message, id: this.nextId++ };
      this.messages.push(entry);
      const duration = message.durationMs || 5000;
      setTimeout(() => {
        this.dismiss(entry.id);
      }, duration);
    });
  },
  methods: {
    dismiss(id) {
      const index = this.messages.findIndex((m) => m.id === id);
      if (index !== -1) {
        this.messages.splice(index, 1);
      }
    },
    runAction(message) {
      try {
        if (message.onAction) {
          message.onAction();
        }
      } finally {
        this.dismiss(message.id);
      }
    },
  },
};
</script>
<style>
.message {
  padding: var(--space-base);
  margin: var(--space-base);
  color: var(--color-text-inverse);
  background-color: #546e7a;
  display: flex;
  align-items: center;
  gap: var(--space-md);
}
.message-text {
  flex: 1;
}
.message-action {
  flex-shrink: 0;
  width: auto;
  min-height: 44px;
  margin: 0;
  padding: var(--space-xs) var(--space-base);
  font-size: var(--font-sm);
  color: inherit;
  background-color: transparent;
  border: 1px solid currentColor;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.message-action:hover {
  background-color: rgba(128, 128, 128, 0.25);
}
.message-info {
  background-color: var(--color-success);
}
.message-error {
  background-color: var(--color-error);
}
</style>
