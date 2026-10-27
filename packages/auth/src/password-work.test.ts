import { expect, it } from "vitest";
import { createPasswordWorkLimit, PasswordCapacityError } from "./password-work";

it("rejects excess work without invoking or queueing it, then admits new work", async () => {
  const run = createPasswordWorkLimit(2);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const first = run(() => pending);
  const second = run(() => pending);
  let invoked = false;
  await expect(run(async () => { invoked = true; })).rejects.toBeInstanceOf(PasswordCapacityError);
  expect(invoked).toBe(false);
  release();
  await Promise.all([first, second]);
  expect(await run(async () => "available")).toBe("available");
  expect(invoked).toBe(false);
});

it("releases capacity after synchronous and asynchronous failures", async () => {
  const run = createPasswordWorkLimit(1);
  const failure = new Error("failure");
  await expect(run(() => { throw failure; })).rejects.toBe(failure);
  await expect(run(async () => { throw failure; })).rejects.toBe(failure);
  expect(await run(async () => 42)).toBe(42);
});

it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid capacity %s", capacity => {
  expect(() => createPasswordWorkLimit(capacity)).toThrow("Invalid password work limit");
});
