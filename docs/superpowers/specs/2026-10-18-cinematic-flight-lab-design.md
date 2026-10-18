# Rocket: cinematic flight lab

Date: 2026-10-18
Status: proposed written specification; awaiting user review

## Purpose and approved direction

Help a visitor watch a learned pilot, disturb its flight, and investigate the
response. The user chose a combination of cinematic presentation and scientific
inspection, with a cinematic entrance and the analysis drawer initially collapsed.
This document specifies that direction. It does not authorize implementation.

Assumption: the intended audience is a curious visitor exploring this local
experiment, rather than an aerospace operator or a researcher needing a validated
spacecraft simulator. The primary success condition is that a visitor can apply
a push, see a recovery or failure, and inspect measured evidence explaining the
change without losing their place in the flight.

## Existing system and constraints

- Python runs Gymnasium Lunar Lander and saved PPO policies locally on CPU.
- The browser plays recorded simulator trajectories, with real actions, body
  geometry, contact flags, rewards, and velocities at a nominal 50 Hz.
- Pushes rerun the same seeded episode with horizontal impulses. They preserve
  the earlier trajectory and change subsequent policy inputs and decisions.
- Available controllers are trained, best checkpoint, and random; learned
  controllers depend on local model files.
- Playback, fixed or fresh seeds, comparison with random, and session replay
  already exist and must remain accessible.
- The UI is served as packaged static assets without a frontend build step.

Preserve local operation and avoid requiring credentials for the core experience.
The proposed 3D scene visualizes existing planar dynamics. It is not a new
six-degree-of-freedom simulation. Simulator units must not be relabeled as SI
units or real lunar flight measurements without a justified conversion.

## Considered approaches

1. Cinema first: strongest immediate impression, but hides evidence and makes
   comparison feel secondary.
2. Laboratory first: strongest information density, but conflicts with the
   approved cinematic entrance.
3. Integrated console, recommended: one cinematic scene and one shared timeline,
   with scientific inspection revealed on demand. This preserves continuity
   between watching, disturbing, and investigating the same flight.

## First-release boundary

Include the 3D presentation, essential instruments, existing launch and push
controls, synchronized scientific inspection, measured policy outputs, matched
counterfactual comparison, and replay of the resulting flight.

The learned PPO controller remains the AI that flies the craft. The first release
provides an evidence-based flight debrief using measured events and differences;
it must not advertise this deterministic summary as an LLM conversation.

Defer an optional language-model analyst, voice interaction, natural-language
scenario creation, browser-triggered training, persistent experiment storage,
new planetary environments, and unconstrained 3D flight to separate designs.
No paid API or generated narrative is required for this first release.

## Screen and visual direction

The flight scene occupies the initial viewport. Replace the large marketing
intro and permanent sidebars with a compact ROCKET masthead, the scene, essential
instruments, and a transport strip. Put benchmarks and the session recorder
behind secondary navigation or below the primary viewport.

Use near-black surfaces, warm white text, orange intervention accents, and cyan
measurement overlays. Distinguish measured data, reference trajectories, and
decorative scenery by labels and line styles as well as color. Use at most two
font families and readable interface text; avoid dense, miniature HUD labels.

Show a detailed lander, terrain matching the simulator's collision profile,
engine illumination, and bounded dust particles. Extruding the terrain in depth
and adding distant scenery are presentation effects. The craft remains in its
physical motion plane, with position, tilt, gear, and action driven by frames.
Dust is decorative and must not imply additional modeled aerodynamic forces.

The default chase camera follows smoothly without roll or abrupt cuts. A Surface
camera provides an alternative anchored view. Camera changes do not alter physics,
timing, or model output. Keep the craft and landing region readable in both views.

## Entrance and primary flow

1. Open in a cinematic ready state with analysis collapsed. A scene shown before
   launch is labeled Preview; do not imply a flight or training job is running.
2. Present Launch flight as the primary action. Keep model and seed settings in
   a compact Flight setup panel. Fresh conditions remain the default.
3. On launch, compute a real trajectory and play it. Describe this state as
   simulation playback rather than a live training session.
4. Keep altitude, vertical velocity, pause/play, and Disturb flight visible.
5. Disturb flight reveals Push left and Push right, the 1.5 u/s horizontal
   velocity change, and the existing A/D shortcuts. Preserve the 12-push limit.
6. On push, freeze playback while recomputing, mark the intervention, then
   restore the prior playing or paused state. Preserve the seed and model.
7. At termination, display the simulator's outcome, reward, elapsed simulation
   time, and push count. Offer Compare without your push and Inspect flight.

Random and learned controllers use the same physical presentation. Missing model
files disable only the corresponding learned controller, with an actionable
explanation and random flights still available.

## Scientific inspection

Inspect flight pauses playback, freezes camera motion, and opens a right-hand
drawer on desktop. On narrow screens it opens a full-width sheet with a compact
scene preview. Closing it restores the previous playback state unless the user
explicitly changed that state while inspecting.

The scene, timeline cursor, plots, and policy panel share a single selected
simulation step. Selecting a plot location selects the matching frame. Scrubbing
the timeline updates all views. Numerical inspection uses an actual recorded
frame; interpolation is visual only.

The drawer contains:

- Altitude relative to pad, horizontal and vertical velocity, and tilt plots,
  with simulator units and time axes.
- Four actual action probabilities for a learned policy and the selected action.
  Label these as policy action probabilities, not confidence or landing odds.
  For random control, show its uniform action distribution and sampled action.
- Timestamped pushes, engine changes, first gear contact, and terminal outcome.
  Aggregate consecutive identical engine actions into intervals to avoid clutter.
- Experiment details: seed, controller, checkpoint identifier and training-step
  count, environment and package versions, inference mode, nominal simulation
  frequency, and full intervention history.
