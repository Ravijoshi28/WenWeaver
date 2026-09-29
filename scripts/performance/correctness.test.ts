import { test } from "node:test";
import assert from "node:assert/strict";
import { updateFileTree, type FileTreeNode } from "../../lib/file-tree";
import { mapConcurrent } from "../../lib/map-concurrent";
import { planSave, SaveSession, snapshotFiles } from "../../lib/save-plan";

const fixture = (): FileTreeNode[] => [{ name: "src", path: "src", type: "folder", children: [
  { name: "a.ts", path: "src/a.ts", type: "file", content: "a" },
  { name: "b.ts", path: "src/b.ts", type: "file", content: "b" },
] }, { name: "README.md", path: "README.md", type: "file", content: "readme" }];

test("editing preserves unrelated branches, normalizes paths and does not mutate the input", () => {
  const files = fixture();
  const changed = updateFileTree(files, "\\src\\a.ts", "changed");
  assert.equal(changed.updated, true);
  assert.equal(changed.files[0].children![0].content, "changed");
  assert.equal(files[0].children![0].content, "a");
  assert.equal(changed.files[1], files[1]);
  assert.equal(changed.files[0].children![1], files[0].children![1]);
  assert.equal(updateFileTree(changed.files, "src/a.ts", "changed").files, changed.files);
  assert.equal(updateFileTree(files, "missing.ts", "x").files, files);
});

test("incremental save round trip handles additions, edits, deletions, empty files and empty projects", () => {
  const before = snapshotFiles(fixture());
  const after = new Map([["src/a.ts", "updated"], ["new.ts", ""]]);
  assert.equal(planSave(before).mode, "full");
  const patch = planSave(after, before);
  const storage = new Map(before);
  for (const file of patch.files) storage.set(file.path, file.content);
  for (const path of patch.deletedPaths) storage.delete(path);
  assert.deepEqual(storage, after);
  assert.equal(planSave(after, after).files.length, 0);
  assert.deepEqual(planSave(new Map(), after).deletedPaths, [...after.keys()]);
});

test("failed saves do not advance the acknowledged snapshot; overlapping saves are ordered", async () => {
  const session = new SaveSession();
  const first = new Map([["a.ts", "first"]]);
  await assert.rejects(session.save(first, async () => { throw new Error("offline"); }));
  await session.save(first, async plan => { assert.equal(plan.mode, "full"); });
  const events: string[] = [];
  await Promise.all([
    session.save(new Map([["a.ts", "second"]]), async plan => {
      assert.equal(plan.files[0].content, "second");
      await new Promise(resolve => setTimeout(resolve, 10));
      events.push("second");
    }),
    session.save(new Map(), async plan => {
      assert.deepEqual(plan.deletedPaths, ["a.ts"]);
      events.push("deleted");
    }),
  ]);
  assert.deepEqual(events, ["second", "deleted"]);
});

test("bounded concurrency retains result order", async () => {
  let active = 0, peak = 0;
  const result = await mapConcurrent([1, 2, 3, 4, 5], 2, async value => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 6 - value));
    active--;
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
});

test("a partially failed patch forces a full retry even when the user reverts a file", async () => {
  const session = new SaveSession();
  const original = new Map([["a.ts", "original"]]);
  await session.save(original, async () => undefined);
  await assert.rejects(session.save(new Map([["a.ts", "partial"]]), async () => { throw new Error("partial upload"); }));
  await session.save(original, async plan => {
    assert.equal(plan.mode, "full");
    assert.equal(plan.files[0].content, "original");
  });
});

test("failed upload batches drain in-flight writes before releasing their caller", async () => {
  let drained = false;
  let calls = 0;
  await assert.rejects(mapConcurrent([0, 1, 2, 3], 2, async value => {
    calls++;
    if (value === 0) { await new Promise(resolve => setTimeout(resolve, 2)); throw new Error("upload failed"); }
    await new Promise(resolve => setTimeout(resolve, 15));
    drained = true;
  }));
  assert.equal(drained, true);
  assert.equal(calls, 2);
});
