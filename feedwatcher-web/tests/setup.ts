import { acceptHMRUpdate, defineStore } from "pinia";

// The stores and components rely on Nuxt auto-imports; expose the pinia
// helpers they use so the modules can be loaded outside Nuxt.
(globalThis as any).defineStore = defineStore;
(globalThis as any).acceptHMRUpdate = acceptHMRUpdate;

// Node >= 25 exposes an experimental `localStorage` global; the jsdom
// environment refuses to override keys already present on the global, so the
// unusable Node builtin (undefined without --localstorage-file) wins there.
// Fall back to an in-memory implementation when jsdom's is unavailable.
if (!(globalThis as any).localStorage) {
  const entries = new Map<string, string>();
  const localStorageShim = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => (entries.has(key) ? entries.get(key)! : null),
    key: (index: number) =>
      index < entries.size ? [...entries.keys()][index] : null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageShim,
    writable: true,
    configurable: true,
  });
}
