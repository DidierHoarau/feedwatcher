import * as http from "http";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/800-RssProcessor";

// Real axios (no mock): a local server that accepts connections but never
// responds proves the processor request actually times out instead of
// hanging a pool worker forever (M4).
describe("RSS processor request timeout (M4)", () => {
  test(
    "gives up on a hanging server instead of blocking forever",
    async () => {
      const server = http.createServer(() => {
        // Never respond
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", () => resolve())
      );
      const port = (server.address() as any).port;
      const source = new Source();
      source.info = { url: `http://127.0.0.1:${port}/feed.xml` };

      const started = Date.now();
      try {
        await expect(processor.fetchLatest(source, null)).rejects.toThrow();
        const elapsed = Date.now() - started;
        expect(elapsed).toBeGreaterThanOrEqual(9000);
        expect(elapsed).toBeLessThan(20000);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    30000
  );
});
