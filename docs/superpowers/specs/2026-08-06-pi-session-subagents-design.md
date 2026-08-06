# Pi-Session Subagents Design

## Goal

Enable dynamic subagents inside every factory Pi session using `@tintinweb/pi-subagents`.

## Approach

Add the pinned `@tintinweb/pi-subagents` package to the existing factory Pi resource manifest. The existing `bootstrap:pi-resources` flow installs manifest packages into `PI_RESOURCE_ROOT`, and `DefaultResourceLoader` loads those installed Pi extensions for sessions. This exposes the package's `Agent`, `get_subagent_result`, and `steer_subagent` tools without adding factory-level orchestration.

## Scope

- Modify `infra/pi/resource-manifest.json` with the verified package version `0.14.3`.
- Extend the existing resource-manifest test to require the package.
- Document bootstrap and basic session usage in `README.md`.

## Explicitly out of scope

- Factory-level child-session orchestration in `PiAgentRunner`.
- Custom `.pi/agents/*.md` definitions.
- Role-specific subagent gating.
- New abstractions or runtime configuration.

## Verification

Run `npm run test:run` and `npm run build`. The manifest test must confirm the package declaration, and TypeScript compilation must remain clean.
