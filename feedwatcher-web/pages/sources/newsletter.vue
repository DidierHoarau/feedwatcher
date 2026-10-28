<template>
  <div class="newsletter-page">
    <h4>Newsletters</h4>
    <p class="newsletter-page-hint">
      Every newsletter offered by the connected newsletter service. Added
      feeds are already sources; available feeds can be subscribed in one
      action; ignored feeds stay listed so you can restore them.
    </p>
    <NewsletterCatalogue />
  </div>
</template>

<script setup>
import NewsletterCatalogue from "~~/components/NewsletterCatalogue.vue";
</script>

<style scoped>
.newsletter-page {
  padding: var(--space-sm);
  max-width: 60em;
}

.newsletter-page-hint {
  color: var(--color-text-muted);
  font-size: var(--font-body);
}
</style>
