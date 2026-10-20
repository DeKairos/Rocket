# Cinematic Flight Lab Implementation Plan

> Execution: native implementation in this chat, followed by an independent whole-branch review. Approved in chat on 2026-10-20.

**Goal:** cinematic 3D playback with scientifically traceable inspection and matched counterfactuals.
**Architecture:** retain Python rollouts and additive JSON; immutable browser records and a shared clock drive interchangeable renderers and inspection.
**Stack:** existing Python/Gymnasium/PPO; vanilla browser modules; locally vendored Three.js 0.186.1; native Node tests.
**Spec:** ../specs/2026-10-18-cinematic-flight-lab-design.md and the user's implementation prompt.

## Global constraints

- No paid APIs, credentials, CDN, LLM, streaming backend, new physics, or retraining.
- Preserve frame fields, CLI behavior, random comparison, seeded replay, 1.5 u/s pushes, and the 12-push limit.
- Numerical views select integer frames; interpolation is presentation only.
- Preserve actual experiment identity, earlier frames, original branches, and session history.
- 2D dynamics / 3D visualization; fixed policy weights; reward alone is not a landing.

## Review focus

- A delayed response after flight selection must not replace the selection.
- Frame-zero and post-push policy diagnostics must not be attributed to the wrong observation.
- A replaced checkpoint file must not misidentify cached loaded weights.
- Failed WebGL initialization/context loss must preserve controls and data.
- A counterfactual after rewinding must never retain discarded future pushes.

## Tasks

### Task 1: baseline and contracts
- [x] Preserve all current source on a feature branch in a recoverable baseline.
- [ ] Run baseline Node and Python checks; record environment restrictions.
- [ ] Write backend tests for experiment metadata, diagnostic parity and context rejection; watch them fail.

### Task 2: backend identity and diagnostics
Files: rocket_demo.py, rocket_experiment.py, pyproject.toml, tests/test_experiment.py.
Interface: MissionControl.flight(policy, seed, interventions=(), expected_context_id=None, diagnostics=True) retains prior fields and adds schema_version, experiment, context_id, revision_id, and frame.decision.
Decision: {source_step, observation[8], probabilities[4], selected_action}; frame zero has no decision.
- [ ] Load PPO from fingerprinted bytes; capture effective settings, versions and initial RNG states.
- [ ] Record pre-action diagnostics without sampling or changing inference; uniform random distribution.
- [ ] Validate probabilities within 1e-6; enforce expected-context identity with a 409 error.
- [ ] Prove diagnostic-on/off parity and existing simulator parity; commit.

### Task 3: revision-safe frontend state and counterfactuals
Files: rocket_ui/modules/flight-state.mjs, flight-data.mjs; tests/test_flight_state.mjs.
Interface: FlightController(request, onChange), launch(), push(direction), compareWithoutPush(), select(revision), seek(step), inspect(open), setPlaying(), advance(seconds).
- [ ] Write behavior tests for stale requests, failed pushes, preserved originals, rewind and compare; watch RED.
- [ ] Keep frozen records keyed by revision, a monotonic operation token and one shared time cursor.
- [ ] Keep earlier interventions and remove exactly the latest for the reference; reject mismatched context.
- [ ] Preserve comparison pairs in replay; pause/restore inspection explicitly; prove GREEN; commit.

### Task 4: rendering boundary and local assets
Files: renderer-2d.mjs, renderer-3d.mjs, renderer-host.mjs, scene-data.mjs, vendor/three/*; tests/test_scene.mjs.
Interface: renderer.setFlights(flights), render(step, options), resize(), dispose().
- [ ] Test body-pose projection/interpolation, terminal holding and fallback lifecycle before implementation.
- [ ] Vendor pinned Three runtime dependencies and MIT license with SHA-256 manifest.
- [ ] Extrude recorded terrain/fixtures, add detailed cosmetic craft, lighting, bounded dust, chase/surface cameras.
- [ ] Keep a separate Canvas 2D path and lazy catchable GPU initialization.
- [ ] Extend explicit static manifest and wheel package-data; prove local assets and fallback; commit.

### Task 5: cinematic shell and scientific inspection
Files: index.html, style.css, app.js, modules/analysis.mjs, modules/debrief.mjs; frontend tests.
- [ ] Test derived plot data, event intervals, traceable debriefs and comparison differences first.
- [ ] Build near-black full-viewport Preview/flight shell, compact setup, essential HUD and Disturb controls.
- [ ] Connect plots, timeline, policy probabilities and metadata to the same integer frame.
- [ ] Add collapsed desktop drawer / mobile sheet; preserve focus, keyboard, reduced-motion and meaningful announcements.
- [ ] Add measured debriefs, comparison legend and completed markers; preserve benchmark and recorder access; commit.

### Task 6: integration and verification
- [ ] Run complete Python and Node suites, including old CLI regression tests.
- [ ] Verify installed-package asset closure and local startup instructions.
- [ ] Browser exercise real launch, push, inspection, comparison, replay, cameras, mobile, keyboard and GPU fallback.
- [ ] Measure actual display frame times separately from simulator generation latency; record limitations.
- [ ] Independent whole-branch review, regression-test important fixes, final suite and documentation.

## Rollback

Source baseline: aed805e. Revert feature commits individually; keep the original 2D renderer and additive contracts. No persistent data migration or destructive clean/reset.
