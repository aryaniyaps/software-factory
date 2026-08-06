# Crabbox Command Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Crabbox the required execution backend for repository tests, scans, builds, and future repository commands, while retaining Gondolin only for Pi sessions.

**Architecture:** Add a thin Crabbox CLI/runtime adapter behind the existing workspace execution boundary. The worker warms one local-container lease per activity/worktree, runs commands through `crabbox run`, explicitly copies declared mutations back when needed, and always stops the lease. Remove the old Gondolin repository-command runtime; keep the Pi Gondolin extension/session code unchanged.

**Tech Stack:** TypeScript/Node.js 24, native `node:child_process`, Temporal Activities, Vitest, Crabbox CLI with the `local-container` provider.

## Global Constraints

- Crabbox is the sole repository-command backend; do not preserve a host-process or old Gondolin fallback.
- Gondolin remains limited to the Pi session boundary.
- Do not add a VM, filesystem, network policy, or custom sandbox implementation.
- All repository command output remains bounded by the existing activity limit.
- Lease cleanup runs in `finally` and is idempotent.
- Crabbox syncs into the lease; mutation copy-back is explicit and never assumed automatic.
- Production requires the `crabbox` executable and local container runtime on the worker host.

---

## Task 1: Define the Crabbox CLI/runtime boundary

**Files:**
- Create: `src/workspaces/crabbox-runtime.ts`
- Create: `tests/workspaces/crabbox-runtime.test.ts`

**Interfaces:**
- Consumes: `WorkspaceSpec`, `ExecOptions`, and `ExecResult` from `src/workspaces/provider.ts`.
- Produces: `CrabboxCommandRunner`, `CrabboxLease`, `CrabboxRuntime`, and `officialCrabboxRuntime` used by the provider and activity runtime.

- [ ] **Step 1: Write failing tests for command construction and result preservation.**

  Test a fake process runner receiving:

  ```ts
  await runtime.warm({ path: "/worktree", network: "restricted" });
  await lease.exec(["npm", "test", "--", "--run"], { cwd: "/workspace", timeoutMs: 1_000, maxOutputBytes: 4 });
  await lease.stop();
  ```

  Assert the command sequence is:

  ```text
  crabbox warmup --slug <slug> --keep
  crabbox run --id <slug> -- npm test -- --run
  crabbox stop <slug>
  ```

  Assert non-zero exit status returns `{ exitCode, stdout, stderr }` rather than throwing away the exit code, and output is capped to `maxOutputBytes`.

- [ ] **Step 2: Run the focused test to verify it fails.**

  Run: `npm test -- --run tests/workspaces/crabbox-runtime.test.ts`

  Expected: FAIL because the Crabbox runtime does not exist.

- [ ] **Step 3: Implement the minimal injectable runtime.**

  Define an injectable process runner that accepts `(file, args, options)` and returns the existing `ExecResult`. Implement:

  ```ts
  export interface CrabboxLease {
    readonly id: string;
    exec(command: string[], options?: ExecOptions): Promise<ExecResult>;
    copyBack(paths: Array<{ from: string; to: string }>): Promise<void>;
    stop(): Promise<void>;
  }

  export interface CrabboxRuntime {
    warm(spec: WorkspaceSpec): Promise<CrabboxLease>;
  }
  ```

  Use `process.env.CRABBOX_BIN ?? "crabbox"`, a deterministic slug derived from `CRABBOX_SLUG_PREFIX` and the worktree basename, and native child-process APIs. Treat timeout as a failed command and invalidate the lease. Keep `stop()` idempotent.

- [ ] **Step 4: Add explicit copy-back support.**

  Implement `copyBack(paths)` with `crabbox cp --id <slug> <from> <to>` for each declared `{ from, to }` path. Reject empty or non-absolute paths and do not copy arbitrary lease contents. A copy-back failure must reject and leave the caller responsible for stopping the lease.

