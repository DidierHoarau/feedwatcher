<template>
  <div class="settings-tab-content">
    <article class="settings-card">
      <header>
        <h4><i class="bi bi-info-circle"></i> Keyboard shortcuts</h4>
      </header>
      <table class="shortcuts-info-table">
        <tbody>
          <tr v-for="shortcut in shortcuts" :key="shortcut.keys">
            <td><kbd>{{ shortcut.keys }}</kbd></td>
            <td>{{ shortcut.action }}</td>
          </tr>
        </tbody>
      </table>
      <p class="shortcuts-info-hint">
        Press <kbd>?</kbd> anywhere to open the shortcuts help.
      </p>
    </article>
  </div>
</template>

<script setup>
import { KEYBOARD_SHORTCUTS } from "~~/services/KeyboardShortcuts";

const shortcuts = KEYBOARD_SHORTCUTS;
</script>

<style scoped>
.shortcuts-info-table td {
  padding: var(--space-2xs, 0.25rem) var(--space-sm, 0.5rem);
}

.shortcuts-info-table td:first-child {
  white-space: nowrap;
}

.shortcuts-info-table kbd {
  margin: 0;
}

.shortcuts-info-hint {
  color: var(--color-text-muted);
}
</style>
