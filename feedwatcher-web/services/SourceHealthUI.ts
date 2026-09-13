export function sourceHealth(source: any): string | null {
  const health = source.sourceInfo?.health;
  if (source.isLabel || !health || health === "ok") {
    return null;
  }
  return health;
}

export function sourceHealthIcon(source: any): string {
  if (source.sourceInfo?.health === "failing") {
    return "bi bi-exclamation-triangle-fill";
  }
  return "bi bi-hourglass-split";
}

export function sourceHealthTitle(source: any): string {
  const info = source.sourceInfo || {};
  if (info.health === "failing") {
    const parts = [
      `Fetch failing (${info.fetchErrorCount || 0} consecutive errors)`,
    ];
    if (info.lastFetchError) {
      parts.push(`Last error: ${info.lastFetchError}`);
    }
    if (info.lastFetchErrorDate) {
      parts.push(
        `Failing since: ${new Date(info.lastFetchErrorDate).toLocaleString()}`,
      );
    }
    return parts.join("\n");
  }
  const lastUpdate = info.lastItemDate || info.dateFetched;
  if (lastUpdate) {
    return `No new items since ${new Date(lastUpdate).toLocaleDateString()}`;
  }
  return "Source not updated for a long time";
}
