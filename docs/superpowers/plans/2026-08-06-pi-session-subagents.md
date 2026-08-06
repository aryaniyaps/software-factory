# Pi-Session Subagents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install `@tintinweb/pi-subagents` into the factory-owned Pi resource bundle so every Pi session can dynamically spawn subagents.

**Architecture:** Reuse the existing manifest-driven Pi bootstrap. The package is installed into `PI_RESOURCE_ROOT`, where `DefaultResourceLoader` discovers it as a Pi extension. No changes to `PiAgentRunner` or role orchestration are needed.

**Tech Stack:** JSON manifest, TypeScript/Vitest, Markdown documentation, Pi package bootstrap.

## Global Constraints

- Pin `@tintinweb/pi-subagents` to verified version `0.14.3`.
- Keep installation factory-owned through `infra/pi/resource-manifest.json`.
- Do not add custom agent definitions or factory-level child-session orchestration.

---

### Task 1: Declare the Pi subagents package

**Files:**
- Modify: `infra/pi/resource-manifest.json`
- Test: `tests/agents/pi-resources.test.ts`

**Interfaces:**
- Produces a manifest package entry with `name: "@tintinweb/pi-subagents"`, `version: "0.14.3"`, and `spec: "npm:@tintinweb/pi-subagents@0.14.3"`.

- [ ] **Step 1: Extend the manifest test assertion**

Add `"@tintinweb/pi-subagents"` to the existing `expect.arrayContaining([...])` package-name list in `tests/agents/pi-resources.test.ts`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run tests/agents/pi-resources.test.ts`

Expected: FAIL because the manifest does not yet declare `@tintinweb/pi-subagents`.

- [ ] **Step 3: Add the pinned manifest entry**

Add this object to the `packages` array in `infra/pi/resource-manifest.json`:

```json
{ "name": "@tintinweb/pi-subagents", "version": "0.14.3", "spec": "npm:@tintinweb/pi-subagents@0.14.3" }
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run tests/agents/pi-resources.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the package declaration**

```bash
git add infra/pi/resource-manifest.json tests/agents/pi-resources.test.ts
git commit -m "feat: enable pi session subagents"
```

### Task 2: Document usage

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents that the bootstrap installs `@tintinweb/pi-subagents` and that Pi sessions expose the `Agent`, `get_subagent_result`, and `steer_subagent` tools.

- [ ] **Step 1: Add the concise runtime note**

Update the Agent platform section after the existing package-bootstrap paragraph with the package name, bootstrap command, and this usage example:

```text
Inside a Pi session, use `Agent` to spawn a foreground or background subagent. Use `get_subagent_result` to collect background results and `steer_subagent` to redirect a running agent. The extension also supports custom agent definitions under `.pi/agents/` when a project needs them.
```

- [ ] **Step 2: Review the documentation diff**

Run: `git diff -- README.md`

Expected: Only the subagent installation and usage note is added; no unrelated README changes appear.

- [ ] **Step 3: Commit the documentation**

```bash
git add README.md
git commit -m "docs: describe pi session subagents"
```

### Task 3: Verify the complete change

**Files:**
- No additional files.

**Interfaces:**
- Confirms the manifest, tests, TypeScript build, and working tree are consistent.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run the TypeScript build**

Run: `npm run build`

Expected: Exit code 0 with no TypeScript errors.

- [ ] **Step 3: Inspect repository status**

Run: `git status --short --branch`

Expected: The branch is clean and contains only the two implementation commits after the design commit.
