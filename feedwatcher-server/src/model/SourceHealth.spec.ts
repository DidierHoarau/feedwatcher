import {
  SourceBackoffMs,
  SourceGetHealth,
  SourceHealthLastUpdate,
  SourceIsAutoDisabled,
  SourceIsDueForFetch,
  SourceIsFailing,
  SourceIsStale,
  SourceShouldAutoDisable,
} from "./SourceHealth";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;
const NOW = 1700000000000;

describe("SourceHealth", () => {
  //
  describe("SourceHealthLastUpdate", () => {
    //
    test("should prefer lastItemDate over dateFetched", () => {
      const info = {
        lastItemDate: "2024-01-02T00:00:00.000Z",
        dateFetched: "2024-01-03T00:00:00.000Z",
      };
      expect(SourceHealthLastUpdate(info).toISOString()).toBe(
        "2024-01-02T00:00:00.000Z",
      );
    });

    test("should fall back to dateFetched when no lastItemDate", () => {
      const info = { dateFetched: "2024-01-03T00:00:00.000Z" };
      expect(SourceHealthLastUpdate(info).toISOString()).toBe(
        "2024-01-03T00:00:00.000Z",
      );
    });

    test("should return null when no dates or invalid dates", () => {
      expect(SourceHealthLastUpdate({})).toBeNull();
      expect(SourceHealthLastUpdate(null)).toBeNull();
      expect(
        SourceHealthLastUpdate({ lastItemDate: "not-a-date", dateFetched: "" }),
      ).toBeNull();
    });
  });

  describe("SourceIsStale", () => {
    //
    test("should be stale when last item is older than threshold", () => {
      const info = { lastItemDate: new Date(NOW - YEAR - HOUR).toISOString() };
      expect(SourceIsStale(info, YEAR, NOW)).toBe(true);
    });

    test("should not be stale when last item is within threshold", () => {
      const info = { lastItemDate: new Date(NOW - YEAR + HOUR).toISOString() };
      expect(SourceIsStale(info, YEAR, NOW)).toBe(false);
    });

    test("should not be stale exactly at the threshold", () => {
      const info = { lastItemDate: new Date(NOW - YEAR).toISOString() };
      expect(SourceIsStale(info, YEAR, NOW)).toBe(false);
    });

    test("should fall back to dateFetched when no lastItemDate", () => {
      const info = { dateFetched: new Date(NOW - YEAR - DAY).toISOString() };
      expect(SourceIsStale(info, YEAR, NOW)).toBe(true);
      const recent = { dateFetched: new Date(NOW - DAY).toISOString() };
      expect(SourceIsStale(recent, YEAR, NOW)).toBe(false);
    });

    test("should not be stale when never fetched", () => {
      expect(SourceIsStale({}, YEAR, NOW)).toBe(false);
      expect(SourceIsStale(null, YEAR, NOW)).toBe(false);
    });

    test("should ignore non-positive thresholds", () => {
      const info = { dateFetched: new Date(NOW - YEAR).toISOString() };
      expect(SourceIsStale(info, 0, NOW)).toBe(false);
      expect(SourceIsStale(info, -1, NOW)).toBe(false);
    });
  });

  describe("SourceIsFailing", () => {
    //
    test("should be failing when error count reaches threshold", () => {
      expect(SourceIsFailing({ fetchErrorCount: 5 }, 5)).toBe(true);
      expect(SourceIsFailing({ fetchErrorCount: 6 }, 5)).toBe(true);
    });

    test("should not be failing below threshold", () => {
      expect(SourceIsFailing({ fetchErrorCount: 4 }, 5)).toBe(false);
      expect(SourceIsFailing({}, 5)).toBe(false);
      expect(SourceIsFailing(null, 5)).toBe(false);
    });

    test("should ignore non-positive thresholds", () => {
      expect(SourceIsFailing({ fetchErrorCount: 10 }, 0)).toBe(false);
    });
  });

  describe("SourceGetHealth", () => {
    //
    test("should report ok for a healthy source", () => {
      const info = {
        dateFetched: new Date(NOW - HOUR).toISOString(),
        lastItemDate: new Date(NOW - HOUR).toISOString(),
      };
      expect(SourceGetHealth(info, YEAR, 5, NOW)).toBe("ok");
    });

    test("should report stale for an old source", () => {
      const info = { dateFetched: new Date(NOW - YEAR - DAY).toISOString() };
      expect(SourceGetHealth(info, YEAR, 5, NOW)).toBe("stale");
    });

    test("should report failing with priority over stale", () => {
      const info = {
        dateFetched: new Date(NOW - YEAR - DAY).toISOString(),
        fetchErrorCount: 5,
      };
      expect(SourceGetHealth(info, YEAR, 5, NOW)).toBe("failing");
    });

    test("should report disabled with priority over failing and stale", () => {
      const info = {
        dateFetched: new Date(NOW - YEAR - DAY).toISOString(),
        fetchErrorCount: 12,
        autoDisabled: true,
      };
      expect(SourceGetHealth(info, YEAR, 5, NOW)).toBe("disabled");
    });

    test("should not report disabled when the flag is cleared", () => {
      const info = {
        dateFetched: new Date(NOW - HOUR).toISOString(),
        fetchErrorCount: 0,
        autoDisabled: false,
      };
      expect(SourceGetHealth(info, YEAR, 5, NOW)).toBe("ok");
    });
  });

  describe("SourceIsAutoDisabled", () => {
    //
    test("should reflect the autoDisabled flag", () => {
      expect(SourceIsAutoDisabled({ autoDisabled: true })).toBe(true);
      expect(SourceIsAutoDisabled({ autoDisabled: false })).toBe(false);
      expect(SourceIsAutoDisabled({})).toBe(false);
      expect(SourceIsAutoDisabled(null)).toBe(false);
    });
  });

  describe("SourceShouldAutoDisable", () => {
    //
    test("should disable at the threshold and above", () => {
      expect(SourceShouldAutoDisable(10, 10)).toBe(true);
      expect(SourceShouldAutoDisable(11, 10)).toBe(true);
    });

    test("should not disable below the threshold", () => {
      expect(SourceShouldAutoDisable(9, 10)).toBe(false);
      expect(SourceShouldAutoDisable(0, 10)).toBe(false);
    });

    test("should never disable when the threshold is not positive", () => {
      expect(SourceShouldAutoDisable(100, 0)).toBe(false);
      expect(SourceShouldAutoDisable(100, -1)).toBe(false);
    });

    test("should ignore non numeric error counts", () => {
      expect(SourceShouldAutoDisable(Number.NaN, 10)).toBe(false);
      expect(SourceShouldAutoDisable(undefined, 10)).toBe(false);
    });
  });

  describe("SourceBackoffMs", () => {
    //
    test("should return 0 when no errors", () => {
      expect(SourceBackoffMs(0, HOUR, DAY)).toBe(0);
      expect(SourceBackoffMs(-1, HOUR, DAY)).toBe(0);
    });

    test("should double with each consecutive error", () => {
      expect(SourceBackoffMs(1, HOUR, DAY)).toBe(HOUR);
      expect(SourceBackoffMs(2, HOUR, DAY)).toBe(2 * HOUR);
      expect(SourceBackoffMs(3, HOUR, DAY)).toBe(4 * HOUR);
    });

    test("should cap the backoff at the maximum", () => {
      expect(SourceBackoffMs(7, HOUR, DAY)).toBe(DAY);
      expect(SourceBackoffMs(20, HOUR, DAY)).toBe(DAY);
    });
  });

  describe("SourceIsDueForFetch", () => {
    //
    test("should be due when never fetched", () => {
      expect(SourceIsDueForFetch({}, HOUR, NOW, DAY)).toBe(true);
      expect(SourceIsDueForFetch(null, HOUR, NOW, DAY)).toBe(true);
    });

    test("should not be due when fetched within frequency", () => {
      const info = { dateFetched: new Date(NOW - HOUR / 2).toISOString() };
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(false);
    });

    test("should be due when fetched after frequency", () => {
      const info = { dateFetched: new Date(NOW - 2 * HOUR).toISOString() };
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(true);
    });

    test("should support per-source fetch frequency override", () => {
      const info = {
        dateFetched: new Date(NOW - 2 * HOUR).toISOString(),
        fetchFrequency: 6 * HOUR,
      };
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(false);
    });

    test("should apply backoff to failing sources based on last attempt", () => {
      const info = {
        dateFetched: new Date(NOW - 10 * HOUR).toISOString(),
        lastAttemptDate: new Date(NOW - 2 * HOUR).toISOString(),
        fetchErrorCount: 2,
      };
      // Backoff for 2 errors = 2h from last attempt: not due yet.
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(false);
    });

    test("should be due when backoff elapsed", () => {
      const info = {
        lastAttemptDate: new Date(NOW - 5 * HOUR).toISOString(),
        fetchErrorCount: 2,
      };
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(true);
    });

    test("should cap the backoff at the maximum", () => {
      const info = {
        lastAttemptDate: new Date(NOW - DAY - HOUR).toISOString(),
        fetchErrorCount: 20,
      };
      // Backoff capped at 24h: due again after 25h.
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(true);
      const recent = {
        lastAttemptDate: new Date(NOW - DAY + HOUR).toISOString(),
        fetchErrorCount: 20,
      };
      expect(SourceIsDueForFetch(recent, HOUR, NOW, DAY)).toBe(false);
    });

    test("should fall back to dateFetched when no lastAttemptDate", () => {
      const info = {
        dateFetched: new Date(NOW - 2 * HOUR).toISOString(),
        fetchErrorCount: 2,
      };
      // Backoff = 2h from dateFetched: not due yet.
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(false);
    });

    test("should ignore invalid dates and be due", () => {
      expect(SourceIsDueForFetch({ dateFetched: "invalid" }, HOUR, NOW, DAY)).toBe(
        true,
      );
    });

    test("should never be due when auto-disabled", () => {
      const info = {
        dateFetched: new Date(NOW - 10 * DAY).toISOString(),
        fetchErrorCount: 12,
        autoDisabled: true,
      };
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(false);
    });

    test("should not be due while the Retry-After delay has not elapsed", () => {
      const info = {
        lastAttemptDate: new Date(NOW - HOUR).toISOString(),
        fetchErrorCount: 1,
        retryAfterUntil: new Date(NOW + HOUR).toISOString(),
      };
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(false);
    });

    test("should be due again once the Retry-After delay elapsed", () => {
      const info = {
        lastAttemptDate: new Date(NOW - 3 * HOUR).toISOString(),
        fetchErrorCount: 1,
        retryAfterUntil: new Date(NOW - HOUR).toISOString(),
      };
      // Normal backoff applies again: 1 error = 1h from the last attempt.
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(true);
    });

    test("should ignore an invalid Retry-After date", () => {
      const info = {
        dateFetched: new Date(NOW - 2 * HOUR).toISOString(),
        retryAfterUntil: "not-a-date",
      };
      expect(SourceIsDueForFetch(info, HOUR, NOW, DAY)).toBe(true);
    });
  });
});
