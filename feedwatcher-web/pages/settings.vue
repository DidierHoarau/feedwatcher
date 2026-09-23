<template>
  <div id="settings-page">
    <div class="settings-tabs" aria-label="Settings sections">
      <NuxtLink
        to="/settings/me"
        class="settings-tab"
        active-class="active"
        aria-label="Me"
        ><i class="bi bi-person-fill"></i>
        <span>Me</span></NuxtLink
      >
      <NuxtLink
        to="/settings/import-export"
        class="settings-tab"
        active-class="active"
        aria-label="Import / Export"
        ><i class="bi bi-arrow-down-up"></i>
        <span>Import / Export</span></NuxtLink
      >
      <NuxtLink
        to="/settings/rules"
        class="settings-tab"
        active-class="active"
        aria-label="Rules"
        ><i class="bi bi-robot"></i>
        <span>Rules</span></NuxtLink
      >
    </div>
    <div class="settings-tab-panel">
      <NuxtPage />
    </div>
  </div>
</template>

<style scoped>
#settings-page {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  gap: var(--space-base);
}

.settings-tabs {
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.settings-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  color: var(--color-text-muted);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 3px solid transparent;
  /* overlap the tabs bottom border so the active tab is underlined on it */
  margin-bottom: -1px;
}

.settings-tab:hover {
  color: var(--color-text);
}

.settings-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.settings-tab-panel {
  height: 100%;
  min-height: 0;
  overflow: auto;
}
</style>
