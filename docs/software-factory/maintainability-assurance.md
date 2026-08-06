# Maintainability Assurance Specification

**Status:** implementation source of truth  
**Target:** `aryaniyaps/software-factory`  
**Research date:** 2026-08-06

## 1. Decision

Maintainability is not a single number and no deterministic analyzer or language model is its oracle. The factory must accumulate evidence from five independent sources:

1. repository-specific architectural fitness rules;
2. structural and historical measurements;
3. an independent semantic architecture critic;
4. counterfactual future-change probes;
5. longitudinal production and maintenance outcomes.

A candidate may ship only when the configured evidence policy returns `pass`. Contradictory or insufficient evidence returns `abstain`; it must never be silently converted to a pass.

The release-critical loop evaluates the delta introduced by the candidate. A separate repository-health loop finds and repairs accumulated debt. Existing legacy debt does not block unrelated changes unless the candidate worsens it or touches it without satisfying the touched-code policy.

## 2. Why this construct is valid

ISO/IEC 25010 treats maintainability as several related capabilities rather than one property: modularity, reusability, analysability, modifiability, and testability. Fowler defines a smell as a surface indication of a deeper problem, not proof of that problem. Empirical studies associate smells with change- and fault-proneness, while other studies find that smells explain only part of observed maintenance difficulty. MaintainBench goes further: it evaluates maintainability by applying later requirement changes and measuring the effort and success of modification.

Therefore:

- a smell creates a finding that needs evidence;
- a metric supplies a directional signal, normally relative to the base revision;
- an explicit repository invariant can be a hard gate;
- a future-change probe supplies dynamic evidence of modifiability;
- real later changes calibrate whether our proxy predicted reality.

The factory must not use the classic Maintainability Index as an aggregate gate. Its variants can rank the same system differently, it overweights size-derived inputs, and the scalar hides which quality deteriorated. Sentrux's aggregate signal is also a sensor, not an oracle; persist all underlying dimensions and raw findings.

## 3. Quality model

Every `MaintainabilityReport` contains a vector, never only a scalar:

| Dimension | Meaning | Primary evidence |
|---|---|---|
| Modularity | Responsibilities form coherent, independently changeable units | dependency graph, communities, architecture rules |
| Information hiding | Design decisions have one owner and stable interfaces | public API delta, semantic critic, change dispersion |
| Analysability | A worker can locate, understand, and explain a change point | scout trajectory, hotspot/context size, critic |
| Modifiability | A representative requirement change requires contained edits | counterfactual probes, real change history |
| Testability | Behavior can be controlled and observed without brittle setup | seams, mutation results, test topology |
| Reusability | Stable capabilities can serve multiple legitimate callers | interface evidence and real reuse, never speculative abstraction |
| Operational evolvability | Runtime changes are diagnosable, reversible, and safe | telemetry, idempotency, rollout and rollback evidence |

Ousterhout's deep-module and information-hiding principles resolve a conflict with simplistic Clean Code rules: small files/classes/functions are not automatically good. A deep module may be internally large if it hides substantial complexity behind a small coherent interface. Size findings are heuristic warnings unless they accompany mixed responsibilities, poor cohesion, change amplification, or comprehension failure.

## 4. Smell taxonomy and machine treatment

### 4.1 Change amplification and scattered knowledge

| Smell | Operational definition | Detection | Preferred response | Gate |
|---|---|---|---|---|
| Shotgun surgery | One conceptual change requires edits across unrelated modules | changed-module dispersion; probe touches; history co-change graph | move the design decision behind one owner/interface | block when candidate introduces statistically material new dispersion or violates an invariant |
| Divergent change | One module changes for multiple unrelated reasons | commit-topic clustering; critic; low cohesion | split responsibilities around independently changing decisions | warn; block only with strong semantic/dynamic evidence |
| Parallel hierarchies | Adding one variant forces parallel additions in another tree | graph/path pattern plus repeated history | collapse mapping or centralize variant registration | warn or block if probe demonstrates required parallel edits |
| Data clumps | The same fields/parameters repeatedly travel together | AST signature mining | introduce a domain value/object only if it owns invariants | warn; never auto-block from count alone |
| Primitive obsession | Domain rules are spread across raw strings/numbers/flags | repeated validation/switch logic; critic | value type, enum, policy object, parser boundary | warn; block if it causes duplicated invariants or invalid states |
| Temporal coupling | Correctness depends on hidden call order | call-path analysis, stateful tests, critic | explicit state machine, transaction, or atomic API | block when it threatens correctness/retry safety |