- [ ] **Step 5: Run the focused tests.**

  Run: `npm test -- --run tests/workspaces/crabbox-runtime.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit the runtime boundary.**

  ```bash
  git add src/workspaces/crabbox-runtime.ts tests/workspaces/crabbox-runtime.test.ts src/workspaces/provider.ts
  git commit -m "feat: add crabbox runtime adapter"
  ```

## Task 2: Add the Crabbox workspace and activity adapters

**Files:**
- Create: `src/workspaces/crabbox-provider.ts`
- Create: `src/temporal/activities/crabbox.ts`
- Create: `tests/workspaces/crabbox-provider.test.ts`
- Create: `tests/temporal/crabbox-activities.test.ts`
- Delete: `src/workspaces/gondolin-provider.ts`
- Delete: `src/temporal/activities/gondolin.ts`
- Delete: `tests/workspaces/gondolin-provider.test.ts`
- Delete: `tests/temporal/gondolin-activities.test.ts`

**Interfaces:**
- Consumes: `CrabboxRuntime` from Task 1 and the existing `WorkspaceProvider`/`BuildRuntime` shapes.
- Produces: `CrabboxWorkspaceProvider` implementing `WorkspaceProvider` and `createCrabboxActivityRuntime(provider)` implementing the existing build activity runtime contract.

- [ ] **Step 1: Write failing provider lifecycle tests.**

  Use a fake `CrabboxRuntime` that records `warm`, `exec`, `copyBack`, and `stop`. Assert:

  ```ts
  const provider = new CrabboxWorkspaceProvider(runtime);
  const workspace = await provider.create({ path: "/worktree", network: "restricted", privileged: false });
  await provider.exec(workspace.id, "npm", ["test"], { cwd: "/workspace", timeoutMs: 1000 });
  await provider.destroy(workspace.id);
  ```

  produces one warm, one execution, and one stop. Assert privileged workspaces are rejected and unknown IDs fail.

- [ ] **Step 2: Write failing activity-runtime tests.**

  Assert `createCrabboxActivityRuntime(provider).createForWorktree({ path: "/worktree", sandboxProfile: "crabbox" })` creates a restricted, non-privileged workspace, routes execution to `/workspace`, and closes exactly once. Assert any other profile fails with `unsupported sandbox profile`.

- [ ] **Step 3: Run focused tests to verify they fail.**

  Run: `npm test -- --run tests/workspaces/crabbox-provider.test.ts tests/temporal/crabbox-activities.test.ts`

  Expected: FAIL because the adapters do not exist.

- [ ] **Step 4: Implement the provider and activity runtime.**

  Store active leases by ID. `create()` warms a Crabbox lease and records it; `exec()` delegates `[command, ...args]`; `destroy()` deletes the record before awaiting idempotent stop. Expose `copyBack(id, paths)` only through the Crabbox-specific provider/runtime path so mutation remains explicit.

- [ ] **Step 5: Remove the old repository-command runtime.**

  Delete the Gondolin workspace/activity adapters and their tests. Do not delete `src/agents/gondolin-session.ts` or its tests; that is still the Pi session boundary.

- [ ] **Step 6: Run focused tests.**

  Run: `npm test -- --run tests/workspaces/crabbox-provider.test.ts tests/temporal/crabbox-activities.test.ts tests/agents/gondolin-session.test.ts`

  Expected: PASS.

- [ ] **Step 7: Commit the adapters.**

  ```bash
  git add src/workspaces src/temporal/activities tests/workspaces tests/temporal tests/agents/gondolin-session.test.ts
  git commit -m "feat: route repository execution through crabbox"
  ```

## Task 3: Wire production activities and configuration to Crabbox

**Files:**
- Modify: `src/temporal/production-worker.ts:13-90`
- Modify: `src/temporal/activities/build.ts:1-45` to use the Crabbox activity runtime contract and preserve explicit cleanup
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `tests/temporal/build-activities.test.ts`
- Modify: `tests/e2e/production-loop.test.ts` and each repository-command fixture that hardcodes `sandboxProfile: "gondolin"`

**Interfaces:**
- Consumes: `CrabboxWorkspaceProvider`, `officialCrabboxRuntime`, and `createCrabboxActivityRuntime` from Task 2.
- Produces: production workers whose repository tests/builds use Crabbox and whose workflow fixtures use `sandboxProfile: "crabbox"`.

- [ ] **Step 1: Update failing production wiring tests/fixtures.**

  Change every repository-command fixture from `sandboxProfile: "gondolin"` to `sandboxProfile: "crabbox"`; the production worker must compile only after its imports and runtime construction are migrated.

- [ ] **Step 2: Run the focused suite to verify the old wiring fails.**

  Run: `npm test -- --run tests/temporal/build-activities.test.ts tests/e2e/production-loop.test.ts`

  Expected: FAIL because production code still imports the removed Gondolin repository runtime and fixtures use the old profile.

- [ ] **Step 3: Wire the Crabbox provider into `startWorkers()`.**

  Replace the Gondolin workspace/activity imports and construction with:

  ```ts
  const workspace = new CrabboxWorkspaceProvider(officialCrabboxRuntime);
  const crabbox = createCrabboxActivityRuntime(workspace);
  ```

  Pass `crabbox` into `createBuildActivities`. Keep `PiAgentRunner` unchanged so Pi still uses its Gondolin extension.

- [ ] **Step 4: Update configuration and documentation.**

  Add the minimum variables to `.env.example`:

  ```text
  CRABBOX_BIN=crabbox
  CRABBOX_SLUG_PREFIX=software-factory
  CRABBOX_KEEP=false
  ```

  Document that the worker host must have Crabbox plus Docker/Podman, that `crabbox warmup` creates the local lease, and that tests/builds/scans run there. State clearly that worktree edits require explicit copy-back and that the host never executes arbitrary repository commands directly.

- [ ] **Step 5: Run focused tests.**

  Run: `npm test -- --run tests/temporal/build-activities.test.ts tests/e2e/production-loop.test.ts tests/temporal/crabbox-activities.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit production wiring.**

  ```bash
  git add src/temporal/production-worker.ts src/temporal/activities/build.ts .env.example README.md tests
  git commit -m "feat: use crabbox for factory repository commands"
  ```

