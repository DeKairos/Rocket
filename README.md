# Rocket Lander

Train an AI to land a rocket using Gymnasium's 2D Lunar Lander and PPO.
Runs locally on CPU, with no API keys or paid services.

The [first measured experiment](RESULTS.md) reached 16 safe landings in 20
held-out flights with its final policy, compared with 0/20 for random actions.
It includes training details, failure cases, and local replay commands.

## Setup (PowerShell)

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from this folder:

```powershell
uv sync --python 3.12
```

The included `uv.lock` pins dependency versions for reproducible installs.

## Mission-control UI

```powershell
uv run rocket demo
```

Opens **http://127.0.0.1:8000** with a custom flight deck: an animated lunar
surface, engine plumes, flight trails, live playback telemetry, and a flight
recorder. No Node.js installation or frontend build is needed.

- Choose the **trained pilot**, **best checkpoint**, or **pure chaos** random controller.
- **Head to head** runs the selected learned policy and random controller on
  the same seed and terrain, with synchronized playback.
- Pause, replay, scrub the timeline, cycle **0.5× / 1× / 2× / 4×**, or go fullscreen.
- New launches draw a fresh seed by default. Edit the seed or uncheck
  **New conditions each launch** to reproduce a particular starting state.
- In Single flight, use **Push left / Push right** (or **A / D** outside a
  control) to disturb the craft. Each push adds 1.5 simulator units/s of
  horizontal velocity. The simulator reruns from the same seed, applies your
  impulse at the selected frame, and computes subsequent policy decisions
  from the changed state. Playback pauses briefly while it recomputes.
  Earlier frames remain unchanged. Up to 12 pushes are retained in the
  trajectory, including when replaying from the session recorder. Scrubbing
  backward and pushing replaces pushes at or after that frame.
- Press **Enter** to launch from the seed field; **Space** toggles playback
  when focus is outside an interactive control.
- Fixed seeds **100**, **105**, and **107** show a landing, timeout, and crash with
  this machine's final trained policy. Outcomes depend on the loaded model.

The backend generates a real Gymnasium episode on each launch. The browser
plays its recorded Box2D geometry and policy actions at the simulator's 50 Hz,
with interpolated animation. Pushes branch that simulation; the model weights
stay fixed, so recovery uses an existing policy rather than learning during
the flight. Telemetry is in simulator units; outcomes use the
same classifier as CLI evaluation. The scene's distant planet and ridgeline
are decorative. Flights are not scripted, and the UI does not run training.

Defaults use the experiment's local `runs/continued/final_model.zip` and
`runs/continued/best/best_model.zip`. Connect another run explicitly:

```powershell
uv run rocket demo --model runs/first/final_model.zip --best-model runs/first/best/best_model.zip
```

A fresh clone has no model artifacts; random flights still work, and missing
learned policies are disabled. Train a policy first to enable them. The landing
gap panel reads `runs/random.json`, `runs/trained-final.json`, and
`runs/trained-best.json` when present. These are labeled recorded experiment
results, not automatically recomputed statistics for a newly selected model.
Session flight history stays in memory until the page is reloaded.

Use `--port 8001` if port 8000 is occupied, or `--no-browser` to start the
server without opening a tab. Stop the local server with **Ctrl+C**.

## Watch, train, compare

Watch an untrained random controller:

```powershell
uv run rocket watch --random --episodes 3
```

Train a policy (Ctrl+C saves the current policy before exiting):

```powershell
uv run rocket train --steps 1000000 --run runs/first
```

Continue from a saved policy or checkpoint using a new run folder:

```powershell
uv run rocket train --resume runs/first/checkpoints/rl_model_700000_steps.zip --steps 300000 --run runs/continued
```

With `--resume`, `--steps` is the **additional** budget. Network weights,
optimizer state, hyperparameters, and the step counter are restored. The
simulator starts a fresh episode using `--seed` (default 42), so this is not
an exact replay of uninterrupted training. The new `config.json` records the
source checkpoint and starting step count. Checkpoint and evaluation intervals
restart from the beginning of the new training segment.

