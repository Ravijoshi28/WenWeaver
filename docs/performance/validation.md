# Validation record

Validation on 2026-09-29:

- `npm run test:performance`: six correctness tests passed. Covers tree identity/content, save patch replay, ordered saves, failed/partial-save retries, bounded concurrency and draining failed upload batches.
- `npx tsc --noEmit`: passed.
- ESLint on all changed application TypeScript files, new helpers and performance scripts: passed with no warnings or errors.
- `npm run build`: passed, including TypeScript and all 22 generated pages. An initial webpack hash failure was resolved by moving its generated cache to `.next/cache-performance-backup`; the clean build needed network access for the project's existing Google Fonts downloads. No dependency or font changes were made.
- `npm run lint`: fails on generated Prisma client files (including generated CommonJS imports and `any` types), with existing warnings elsewhere. The performance changes do not fix the repository's generated-code lint scope.
- The benchmark checks Yjs convergence and receiving-store text after 720 edits through a real local WebSocket server. Before/after timing results are in [results.json](results.json) and [PERFORMANCE.md](../../PERFORMANCE.md).

Not exercised: real Supabase uploads/deletions, authentication flows, Vercel Sandbox creation, browser rendering/typing latency, hosted WebSocket latency, multiple server instances, or deployed load. Save protocol correctness was exercised with local fixtures, not a cloud integration test. Preview changes passed static checks and the application build; their hosted latency benefit is unmeasured.
