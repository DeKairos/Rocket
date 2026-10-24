# Flight Deck UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine Rocket's existing cinematic flight deck with readable telemetry, clearly grouped actions, and usable mobile inspection.

**Architecture:** Retain the vanilla HTML/CSS/JavaScript app and bundled Three.js scene. Update semantic presentation in index.html and consolidate style.css rather than introduce another theme override layer.

**Tech Stack:** HTML, CSS, native JavaScript modules, Three.js 0.186.1, Python local server.

**Spec:** The user approved the proposed mission-control refinement in this chat and authorized proceeding without the unavailable plugins. Preserve the full-screen scene; improve telemetry readability, control hierarchy, inspection, and mobile layout.

## Global Constraints

- Preserve DOM IDs, simulation behavior, fixed model weights, offline assets, and reduced-motion support.
- No new dependencies or external asset requests.
- Work in the existing clean codex/cinematic-flight-lab checkout; leave changes uncommitted for review.

## Review Focus

- Launch and transport actions remain keyboard-accessible.
- Small screens show controls without overlap or horizontal scrolling.
- Inspection leaves a visible scene preview on phones.
- Opening push controls does not cover essential telemetry.
- Comparison and completed-flight states retain readable actions and legends.

### Task 1: Refine presentation

**Files:** Modify rocket_ui/index.html and rocket_ui/style.css; a presentation-only adjustment in rocket_ui/app.js closes unavailable push controls on completed flights and comparisons.

- [x] Inspect the current live desktop scene.
- [x] Add accessible group labels and visual hierarchy without changing existing IDs.
- [x] Consolidate CSS for a cinematic full-screen flight deck, instrument cards, a structured playback dock, and styled dialogs/drawer.
- [x] Verify desktop and narrow viewport layouts, including inspection and expanded push controls.

### Task 2: Verify and hand off

- [x] Run `node --test tests/test_flight_state.mjs tests/test_scene.mjs`.
- [x] Run `.venv/Scripts/python.exe -m unittest discover -s tests -p test_assets.py`.
- [x] Exercise launch, playback, setup, inspection, and push controls in the browser.
- [x] Inspect the final diff and open the local preview for the user.

## Execution record

- Plan created before product edits. User authorization covers implementation; no additional plan approval required.
- Visual presentation changes use live layout checks and existing regression tests rather than implementation-mirroring CSS tests.
- Live checks found telemetry and legends could overlap the expanded dock at short desktop heights. Compact telemetry into two columns at those heights and raise the legends while push controls are open.
- Live comparison checks found the inactive push panel remained expanded. Close it when a flight is complete or a comparison is selected; keep it open through push recomputation.
- Final verification: 18 Node regression tests and 1 Python asset-integrity test passed. All 77 original DOM IDs remain and are unique. `git diff --check` passed.
- Browser checks: 1440x900 and 1280x720 desktop; 390x844 and 320x740 phone layouts. Launch, seeded setup, timeline rewind, inspection, push recomputation, and matched comparison worked. At 1280x720, comparison telemetry and legend remain above the dock; the inactive push panel is hidden with aria-expanded=false. No horizontal overflow at the tested phone widths. No browser console errors recorded.
- Preview: http://127.0.0.1:8002, running outside the sandbox so the in-app browser can reach it. Changes remain uncommitted.
