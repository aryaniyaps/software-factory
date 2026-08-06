# Crabbox Command Execution Design

## Goal

Replace bespoke repository-command execution with Crabbox so tests, scans, builds, and other project commands run in a reusable local-container lease on the worker host. Keep Gondolin only for the Pi session boundary.

## Scope

In scope:

- A Crabbox-backed implementation of the existing `WorkspaceProvider` boundary.
- Worker-host local Crabbox leases, selected by configuration/profile.
- Repository command execution with timeouts and bounded output.
- Lease warm/reuse, failure cleanup, and explicit artifact/worktree copy-back where needed.
- Routing tests, scans, builds, and future repository commands through Crabbox.
- Focused unit tests using a fake Crabbox CLI/runtime.
- Configuration and operational documentation.

Out of scope:

- Reimplementing VM, filesystem, or network isolation.
- Replacing Gondolin for Pi sessions in this change.
- A remote Crabbox service or multi-host scheduler.
- Automatic copy-back of arbitrary edits without an explicit activity contract.
- A new command abstraction when the existing `WorkspaceProvider` interface is sufficient.

## Architecture

`CrabboxWorkspaceProvider` implements `WorkspaceProvider` and becomes the configured backend for repository commands:

```text
Temporal activity
  -> BuildRuntime / repository command adapter
    -> WorkspaceProvider
      -> Crabbox CLI
        -> local-container lease
          -> /work/crabbox synced worktree
```

Gondolin remains used only by Pi sessions. Crabbox is the sole repository-command backend; legacy repository execution paths are removed rather than maintained. There is no silent host-process fallback.

The provider owns:

1. Lease creation/warmup for a worktree.
2. Command execution through Crabbox.
3. Output and timeout enforcement at the existing interface boundary.
4. Explicit synchronization/copy-back for commands that produce required worktree files.
5. Idempotent lease stop and cleanup.

A lease may be reused for commands associated with the same worktree while the activity scope is active. Cleanup must release the lease even when command execution fails. A stale or failed lease is discarded rather than reused.

## Data flow and mutation policy

Before execution, Crabbox syncs the host worktree into the lease. Test and scan commands are read-only from the factory's perspective and need no copy-back.

Build commands publish their immutable artifact through the configured builder/registry path; only the artifact digest returns to the workflow.

Commands that intentionally modify the worktree must declare that requirement and explicitly copy the required paths back before lease cleanup. The implementation must not imply that Crabbox automatically mirrors edits back to the host.

## Configuration

Add the minimum environment/configuration needed for local Crabbox operation:

- Crabbox is the required provider for repository commands;
- Crabbox executable path, defaulting to `crabbox`;
- lease slug/prefix and keep/reuse behavior;
- sync exclusions if required by the repository;
- optional command-specific timeout/output settings.

The worker host must have Crabbox and its local-container runtime installed. Startup/doctor checks should report a clear actionable error when the executable or container runtime is unavailable.

## Error handling

- Unsupported profiles fail during activity setup.
- Crabbox process failures include command, lease identity, exit status, and bounded stderr.
- Timeouts terminate the command and invalidate the lease.
- Lease cleanup runs in `finally` and is idempotent.
- No repository command falls back to `node:child_process` on the host.
- Copy-back failures fail the activity and preserve enough lease/error metadata for diagnosis.

## Testing

Add focused tests for:

- command construction and argument escaping;
- lease warm/reuse and stop behavior;
- timeout and non-zero exit propagation;
- bounded stdout/stderr;
- cleanup after command and copy-back failures;
- explicit copy-back for mutating commands;
- profile/configuration selection;
- proof that the Crabbox path does not call the host process provider.

Keep tests for the Pi/Gondolin session boundary and add Crabbox integration checks when the Crabbox executable/container runtime is available.

## Operational success criteria

- Workflow tests, scans, and builds execute inside Crabbox leases.
- The same worktree can run multiple commands without paying warmup cost each time where reuse is enabled.
- Failed commands do not leave orphaned leases.
- Required build artifacts and declared worktree changes are available to subsequent workflow steps.
- Gondolin is limited to Pi-specific execution; it is not a repository-command fallback.
- No arbitrary repository command executes directly on the worker host.
