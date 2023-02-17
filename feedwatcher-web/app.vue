<template>
  <div id="page-layout">
    <header>
      <Navigation />
    </header>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<style>
#page-layout {
  width: auto;
  height: 100vh;
  display: grid;
  overflow: hidden;
  grid-template-rows: 4em 1fr;
}

header,
main {
  padding: 0.5em;
}

.actions i {
  font-size: 1.5em;
  cursor: pointer;
  margin-left: 0.5em;
  margin-right: 0.5em;
}

@media (prefers-color-scheme: dark) {
  .actions i {
    color: #bcc6ce;
  }
}
@media (prefers-color-scheme: light) {
  .actions i {
    color: #1d2832;
  }
}

/* Aninations */

.fade-in-slow {
  animation: fadeIn 2s;
}
.fade-in-fast {
  animation: fadeIn 0.5s;
}
@keyframes fadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>
