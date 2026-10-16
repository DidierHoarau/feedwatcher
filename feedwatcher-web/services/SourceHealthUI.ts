export function sourceHealth(source: any): string | null {
  const health = source.sourceInfo?.health;
  if (source.isLabel || !health || health === "ok") {
    return null;
  }
  return health;
}

export function sourceHealthIcon(source: any): string {
  if (source.sourceInfo?.health === "disabled") {
    return "bi bi-slash-circle";
  }
  if (source.sourceInfo?.health === "failing") {
    return "bi bi-exclamation-triangle-fill";
  }
  return "bi bi-hourglass-split";
}

export function sourceHealthTitle(source: any): string {
  const info = source.sourceInfo || {};
  if (info.health === "disabled") {
    const parts = [
      `Fetching paused automatically (${info.fetchErrorCount || 0} consecutive errors)`,
    ];
    if (info.autoDisabledDate) {
      parts.push(`Paused on: ${new Date(info.autoDisabledDate).toLocaleString()}`);
    }
    if (info.lastFetchError) {
      parts.push(`Last error: ${info.lastFetchError}`);
    }
    parts.push("Trigger a fetch to resume automatic fetching");
    return parts.join("\n");
  }
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

// Plain-language diagnosis derived from the health status and the classified
// last fetch error, so the user knows what to do without reading raw errors.
export function sourceDiagnosisText(
  health: string | null | undefined,
  info: any,
): string {
  info = info || {};
  if (health === "failing" || health === "disabled") {
    if (info.lastFetchErrorClass === "permanent") {
      return "The source URL no longer works. Update the URL to recover.";
    }
    if (info.lastFetchErrorClass === "rateLimited") {
      return "The source is rate limiting FeedWatcher — fetching will retry automatically.";
    }
    if (info.lastFetchErrorClass === "transient") {
      return "A temporary network problem is preventing the fetch — it will retry automatically.";
    }
    return `Fetching keeps failing: ${info.lastFetchError || "unknown error"}`;
  }
  if (health === "stale") {
    const lastUpdate = info.lastItemDate || info.dateFetched;
    if (lastUpdate) {
      return `No new items since ${new Date(lastUpdate).toLocaleDateString()}`;
    }
    return "Source not updated for a long time";
  }
  return "";
}