### 4.2 Coupling and boundary smells

| Smell | Operational definition | Detection | Preferred response | Gate |
|---|---|---|---|---|
| Dependency cycle | Modules form a strongly connected component | dependency-cruiser/Sentrux/Tarjan | invert dependency, extract contract, merge false boundary | hard block on a new cycle unless explicitly waived with expiry |
| Forbidden direction | An import crosses a declared architectural boundary | repository fitness rules | depend on an allowed port/contract | hard block |
| Feature envy | Logic depends more on another module's state than its owner | symbol/reference counts plus critic | move behavior toward the information owner | warn |
| Inappropriate intimacy | Modules know unstable internals of each other | private-path imports, shared mutable state, critic | stable interface or merge units if not truly separate | block for explicit boundaries; otherwise warn |
| Message chain | Callers traverse internal object structure | AST chains and API use | add intention-revealing operation at the owning boundary | warn |
| Middle man/pass-through | A layer delegates without adding an abstraction or policy | pass-through ratio plus critic | remove it or deepen the abstraction | warn; never block count alone |
| Unstable public surface | Candidate expands exported API without a requirement | export diff and traceability graph | keep internal or define stable contract | block unexplained public API growth |
| Leaky abstraction | Consumers must understand hidden implementation details | critic, error/type leakage, probe dispersion | pull complexity downward and define errors out of existence | block when it violates a blueprint invariant |

### 4.3 Cognitive and control-flow smells

| Smell | Detection | Treatment |
|---|---|---|
| Long/complex function | changed-code cognitive complexity, nesting, path count | decompose by named concepts only when that creates a deeper interface; avoid tiny pass-through functions |
| Large module/class | size plus cohesion, number of change reasons, public surface | split only when responsibilities change independently |
| Long parameter list | parameter count, repeated groups, boolean flags | parameter object/value type or separate intentional operations |
| Complex conditional | branch count and repeated predicates | named predicate/policy/state machine/polymorphism where justified |
| Switch on type/variant | repeated switch locations and synchronized edits | central registry or polymorphism; a single exhaustive switch may be the cleanest design |
| Temporary field/partial state | fields valid only in some phases | separate state types or explicit state machine |
| Boolean blindness | multiple flags encode modes or invalid combinations | discriminated union with exhaustive handling |

These are change-scoped heuristics. Default hard thresholds are prohibited until a repository has a baseline distribution. A new extreme outlier can be escalated to the critic but cannot be rejected solely because it exceeds a universal line count.

### 4.4 Dispensables

| Smell | Detection | Gate policy |
|---|---|---|
| Duplicate code/knowledge | token clone detection plus semantic critic | block new cross-boundary duplication of business rules; generated/test fixtures may be exempt |
| Dead code | Knip/language adapter, reachability, runtime evidence | block newly introduced unused exports/files/dependencies; deletion needs tests |
| Speculative generality | unused extension points, single-use indirection, critic | warn/block when added without requirement or blueprint justification |
| Lazy module | shallow interface and no unique design decision | warn; merge/remove only if behavior remains clear |
| Comment deodorant | comment explains confusing mechanics rather than invariant/why | critic suggests refactor; do not delete essential rationale |
| Data-only module | data container with leaked invariants | warn when callers duplicate behavior; plain DTOs remain valid |

Duplication is contextual. Duplicated mechanics may be cheaper than coupling unrelated domains; duplicated knowledge/invariants are dangerous. The critic must distinguish them.

### 4.5 Test smells

The assurance system detects:

- candidate behavior with no test/scenario coverage;
- tests that pass on both base and candidate for a claimed behavior change;
- broad mocks that duplicate implementation details;
- flaky or order-dependent tests;
- slow tests placed in the wrong feedback tier;
- assertions without meaningful outcome checks;
- tests coupled to private implementation structure;
- hidden acceptance tests modified by the implementer;
- new tests with weak mutation sensitivity;
- nondeterministic tests without repeated-run confidence.

New behavior tests must normally fail on the base revision and pass on the candidate. Refactor-only changes must pass on both. Changed-code mutation testing should run through an adapter, with equivalent mutants recorded rather than counted as automatic failures.

### 4.6 Operational and distributed-system smells

Maintainability includes production change safety. Hard or high-severity findings include:

- non-idempotent side effects behind retryable activities;
- missing timeout, cancellation, fencing, or cleanup behavior;
- unbounded retries or retrying policy/security failures;
- untyped errors that destroy failure classification;
- state transitions without durable event/evidence records;
- build artifacts whose digest is not derived from the build;
- deploys without rollback target;
- success declared before a configured observation window;
- missing correlation IDs or required telemetry;
- secrets or unrestricted network access in coding/verifier sandboxes.

## 5. Deterministic sensor architecture

Define a language-neutral adapter interface:

```ts
export interface FitnessAdapter {
  readonly id: string;
  readonly version: string;
  supports(context: RepositoryContext): Promise<boolean>;
  measure(input: FitnessInput): Promise<readonly FitnessFinding[]>;
}

export interface FitnessFinding {
  id: string;
  adapterId: string;
  ruleId: string;
  dimension: MaintainabilityDimension;
  severity: "block" | "warn" | "info";
  confidence: number;
  baseline?: number;
  candidate?: number;
  delta?: number;
  locations: readonly SourceLocation[];
  evidenceRefs: readonly string[];
  explanation: string;
}
```

Initial TypeScript adapters:

- `sentrux`: modularity, acyclicity, dependency depth, balance, redundancy and configured boundary rules;
- `dependency-cruiser`: exact import constraints, cycles and graph export;
- TypeScript compiler: correctness and public type surface;
- ESLint: changed-code complexity and project conventions;
- `knip`: unused files, exports and dependencies;
- `jscpd`: clone candidates;
- `stryker-js`: changed-code mutation evidence;
- Git history adapter: churn, co-change, hotspot and defect/revert association.

Do not make every tool mandatory. The policy declares required capabilities and selects available adapters. Unsupported languages return `insufficient_evidence` for the affected capability instead of a false pass.

## 6. Architecture critic

The critic is a read-only role using a different model/provider from the implementer when possible. It receives:

- immutable work order and acceptance IDs;
- relevant blueprints, ADRs and fitness rules;
- base and candidate file/dependency graphs;
- diff and changed public interfaces;
- deterministic findings and history hotspots;
- behavioral evidence references.

It does not receive the implementer's persuasive narrative or hidden reasoning. It returns schema-validated findings with category, affected symbols, evidence, severity, confidence, violated invariant, minimum repair, and falsification condition. A finding without concrete evidence is informational.

For high-risk changes, run two critics independently. Disagreement expands evidence collection; majority vote alone does not decide correctness.

## 7. Counterfactual future-change probes

### 7.1 Purpose

A probe measures the cost of adapting the base and candidate to the same plausible future requirement. Probe code is always discarded.

### 7.2 Probe sources

Generate and curate probes from:

- declared variability points in blueprints;
- actual prior requirements and recurring changes;
- issue/incident history;
- dependency/API evolution;
- architecture critic findings;
- generic patterns such as adding a provider, state, policy, transport, storage backend, failure mode, or compatibility constraint.

At least part of the bank is hidden from the implementer. Probes are versioned and rotated. A generated probe must pass a validity screen: realistic, independent of implementation wording, behaviorally testable, similar difficulty on both revisions, and not already implemented.

### 7.3 Experiment

For each sampled probe:

1. create isolated worktrees from base and candidate;
2. use identical agent model, tools, budget and prompt except the revision;
3. run the probe multiple times when variance is material;
4. execute the probe's hidden behavioral tests;
5. discard all probe worktrees;
6. compare distributions rather than one lucky run.

Record success, wall time, tokens, attempts, files/modules/symbols touched, semantic dispersion, public API growth, regressions, new rule violations, context retrieved, and test/mutation outcomes.

### 7.4 Decision

The candidate fails only when the configured effect-size threshold and confidence requirement are exceeded. A probe that is invalid or too noisy is excluded and recorded. Low-risk changes may skip probes; high-risk architectural changes require them. Nightly repository-health runs execute a broader bank.

## 8. Refactoring controller

The release-critical controller follows:

```text
assess -> pass | repairable | insufficient_evidence | policy_block
repairable -> plan minimal refactor -> refactor -> behavioral replay -> reassess
insufficient_evidence -> collect specified evidence -> reassess or abstain
policy_block -> abstain
```

Rules:

- refactor in small reversible steps;
- acceptance criteria and hidden scenarios are immutable;
- the refactoring agent cannot downgrade findings or change gate policy;
- rerun behavior after each logical refactoring batch;
- touch only finding-related scope unless a probe proves broader movement is necessary;
- cap attempts, time and tokens;
- preserve a rollback point for every attempt;
- do not mix opportunistic cleanup into functional changes;
- record why a finding disappeared, was accepted, or remained.