Replay the learned controller:

```powershell
uv run rocket watch --model runs/first/final_model.zip
```

Measure before and after on the same held-out starting seeds:

```powershell
uv run rocket evaluate --random --episodes 20 --output runs/random.json
uv run rocket evaluate --model runs/first/final_model.zip --episodes 20 --output runs/trained-final.json
uv run rocket evaluate --model runs/first/best/best_model.zip --episodes 20 --output runs/trained-best.json
```

Evaluation commands default to starting seed 100 and increment it for each flight.
Use the same `--seed` and `--episodes` when comparing controllers; seeds must
be nonnegative. JSON reports include reward statistics, outcome counts, a
`landing_rate` from 0 to 1, and a `flights` list recording each flight's seed,
reward, number of steps, and outcome. To replay a specific evaluation flight:

```powershell
uv run rocket watch --model runs/first/final_model.zip --seed 103 --episodes 1
```

Training writes episode scores to `train.monitor.csv`, learning metrics to
`logs/progress.csv`, periodic checkpoints, and a `best/best_model.zip` selected
by evaluation every 20,000 steps. Try that policy too if the final policy regresses.
Use a new `--run` folder for each experiment. PPO rounds training up to complete
rollouts of 1,024 steps. A quick 2,048-step run checks the pipeline but will not
produce a competent lander. A million steps is an initial budget, not a guarantee
of success; training time and results depend on hardware and seed.

## What the AI learns

The network sees eight values: position, velocity, tilt, angular velocity and
each leg's ground contact. It chooses between doing nothing, the main engine,
and either side engine. Gymnasium's existing reward shaping encourages approach,
low speed, upright attitude and ground contact, penalizes engine use and crashes,
and rewards safe landings. Fuel is unlimited, with a reward cost for using engines.

Evaluation reports both reward and actual landing outcomes: a high score alone
is not counted as a pad landing. A confirmed pad landing requires a sleeping,
non-crashed craft with both legs contacting the ground and both gear support
centers inside the marked pad. A resting craft outside it is `off_pad`; missing
gear contact is `unsafe_landing`. Reports identify this rule as
`pad_gear_contacts_v1`; older reports used the simulator's broader sleep criterion.
The conventional score target is 200; use more
episodes and several training seeds before claiming reliable performance.

`watch` uses the simulator's native 2D graphics. `demo` uses a custom browser
3D presentation of recorded physics, with a retained Canvas 2D fallback. The
landscape fills the viewport; the recorded collision contour and controller
remain unchanged. Three.js 0.186.1 is bundled locally, so graphics need no CDN.

The browser includes a shared timeline, chase and surface cameras, sideways
pushes, and a scientific inspection drawer. Plots, policy action probabilities
and evidence notes refer to the same recorded frame. Probabilities describe
actions, not landing confidence. Model weights remain fixed during playback.

After a push, **Without your push** computes a matched reference with only the
latest push removed. Earlier pushes remain. Each controller makes its own
decisions in that reference. The recorder preserves immutable original flights
and comparison pairs for the current page session; reloading clears them.
Experiment metadata includes loaded model hashes, runtime settings and RNG
states. Decorative terrain, dust and lighting do not affect simulator physics.

## Checks

Run the CLI and demo API checks (headless, including two 1,024-step training segments):

```powershell
uv run python -m unittest discover -s tests -v
```

The demo checks compare browser trajectories against CLI evaluation for both
controllers, exercise input errors and missing models, and verify packaged assets.
They also check that pushes preserve earlier frames and produce repeatable
branches. To check frontend launch, push, rewind, replay and error state handling
with Node.js (no packages needed):

```powershell
node --test tests/test_ui.cjs
```

References: [Lunar Lander](https://gymnasium.farama.org/environments/box2d/lunar_lander/)
and [Stable Baselines3 PPO](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html).
