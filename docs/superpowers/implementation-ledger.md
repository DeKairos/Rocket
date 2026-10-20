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

## Outcome correction — 2026-10-20

- User screenshot showed a resting craft outside the pad labelled confirmed. Root cause: flight_outcome treated Gymnasium's sleeping-body terminal state as successful pad landing, without pad/contact checks.
- Added shared pad_gear_contacts_v1 rule: preserve crash/bounds/timeout precedence; sleeping craft with either gear support center outside pad is off_pad; missing either leg contact is unsafe_landing; only both contacts and both support centers on pad confirm landed.
- CLI and demo share the classifier. Metadata/context and new evaluation reports record the rule; historical benchmark counts are explicitly labelled simulator rests under the legacy rule.
- Regression proof: three new classifier cases failed before the fix; all five classification tests passed after. Node behavior suite passed 12/12, including both new terminal labels. Real trained seed116 now reports unsafe_landing with contacts [false,true], despite reward296.2; seed100 remains a confirmed pad landing.
- Full Python run: 20 tests, two errors in the same HTTP parity test's random/trained subcases (Windows10054 during response read). Remaining methods passed. This remains a known baseline transport limitation; no fully green suite claim.
- Restarted local demo at port8002 and verified the updated terminal label in the real browser.

## Approved crash aftermath — 2026-10-20

- User approved bounded design: confirmed crashes split hull/detach legs, scatter sparks/dust, leave wreckage, restore on rewind/replay, static aftermath for reduced motion.
- Added deterministic fragments from the terminal recorded fixture polygons. Both 3D and 2D consume the same cosmetic fragment poses. Only outcome=crashed activates destruction; pad misses and unconfirmed touchdowns stay intact.
- Separate 1.8-second visual clock continues rendering after the last simulation frame. Timeline and numerical telemetry remain fixed. Inspection freezes the effect; seeking to the end shows settled debris. Existing scene disposal releases fragment and particle resources.
- Tests first failed for absent wreckage/clock, then passed. Actual 3D visibility/rewind regression passed. Independent review identified a shorter-comparison crash that could freeze mid-burst; reproduced RED with expected0 vs actual1.8, fixed shared terminal offset, verified GREEN.
- Verification: Node16/16 passed; asset integrity/import closure1/1 passed; app syntax and git diff whitespace checks passed. No backend/physics changes, so no repeat of the known Windows HTTP suite failure was necessary.
- Real browser: trained seed107 crashed, showed separated panels/legs; rewind restored intact craft; replay repeated the effect; 2D fallback displayed fragments; inspection retained recorded terminal values. Reviewed no remaining actionable findings.

## Wreckage realism refinement — 2026-10-20

- User art direction: same recognizable craft severely damaged, bent/crushed metal, scorched white/orange paint, exposed internals, shallow crater, subtle smoke and fading embers. Refines the approved crash effect rather than replacing the flight model.
- Reused makeCraft with a damaged variant for the fuselage/band/window/nozzle; dented geometry, soot/scratch material maps, a broken glass overlay and exposed pipes/cable. Thin curled shell strips replace solid colored wedges; compact spread follows pre-impact speed.
- Added terrain-following shallow soil rim and soft impact stain. Reduced flash/spark intensity and added soft smoke wisps. Aftermath camera eases closer in Chase; inspection and reduced-motion camera behavior remain preserved.
- Tests: new shell-strip/compact-spread regression observed RED then GREEN. Added ghost damaged-hull wireframe regression (RED then GREEN). Complete Node18/18 passed; asset closure1/1 passed. Independent focused review reported no actionable findings on disposal, comparisons, replay or reduced motion.
- Accuracy: this is a procedural cosmetic visualization of the existing lander, not a photorealistic structural failure simulation. Physics, recorded bodies, telemetry and outcome criteria unchanged.
