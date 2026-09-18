<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      ref="popoverEl"
      class="confirm-popover"
      role="dialog"
      aria-modal="false"
      :aria-label="title"
      :style="popoverStyle"
    >
      <p class="confirm-popover-title">{{ title }}</p>
      <p v-if="description" class="confirm-popover-description">
        {{ description }}
      </p>
      <div class="confirm-popover-actions">
        <button
          ref="cancelButton"
          type="button"
          class="secondary"
          v-on:click="cancel"
        >
          {{ cancelLabel }}
        </button>
        <button type="button" v-on:click="confirmAction">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  anchor: { type: null, default: null },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  confirmLabel: { type: String, default: "Confirm" },
  cancelLabel: { type: String, default: "Cancel" },
});

const emit = defineEmits(["update:modelValue", "confirm", "cancel"]);

const popoverEl = ref(null);
const cancelButton = ref(null);
const popoverStyle = ref({});

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      await nextTick();
      position();
      document.addEventListener("keydown", onKeydown, true);
      document.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("scroll", onReposition, true);
      window.addEventListener("resize", onReposition);
      cancelButton.value?.focus();
    } else {
      teardown();
      const active = document.activeElement;
      if (active && popoverEl.value?.contains(active)) {
        props.anchor?.focus?.();
      }
    }
  },
);

onBeforeUnmount(teardown);

function teardown() {
  document.removeEventListener("keydown", onKeydown, true);
  document.removeEventListener("pointerdown", onPointerDown, true);
  window.removeEventListener("scroll", onReposition, true);
  window.removeEventListener("resize", onReposition);
}

function onReposition() {
  if (props.modelValue) {
    position();
  }
}

function position() {
  const el = popoverEl.value;
  if (!el) return;
  if (window.matchMedia("(max-width: 700px)").matches) {
    // Bottom-sheet placement is handled by CSS on small screens
    popoverStyle.value = {};
    return;
  }
  const rect = el.getBoundingClientRect();
  if (!rect.width) return;
  const margin = 8;
  const anchorRect = props.anchor?.getBoundingClientRect?.();
  if (!anchorRect) {
    popoverStyle.value = {
      left: `${Math.round((window.innerWidth - rect.width) / 2)}px`,
      top: `${Math.round(window.innerHeight / 4)}px`,
    };
    return;
  }
  let left = anchorRect.left + anchorRect.width / 2 - rect.width / 2;
  left = Math.max(
    margin,
    Math.min(left, window.innerWidth - rect.width - margin),
  );
  let top = anchorRect.bottom + margin;
  if (top + rect.height > window.innerHeight - margin) {
    top = Math.max(margin, anchorRect.top - rect.height - margin);
  }
  popoverStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  };
}

function onPointerDown(event) {
  const target = event.target;
  if (popoverEl.value?.contains(target)) return;
  if (props.anchor?.contains?.(target)) return;
  cancel();
}

function onKeydown(event) {
  if (event.key === "Escape") {
    event.stopPropagation();
    cancel();
    return;
  }
  if (event.key === "Tab") {
    const focusables = popoverEl.value?.querySelectorAll("button");
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function cancel() {
  emit("update:modelValue", false);
  emit("cancel");
}

function confirmAction() {
  emit("update:modelValue", false);
  emit("confirm");
}
</script>

<style scoped>
.confirm-popover {
  position: fixed;
  z-index: 60;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px var(--color-shadow-lg);
  padding: var(--space-md);
  width: max-content;
  max-width: min(20rem, calc(100vw - 1rem));
  animation: confirm-popover-in 0.12s ease-out;
}

@keyframes confirm-popover-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.confirm-popover-title {
  font-size: var(--font-lg);
  font-weight: 600;
  margin: 0 0 var(--space-xs);
}

.confirm-popover-description {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-md);
}

.confirm-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.confirm-popover-actions button {
  width: auto;
  min-height: 44px;
  margin: 0;
  font-size: var(--font-base);
}

@media (max-width: 700px) {
  .confirm-popover {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: auto;
    max-width: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
    box-shadow: 0 -4px 16px var(--color-shadow-lg);
  }

  .confirm-popover-actions button {
    flex: 1;
    min-height: 48px;
  }
}
</style>
