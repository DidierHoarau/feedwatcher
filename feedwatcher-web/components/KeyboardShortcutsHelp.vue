<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="shortcuts-help-backdrop"
      v-on:click="close()"
    >
      <div
        class="shortcuts-help-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        v-on:click.stop
      >
        <h2>Keyboard shortcuts</h2>
        <table class="shortcuts-help-table">
          <tbody>
            <tr v-for="shortcut in shortcuts" :key="shortcut.keys">
              <td><kbd>{{ shortcut.keys }}</kbd></td>
              <td>{{ shortcut.action }}</td>
            </tr>
          </tbody>
        </table>
        <button class="secondary" v-on:click="close()">Close</button>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { EventBus, EventTypes } from "~~/services/EventBus";

export default {
  data() {
    return {
      visible: false,
      shortcuts: [
        { keys: "j / k", action: "Next / previous item" },
        { keys: "m", action: "Mark read / unread" },
        { keys: "s", action: "Save / remove bookmark" },
        { keys: "o", action: "Open the item dialog" },
        { keys: "r", action: "Open the item in reader view" },
        { keys: "v", action: "Open the external link" },
        { keys: "/", action: "Focus the filter box" },
        { keys: "?", action: "Show this help" },
        { keys: "Esc", action: "Close dialog / popover" },
      ],
    };
  },
  mounted() {
    document.addEventListener("keydown", this.onKeydown);
    this.onShow = () => {
      this.visible = true;
    };
    EventBus.on(EventTypes.SHORTCUTS_HELP, this.onShow);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeydown);
    EventBus.off(EventTypes.SHORTCUTS_HELP, this.onShow);
  },
  methods: {
    onKeydown(event) {
      if (this.visible && event.key === "Escape") {
        event.stopPropagation();
        this.close();
      }
    },
    close() {
      this.visible = false;
    },
  },
};
</script>

<style scoped>
.shortcuts-help-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--color-shadow-lg, rgba(0, 0, 0, 0.5)) 60%, transparent);
  padding: var(--space-md, 1em);
}

.shortcuts-help-panel {
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 8px);
  box-shadow: 0 8px 24px var(--color-shadow-lg, rgba(0, 0, 0, 0.5));
  padding: var(--space-lg, 1.5em);
  max-width: min(24rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  overflow: auto;
}

.shortcuts-help-panel h2 {
  font-size: var(--font-lg, 1.2em);
  margin-top: 0;
}

.shortcuts-help-table {
  margin-bottom: var(--space-md, 1em);
}

.shortcuts-help-table td {
  padding: var(--space-2xs, 0.25rem) var(--space-sm, 0.5rem);
}

.shortcuts-help-table td:first-child {
  white-space: nowrap;
}

.shortcuts-help-table kbd {
  margin: 0;
}

.shortcuts-help-panel button {
  width: auto;
}
</style>
