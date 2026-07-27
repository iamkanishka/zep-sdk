import { describe, expect, it } from "vitest";
import { sleep } from "./sleep.js";

describe("sleep", () => {
  it("resolves after the given duration when not aborted", async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it("rejects promptly if the signal aborts mid-sleep", async () => {
    const controller = new AbortController();
    const promise = sleep(5_000, controller.signal);
    setTimeout(() => {
      controller.abort(new Error("cancelled"));
    }, 10);

    const start = Date.now();
    await expect(promise).rejects.toThrow("cancelled");
    expect(Date.now() - start).toBeLessThan(1_000);
  });

  it("rejects immediately if the signal is already aborted before sleep is called", async () => {
    const controller = new AbortController();
    controller.abort(new Error("already gone"));

    const start = Date.now();
    await expect(sleep(5_000, controller.signal)).rejects.toThrow("already gone");
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("wraps a non-Error abort reason in a real Error", async () => {
    const controller = new AbortController();
    controller.abort("some string reason");

    await expect(sleep(1_000, controller.signal)).rejects.toBeInstanceOf(Error);
  });
});