Legacy code without adequate tests first gets characterization tests and seams. Scratch refactoring may be used to understand the code but is discarded before the controlled change.

## 9. Release policy

### Hard blocks from day one

- behavior/security gate failure;
- new dependency cycle or forbidden dependency;
- missing required acceptance evidence;
- unproven artifact digest/provenance;
- hidden scenario/test tampering;
- retry-unsafe side effect in a retryable workflow;
- required telemetry or rollback absent;
- schema-invalid critic/evidence output;
- explicit blueprint invariant violation.

### Baseline-relative blocks

- materially worse changed-code complexity;
- new duplicated business invariant;
- new unused production code/dependency;
- public API growth without traceability;
- maintainability probe regression beyond configured effect size;
- touched hotspot made worse without approved justification.

### Warnings during calibration

- universal size/function-length thresholds;
- Sentrux aggregate signal;
- maintainability index;
- critic-only aesthetic findings;
- patterns or abstractions proposed without dynamic evidence.

For the first 30 successful factory runs, collect non-hard metrics in shadow mode. Derive repository-specific thresholds from the baseline and observed false positives. Threshold changes are versioned policy changes and must run against the factory evaluation corpus before promotion.

## 10. Longitudinal calibration

Join each release to later maintenance outcomes:

- lead time and successful attempt count for subsequent changes;
- change amplification and context required;
- defects, reverts, incidents and deployment rework;
- repeat findings in the same component;
- actual versus predicted probe cost;
- hotspot growth or reduction;
- scenario and mutation regressions.

Quarterly is too slow for an autonomous factory. Recompute calibration after a configurable evidence window, initially every 25 completed changes or weekly. Never auto-promote a new oracle version solely because it raises its own score; evaluate it on held-out historical changes and shadow runs.

## 11. Anti-gaming controls

- implementer cannot read hidden scenarios or hidden probes;
- verifier and critics use separate credentials and preferably different models;
- raw evidence and sub-scores are retained;
- deletion and suppression count as changes requiring justification;
- policy waivers have owner, reason, scope and expiry;
- tests must demonstrate base/candidate discrimination when behavior changes;
- metric improvements that worsen dynamic probes fail;
- probe generation and probe grading are separate roles;
- evaluator changes run in shadow before becoming authoritative;
- all prompt, model, skill, adapter and policy versions enter the evidence manifest.

## 12. Research sources

- Martin Fowler, [Refactoring](https://martinfowler.com/books/refactoring.html), [code smell definition](https://martinfowler.com/bliki/CodeSmell.html), and [online catalog](https://refactoring.com/catalog/)
- Refactoring.Guru, [code-smell taxonomy](https://refactoring.guru/refactoring/smells)
- John Ousterhout, [Modular Design lecture](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign) and [A Philosophy of Software Design extract](https://web.stanford.edu/~ouster/cgi-bin/aposd2ndEdExtract.pdf)
- Michael Feathers/Fowler, [legacy seams](https://martinfowler.com/bliki/LegacySeam.html)
- Wang et al., [MaintainCoder and MaintainBench](https://arxiv.org/html/2503.24260v2)
- Khomh et al., [impact of code smells on change-proneness](https://www.cs.wm.edu/~denys/pubs/TSE%2717-BadSmells.pdf)
- Yamashita et al., [limits of smells as maintainability explanations](https://web-backend.simula.no/sites/default/files/publications/Simula.simula.1278.pdf)
- Software Improvement Group, [ISO-aligned maintainability model](https://www.softwareimprovementgroup.com/blog/how-to-measure-code-quality/)
- Arie van Deursen, [limitations of Maintainability Index](https://avandeursen.com/2014/08/29/think-twice-before-using-the-maintainability-index/)
- Thoughtworks, [fitness-function-driven development](https://www.thoughtworks.com/en-us/insights/articles/fitness-function-driven-development)
- Google, [engineering code-review dimensions](https://google.github.io/eng-practices/review/)
- CodeScene, [hotspots and technical-debt friction](https://codescene.io/docs/guides/technical/hotspots.html)
- [Sentrux](https://github.com/sentrux/sentrux), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), [Knip](https://knip.dev/), [jscpd](https://github.com/kucherenko/jscpd), and [StrykerJS](https://stryker-mutator.io/docs/stryker-js/configuration/)

