export function normalizeSourceUrl(url: string): string {
  const trimmed = String(url ?? "").trim();
  try {
    const parsed = new URL(trimmed);
    const pathname =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}
