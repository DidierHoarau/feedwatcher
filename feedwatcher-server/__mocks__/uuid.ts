// Mock for uuid (v14 is ESM-only, this provides CJS compatibility for tests)
let counter = 0;

export const v4 = (): string => {
  counter++;
  const ts = Date.now().toString(16);
  const seq = counter.toString(16).padStart(4, "0");
  return `00000000-0000-4000-8000-${ts}${seq}`;
};

export const v5 = (): string => v4();

export const validate = (uuid: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    uuid,
  );
};
