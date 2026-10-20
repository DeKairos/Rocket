# SDD ledger — plan: docs/superpowers/plans/2026-10-20-cinematic-flight-lab.md

- Approved execution: native, sequential stages and one independent final review.
- Baseline: aed805e preserves existing tracked/untracked demo source.
- Ruling: sandbox denied all managed-worktree writes; use codex/cinematic-flight-lab in the current writable checkout with a baseline commit — preserves source without repeated escalated edits — cost if wrong: branch isolation is weaker than checkout isolation.
- Pre-flight: backend decisions feed post-action frames; decision.source_step and exact observation make timing explicit.
- Pre-flight: backend context_id is the matching contract for frontend counterfactuals; revision_id identifies immutable completed trajectories.
- Pre-flight: both renderers and all plots consume the controller's shared cursor; effects cannot advance simulation.
- Task 1: complete. Baseline Python 8/9 passed with one existing localhost ConnectionResetError; Node baseline passed. No baseline physics failure.
- Task 2: complete, commit e65405d. Scientific regression tests 5/5 passed: model-byte identity, exact observations, diagnostics parity, revisions, context rejection. Full Python run 12/14 passed; both HTTP payload parity subcases were reset by the local environment. Retain this limitation for final verification.
- Task 3: state and numerical modules passed 9/9 Node behavior tests after RED (missing production modules). Tests run in-process because sandbox child-process spawning is denied.

## Verification — 2026-10-20

- Tasks 3–5 implemented: revision-safe records, shared cursor, measured scientific drawer, locally bundled Three.js, two renderers, bounded visual effects, keyboard controls and session replay.
- Latest steering: replaced the inset scene card with a full-page landscape, extended decorative terrain beyond all camera edges, layered distant ridges and enabled cast shadows. Physical collision contours stay unchanged.
- Independent final review: fixed undefined terminal labels in the retained 2D comparison renderer and preserved camera position/orientation during inspection. Both regressions reproduced RED and passed GREEN. No other important findings.
- Node final behavior suite: 12/12 passed. Asset integrity/import closure: 1/1 passed. JavaScript syntax check passed.
- Full Python suite: 14/15 passed (49.0s). Random-controller HTTP parity response reset with Windows error 10054 during read; this failure also occurred in the baseline. Trained HTTP parity, direct simulator parity, metadata, diagnostics, CLI evaluation and training/resume passed. This prevents claiming a fully green Python suite.
- Wheel built with uv --no-build-isolation. Imported rocket_demo directly from the wheel and read all 15 served resources through importlib.resources. Setuptools emitted namespace-package warnings for asset directories; wheel resource closure passed.
- Browser exercised actual trained seed100 launch, right push at step45, matched reference with latest push omitted, linked measurements, trained/random split, phone inspection preview and manual 2D fallback at completed outcomes.
- Observed display timing before shadows: 119Hz, p95 8.5ms at 1440x900 on this machine. This is a local observation, not a device-independent benchmark or simulator generation time. Shadowed final world requires fresh timing; no general performance guarantee.
- Ruling remains: writable current checkout used after managed-worktree write denial. Branch preserved for user review; no merge/push performed.
