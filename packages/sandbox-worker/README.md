# Sandbox worker

This worker is the self-hosted boundary between the factory and an isolation backend. It intentionally has no host-process fallback. A production deployment must inject a backend implementing `SandboxBackend` using a microVM or equivalent isolation provider.

The HTTP contract is:

- `POST /workspaces`
- `POST /workspaces/:id/exec`
- `DELETE /workspaces/:id`

The process workspace provider in `src/workspaces/process-provider.ts` is for tests only and must not be used for arbitrary repositories.