## Task 4: Add runtime checks and verify the complete migration

**Files:**
- Create: `src/workspaces/crabbox-doctor.ts`
- Create: `tests/workspaces/crabbox-doctor.test.ts`
- Modify: `src/temporal/production-worker.ts` to call the doctor before starting workers
- Modify: `README.md` for the failure message and manual verification

**Interfaces:**
- Consumes: `CRABBOX_BIN` and the native process runner from Task 1.
- Produces: `assertCrabboxAvailable()` that fails with an actionable message naming the missing executable/runtime.

- [ ] **Step 1: Write failing doctor tests.**

  Test success when `crabbox --version` exits zero, and failure with a message containing `Crabbox is required`, the configured executable, and installation guidance when the executable is absent or exits non-zero.

- [ ] **Step 2: Run the focused test to verify it fails.**

  Run: `npm test -- --run tests/workspaces/crabbox-doctor.test.ts`

  Expected: FAIL because the doctor does not exist.

- [ ] **Step 3: Implement the doctor and startup check.**

  Use the injectable process runner, avoid starting a lease during the doctor check, and call it before Temporal workers are started. Do not silently fall back to Gondolin or host execution.

- [ ] **Step 4: Run all tests and build.**

  Run:

  ```bash
  npm test -- --run
  npm run build
  ```

  Expected: PASS with no imports or fixtures referencing the removed repository-command Gondolin runtime.

- [ ] **Step 5: Run static migration checks.**

  Run:

  ```bash
  rg -n 'GondolinWorkspaceProvider|createGondolinActivityRuntime|sandboxProfile: "gondolin"' src tests
  ```

  Expected: no repository-command references; only Pi session Gondolin references remain.

- [ ] **Step 6: Run the optional live smoke test when Crabbox is installed.**

  Run:

  ```bash
  crabbox --version
  npm run build
  npm test -- --run tests/workspaces/crabbox-runtime.test.ts
  ```

  Expected: Crabbox reports its version and the adapter tests pass. If Crabbox is unavailable, report that environmental limitation rather than weakening the production requirement.

- [ ] **Step 7: Commit the verification guard.**

  ```bash
  git add src/workspaces/crabbox-doctor.ts tests/workspaces/crabbox-doctor.test.ts src/temporal/production-worker.ts README.md
  git commit -m "chore: require crabbox at worker startup"
  ```
