# ADR-001: Keep sandbox execution behind a self-hosted worker boundary

## Status
Accepted

## Date
2026-08-05

## Context

The factory must execute arbitrary third-party repositories. Static scanning can find common hazards but cannot make downloaded dependencies or build scripts trustworthy. Running them in the factory process or a privileged container would make the control plane the security boundary.

The workspace must be self-hostable and replaceable. Daytona is not the maintained open-source foundation we want to depend on. Raw Firecracker orchestration would duplicate a substantial amount of lifecycle, filesystem, networking, and credential-injection infrastructure.

## Decision

The factory talks to a separate `WorkspaceProvider` worker over an HTTP contract. The worker owns the actual isolation backend and must reject unsafe requests. The factory never silently falls back to host-process execution when arbitrary-code mode is enabled.

The first provider contract supports create, exec, and destroy. A backend implementation may use OpenSandbox, CubeSandbox, Kata, or Firecracker, but it must provide a dedicated kernel or equivalent isolation, no host mounts, no Docker socket, restricted network, resource limits, and disposable state.

The process provider exists only for unit tests and trusted local development.

## Alternatives considered

### Daytona
Rejected as the primary dependency because the current product is not the maintained open-source self-hosted platform required by this project.

### Raw Firecracker
Deferred. It offers a strong isolation primitive but would require implementing lifecycle, image distribution, snapshots, networking, storage, and credential handling before the factory could use it.

### Docker directly in the factory
Rejected for arbitrary code. Containers and host daemon access are not an adequate control-plane boundary without an additional sandbox layer.

## Consequences

- The MVP has a stable provider interface and can be tested without a real sandbox.
- Production arbitrary-code execution remains disabled until a backend worker is configured.
- The worker becomes an independently deployable security-sensitive component.
- Backend selection and hardening require a separate integration test and deployment review.