- The explicit disclosure: 2D dynamics, 3D visualization; model weights remain
  fixed during these flights. Reward alone does not establish a safe landing.

Expose probabilities from the same loaded policy and observation used for action
selection. Computing diagnostics must not consume simulation randomness or change
the flight. Store a model fingerprint so comparisons and metadata refer to the
actual loaded weights rather than only a filename or training-step count.

## Counterfactual comparison

Compare without your push removes the latest push on the selected trajectory
while retaining earlier pushes. Use the same seed, loaded weights, environment
configuration, and inference mode for both flights. Label the removed push and
its time. Disable this action when there is no push.

Recompute the matched reference if it is not already retained. Show an orange
disturbed trajectory and a cyan dashed reference, with a legend and a shared
simulation clock. Offer synchronized split view for inspecting overlapping craft.
Hold the shorter flight at its terminal frame and mark it complete; do not stretch
time to align landings. Never apply the disturbed flight's actions to the reference.

Summarize outcome, duration, reward, and horizontal displacement differences with
their units. Describe these as measured differences in this matched pair, not
general proof of robustness or a guaranteed causal explanation of internal policy
reasoning. Changing the seed or controller creates a new experiment, not this
counterfactual pair.

Rewinding and pushing replaces interventions at or after the selected frame,
as in the existing UI. A matched reference retains only the earlier interventions
from that new branch, never discarded future pushes from a previous trajectory.

## Flight debrief and later AI analyst

The initial debrief links measured events to their timestamps. It may report
velocity change, subsequent action intervals, gear contact, and outcome. Avoid
phrases that claim intention or thoughts, such as the pilot panicked or knew.

A later optional AI analyst can explain these records conversationally. Its
answers must cite frames or time ranges, distinguish measurements from hypotheses,
and use actual reruns for counterfactual outcome claims. Its failure or absence
must leave playback, controls, comparison, and raw inspection usable. Provider,
privacy, credentials, and cost require that later subsystem's own design.

## Architecture and data ownership

- Simulation service: owns physics, model loading and fingerprint, observation
  diagnostics, intervention validation, episode classification, and trajectories.
  Keep the CLI evaluation and no-intervention demo behavior equivalent.
- Flight state controller: owns selected flight, matched reference, frame cursor,
  playback state, pending requests, session history, and inspection lifecycle.
- 3D renderer: consumes immutable trajectory frames and camera settings. It cannot
  choose actions, determine outcomes, or advance the physics itself.
- Analysis view: consumes the same selected frame and experiment metadata. Plot
  selection dispatches frame changes through the flight state controller.
- Debrief: derives statements from recorded events and comparison results.

Extend the existing flight response additively for metadata and action
probabilities. Keep current frame fields and policy choices compatible. Return
completed trajectories as today; a streaming backend is outside this release.
Retain comparison data with the session record so replay preserves the experiment.

Select the rendering dependency and asset delivery details in implementation
planning. Bundle and pin required runtime assets for local use rather than making
core flight rendering depend on a third-party CDN. Keep the CLI launch experience.

## Failure, accessibility, and performance

- Failed launch or recomputation retains the last valid trajectory. Restore
  controls, explain the failure, and provide retry. A failed push is not recorded.
- Prevent stale responses from replacing a newer selected flight. A single push
  operation runs at a time. Keep unrelated history entries intact.
- If graphics initialization fails or the GPU context is lost, preserve the
  timeline, data, and access to the existing 2D rendering path.
- Keep buttons keyboard accessible and labeled. Preserve Space, Enter, and A/D
  behavior without intercepting typing in interactive controls.
- Respect reduced-motion preferences: fixed camera by default, no automatic
  camera transitions, and reduced decorative effects. Keep a visible pause control.
- Update assistive status announcements on meaningful events, not on each frame.
- Target smooth playback at 60 display frames/s on a capable desktop. Simulation
  remains nominally 50 Hz and independent of display rate. Clamp pixel density,
  bound particle counts, and lower decorative quality before sacrificing controls
  or numerical correctness. This is a target to measure, not a claimed guarantee.

## Acceptance and verification

1. The first viewport is predominantly the flight scene; analysis starts closed.
2. Launch, controller selection, fresh/fixed seeds, playback, disturbance, and
   session replay work with the real local simulator.
3. Rendered pose, contact, and thrusters correspond to the selected recorded frame.
   Cosmetic motion does not alter trajectory or reported outcomes.
4. A push preserves the earlier frames, changes the subsequent physics, and
   replays deterministically for matching inputs and runtime conditions.
5. No-intervention trajectories retain CLI parity for random and learned pilots.
6. Diagnostic probabilities sum to one within numerical tolerance and diagnostics
   leave actions, rewards, and trajectories unchanged.
7. Drawer plots, scene, and policy panel agree on the selected step, including
   after scrubbing, rewind branching, and replaying a completed flight.
8. Counterfactuals preserve the model fingerprint, seed, and earlier pushes, and
   omit exactly the selected latest push. The two flights share a true time axis.
9. Camera controls, reduced motion, narrow layouts, missing models, request failure,
   and graphics fallback are exercised in the browser.
10. Every debrief statement can be checked against the displayed data. No canned
    narrative implies live learning, real spacecraft validation, or hidden thoughts.

Use focused simulator regression tests, frontend interaction tests, and browser
verification of the principal cinematic and inspection states. Record actual
performance and any environmental test limitations rather than claiming unrun
checks pass. Visual concepts from the earlier failed image generation are not
approved mockups; review the first working scene and inspection layout against
this written direction during implementation.

## Next review

The user reviews this written spec. After approval, create an implementation
plan and select its execution method before product code or dependencies change.
