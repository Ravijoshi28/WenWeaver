import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { execFileSync } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createYjsServer } from "yjs-server";
import { updateFileInTree } from "./baseline-tree";
import { type FileTreeNode, updateFileTree } from "../../lib/file-tree";
import { planSave, snapshotFiles } from "../../lib/save-plan";

async function main() {
  let writes = 0, bytes = 0;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; bytes += Buffer.byteLength(value); storage.set(key, value); },
    removeItem: (key: string) => storage.delete(key),
  }, configurable: true });
  const { useProjectState: store } = await import("../../useStates/projectStates");
  const summary = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { n: values.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
  };
  const fixture = (count: number): FileTreeNode[] => Array.from({ length: Math.ceil(count / 10) }, (_, folder) => ({
    name: `folder${folder}`, path: `folder${folder}`, type: "folder", children: Array.from({ length: Math.min(10, count - folder * 10) }, (_, i) => ({
      name: `file${i}.ts`, path: `folder${folder}/file${i}.ts`, type: "file", content: "// fixture\n" + "x".repeat(1013),
    })),
  }));
  const target = "folder0/file0.ts";
  function reset(count: number) {
    store.setState({ files: fixture(count), selectedFile: { name: "file0.ts", path: target, type: "file", content: "" } });
    writes = 0; bytes = 0;
  }
  function apply(mode: "before" | "after", content: string) {
    // Two notifications reproduce the Monaco listener + Y.Text observer path.
    for (let notification = 0; notification < 2; notification++) {
      if (mode === "after") store.getState().updateFileContent(target, content);
      else {
        const state = store.getState();
        const result = updateFileInTree(state.files, target, content);
        store.setState({ files: result.files, selectedFile: { ...state.selectedFile!, content } });
      }
    }
  }
  const editor = [];
  for (const count of [10, 100, 1000]) {
    const samples = { before: [] as number[], after: [] as number[] };
    const counters = { before: { writes: 0, bytes: 0 }, after: { writes: 0, bytes: 0 } };
    for (let round = 0; round < 6; round++) {
      const order = round % 2 ? ["after", "before"] as const : ["before", "after"] as const;
      for (const mode of order) {
        reset(count);
        for (let i = 0; i < 30; i++) apply(mode, `warmup ${i}`);
        writes = 0; bytes = 0;
        for (let i = 0; i < 100; i++) {
          const started = performance.now();
          apply(mode, `edit ${round} ${i}`);
          samples[mode].push(performance.now() - started);
        }
        counters[mode].writes += writes; counters[mode].bytes += bytes;
      }
    }
    editor.push({ files: count, before: { ...summary(samples.before), ...counters.before }, after: { ...summary(samples.after), ...counters.after } });
  }
  const saves = [10, 100, 1000].map(count => {
    const tree = fixture(count);
    const original = snapshotFiles(tree);
    const changed = updateFileTree(tree, target, original.get(target)! + "\n// edited").files;
    const plan = planSave(snapshotFiles(changed), original);
    const beforeBytes = Buffer.byteLength(JSON.stringify({ ownerId: "fixture-owner", id: "fixture-project", files: changed }));
    const afterBytes = Buffer.byteLength(JSON.stringify({ ownerId: "fixture-owner", id: "fixture-project", ...plan }));
    return { files: count, beforeBytes, afterBytes, beforeUploads: count, afterUploads: plan.files.length };
  });

  // Real loopback WebSocket transport and the project's Yjs server implementation.
  // Includes receiver store processing; excludes Monaco rendering and WAN latency.
  const server = createYjsServer({ createDoc: () => new Y.Doc() });
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket, request) => server.handleConnection(socket, request));
  await new Promise<void>(resolve => wss.on("listening", resolve));
  const address = wss.address();
  assert.ok(address && typeof address !== "string");
  const docs = [new Y.Doc(), new Y.Doc()];
  const providers = docs.map(doc => new WebsocketProvider(`ws://127.0.0.1:${address.port}`, "benchmark", doc, { WebSocketPolyfill: WebSocket as never, disableBc: true }));
  const websocket = { before: [] as number[], after: [] as number[] };
  try {
    await Promise.all(providers.map(provider => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Yjs sync timeout")), 10000);
      provider.on("sync", (synced: boolean) => { if (synced) { clearTimeout(timeout); resolve(); } });
    })));
    const source = docs[0].getText("code"), receiver = docs[1].getText("code");
    for (let round = 0; round < 6; round++) {
      const order = round % 2 ? ["after", "before"] as const : ["before", "after"] as const;
      for (const mode of order) {
        reset(1000);
        for (let i = 0; i < 60; i++) {
          const elapsed = await new Promise<number>((resolve, reject) => {
            const timeout = setTimeout(() => { receiver.unobserve(observer); reject(new Error("Edit delivery timeout")); }, 5000);
            const observer = () => {
              apply(mode, receiver.toString());
              receiver.unobserve(observer); clearTimeout(timeout);
              resolve(performance.now() - started);
            };
            receiver.observe(observer);
            const started = performance.now();
            source.insert(source.length, "x");
          });
          if (i >= 10) websocket[mode].push(elapsed);
          assert.equal(receiver.toString(), source.toString());
          assert.equal(store.getState().files[0].children![0].content, source.toString());
        }
      }
    }
  } finally {
    providers.forEach(provider => provider.destroy()); docs.forEach(doc => doc.destroy());
    server.close();
    await new Promise<void>(resolve => wss.close(() => resolve()));
  }
  const results = {
    recordedAt: new Date().toISOString(), baselineCommit: "8f0ac28138f7fd0c7a83658a68e8d73e36e0ac97",
    testedHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    environment: { node: process.version, platform: platform(), release: release(), cpu: cpus()[0].model },
    methodology: "6 alternating before/after batches; editor 30 warmup + 100 measured edits/batch; WebSocket 10 warmup + 50 measured edits/batch, 2 real loopback clients, 1000-file receiver workspace. ~1 KiB per initial file. Node JSON serialization and in-memory sessionStorage sink, not browser storage or Monaco paint. No hosted services called.",
    editor, saves, websocket: { before: summary(websocket.before), after: summary(websocket.after), convergence: "All 720 edits converged" },
  };
  mkdirSync("docs/performance", { recursive: true });
  writeFileSync("docs/performance/results.json", JSON.stringify(results, null, 2) + "\n");
  const percent = (before: number, after: number) => ((before - after) / before * 100).toFixed(1);
  const timingRows = results.editor.flatMap(row => ["medianMs", "p95Ms"].map(key => {
    const metric = key as "medianMs" | "p95Ms";
    return `| ${row.files} files: ${metric === "medianMs" ? "median" : "p95"} state update | ${row.before[metric].toFixed(3)} ms | ${row.after[metric].toFixed(3)} ms | ${percent(row.before[metric], row.after[metric])}% |`;
  })).join("\n");
  const ws = results.websocket;
  const saveRows = saves.map(row => `| ${row.files} | ${row.beforeBytes.toLocaleString("en-US")} B | ${row.afterBytes} B | ${percent(row.beforeBytes, row.afterBytes)}% | ${row.beforeUploads} → ${row.afterUploads} |`).join("\n");
  writeFileSync("PERFORMANCE.md", `# WebWeaver performance evaluation

Measured ${results.recordedAt}. This report is regenerated by \`npm run bench:performance\`.

## What these numbers mean

These are actual local measurements, not estimates of production performance. The WebSocket benchmark uses two real Yjs clients and the same server library as WebWeaver over loopback. It measures source edit to completion of the receiving client's store update. It does **not** measure Monaco painting, browser sessionStorage I/O, internet latency, or the hosted Render service. Save sizes are exact serialized request-body bytes for synthetic fixtures, not measured Supabase latency.

No hosted services, user projects, or credentials are used by the benchmark. No cloud-save or preview-startup latency reduction is claimed.

## Results

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
${timingRows}
| Local WebSocket + receiver update: median | ${ws.before.medianMs.toFixed(3)} ms | ${ws.after.medianMs.toFixed(3)} ms | ${percent(ws.before.medianMs, ws.after.medianMs)}% |
| Local WebSocket + receiver update: p95 | ${ws.before.p95Ms.toFixed(3)} ms | ${ws.after.p95Ms.toFixed(3)} ms | ${percent(ws.before.p95Ms, ws.after.p95Ms)}% |
| Persisted state writes per edit with duplicate notifications | 2 | 1 | 50.0% |

The p95 is the latency at or below which 95% of samples finished. A negative reduction on a rerun means a regression, not an improvement. Local timing varies with CPU load and garbage collection.

For a subsequent save with **one edited file**, after a successful first full save:

| Project files | Before request size | After request size | Reduction | Planned file uploads |
| --- | ---: | ---: | ---: | ---: |
${saveRows}

The changed file retains its original content and appends a 10-byte comment (1,034 bytes total); unchanged fixture files contain 1,024 bytes. These reductions depend on how many files change and their sizes. First saves and retries after failure remain full saves. Upload counts come from the generated plan; no Supabase requests were issued to obtain this table.

## Changes explained

### 1. Text editing and collaboration

- **Before:** Monaco's change listener and its Y.Text observer could each traverse and clone the entire project tree and persist the same text twice.
- **After:** [lib/file-tree.ts](lib/file-tree.ts) follows the path to the changed file and copies only its ancestors. An identical notification returns the original tree. [The Zustand store](useStates/projectStates.ts) skips state updates and JSON persistence when nothing changed.
- [Monaco.tsx](app/main/Editor/Monaco.tsx) now uses that shared store method. Its subscriptions observe file availability and selected-file identity, rather than every content change. Monaco and Yjs still update immediately; no typing or network debounce was added.
- The benchmark includes JSON serialization through the real Zustand persist middleware, using an in-memory replacement for sessionStorage. It models the two notifications explicitly; it does not mount Monaco or measure React render counts. One full-tree serialization per actual edit still remains.
- The collaboration endpoint accepts \`NEXT_PUBLIC_YJS_URL\`, with the existing hosted endpoint as fallback.

### 2. Incremental saving

- [lib/save-plan.ts](lib/save-plan.ts) remembers the last successful save in the mounted editor session. First save: full snapshot. Later saves: changed/new files plus explicit deleted paths. Unchanged files are not deleted just because they are omitted from a patch.
- Save calls in one editor session are ordered. A failure invalidates the baseline, forcing a full retry to repair potentially partial server writes, including when a user reverts a file after failure.
- [The save route](app/api/file/save/route.ts) uploads at most four files concurrently. [map-concurrent.ts](lib/map-concurrent.ts) stops scheduling after failure and waits for in-flight uploads before returning, so the existing project lock is not released while writes are still active.
- Patch saves skip the recursive storage listing. Full saves retain reconciliation and paginate listings. Listing errors fail the save rather than acknowledging incomplete reconciliation.
- Existing clients that omit the mode still use full-save behavior. The editor session baseline resets on remount/project change; it is not a durable, cross-client revision protocol. Storage writes are not transactional, and the existing server lock is process-local. Multi-instance or conflicting cross-client saves still need revision checks/distributed coordination.

### 3. Preview startup and measurement

- Removed the extra \`npx next --version\` subprocess and remote command round trip. Actual startup and HTTP readiness still validate execution.
- Readiness now requests the page and rejects HTTP errors instead of accepting any successful curl connection to an error page. Redirects are not followed; iframe rendering remains a separate client event.
- Successful preview responses expose \`timingsMs\` for validation, provisioning, file writing, package checking, dependency installation, startup, and total time, plus a \`Server-Timing\` header.
- Preview throttling now returns HTTP 429, so rejected requests are not counted as successful fast previews.
- Sandbox reuse/dependency snapshots are **not implemented**. They require a lifecycle, ownership, dependency invalidation and cleanup strategy plus hosted validation. Every Run still creates a new sandbox.

### 4. Inspect your live timings

In browser DevTools, the save and preview requests expose \`Server-Timing\` in their response headers. Save responses also expose \`durationMs\`, \`filesSaved\`, \`filesDeleted\`, and \`mode\`.

The browser retains the latest successful HTTP request measurement for each operation:

\`\`\`js
performance.getEntriesByName("webweaver:save-request")
performance.getEntriesByName("webweaver:preview-request")
\`\`\`

These include request/response time and are not iframe-render timings. They are local performance entries, not remote analytics. Inspect application success/error fields as well as HTTP status when interpreting requests.

## Reproduce and validate

See [validation.md](docs/performance/validation.md) for the recorded build, lint and correctness checks and their limitations.

\`\`\`bash
npm run test:performance
npm run bench:performance
npx tsc --noEmit
npm run build
\`\`\`

- Machine: ${results.environment.cpu}; ${results.environment.platform} ${results.environment.release}; Node ${results.environment.node}.
- Original algorithm frozen from commit \`${results.baselineCommit}\` in [baseline-tree.ts](scripts/performance/baseline-tree.ts).
- 10/100/1,000-file fixtures, ten files per folder, approximately 1 KiB per original file. The edited path is folder0/file0.ts.
- Six alternating before/after batches. Editor: 30 warmup + 100 measured edits per batch (600 samples per variant per size). WebSocket: 10 warmup + 50 measured edits per batch (300 samples per variant), two clients and a 1,000-file receiving workspace. The Y.Text grows by one character per edit.
- WebSocket convergence and receiving-store content are checked after all 720 edits, including warmups. A timeout or mismatch fails the benchmark.
- Correctness tests cover immutable tree updates, duplicate notifications, incremental save replay, deletion, retries after partial failure, save ordering, upload concurrency and draining workers on failure.
- [Machine-readable results](docs/performance/results.json) preserve timings, sample counts, serialized byte counts and environment details. Production dependencies are unchanged.

## Still to evaluate in the deployed app

- Browser typing-to-paint latency, React renders, memory, file-switch time, first-editable-file time, and Core Web Vitals using a production build.
- Hosted collaboration with 2/5/10 simultaneous users, large active files, packet delay, reconnects and concurrent edits. The local transport benchmark does not establish deployed capacity.
- Actual Supabase save latency and durability after reload, including simultaneous saves from separate clients.
- Cold preview startup, first iframe render, failure rate and sandbox cost, using the new stage timings.
- API throughput and per-route latency under authenticated load, with throttled requests reported separately. No load test has been run against hosted infrastructure.

These remain unmeasured; this report does not substitute local milliseconds or request-byte reductions for those production results.
`);
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}
main().catch(() => { console.error("Performance benchmark failed."); process.exitCode = 1; });
