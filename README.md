# Rocket: Cinematic Flight Lab

Train a small reinforcement-learning controller to land in Gymnasium's
`LunarLander-v3`, then watch and disturb its flights in a local 3D lab.
The controller runs on CPU through Stable Baselines3 PPO. You do not need an
API key, hosted AI service, or frontend build to use the demo.

The current final checkpoint has **9,797 parameters** and **1,000,032 recorded
training steps**. In the latest evaluation on seeds 100–119 it achieved
**14/20 confirmed pad landings**, compared with 0/20 for random actions. See
[measured results](#measured-results) for the full outcome breakdown and limits.
Model weights and training logs stay local; this repository includes source,
configuration, checkpoint fingerprints and evaluation reports.

## Quick start

Use PowerShell from the project folder. Install
[uv](https://docs.astral.sh/uv/getting-started/installation/), then:

```powershell
uv sync --python 3.12
uv run rocket demo
```

Open **http://127.0.0.1:8000**. A fresh clone supports the random controller.
Train a model to enable a learned controller:

```powershell
uv run rocket train --steps 1000000 --seed 42 --run runs/my-run
uv run rocket demo --model runs/my-run/final_model.zip --best-model runs/my-run/best/best_model.zip
```

Training time depends on the machine. The command collects complete PPO
rollouts, so the final step count can exceed the requested budget. A short
2,048-step run checks installation and checkpoint saving, but does not establish
landing ability. Use a new, empty run folder for each experiment.

Python 3.12 is the tested setup; the package declares Python >=3.10 and <3.14.
`uv.lock` records the dependency versions. Node.js is optional for frontend
regression tests; the browser loads the bundled JavaScript directly.

To choose a port or keep browser startup manual:

```powershell
uv run rocket demo --port 8002 --no-browser
```

The server binds to loopback. Stop it with **Ctrl+C**.

## Model card

### Task and environment

The agent controls the discrete-action version of `LunarLander-v3`. Box2D
simulates a rigid hull, two articulated landing legs and the terrain. Each
simulation step represents 1/50 second. The default episode limit is 1,000
steps, or 20 simulated seconds. The project uses the environment's default
gravity of -10 simulator units/s² and leaves wind disabled.

The network receives simulator state. It does not interpret the browser's
rendered scene. The 3D terrain, paint, lighting and crash effects do not enter
its observations or change its actions. During demo playback the weights stay
fixed; recovery after a push uses the already-trained policy.

### Eight input values

The observation is a float32 vector with shape `(8,)`, in this order:

| Index | Input | Encoding |
| --- | --- | --- |
| 0 | Horizontal position | Offset from world centre, divided by half the viewport width |
| 1 | Vertical position | Offset from pad height plus the leg-down offset, divided by half the viewport height |
| 2 | Horizontal velocity | Simulator velocity multiplied by half the viewport width, divided by FPS |
| 3 | Vertical velocity | Simulator velocity multiplied by half the viewport height, divided by FPS |
| 4 | Hull angle | Radians |
| 5 | Angular velocity | Simulator angular velocity multiplied by 20/FPS |
| 6 | First leg contact | 1 when contacting ground, otherwise 0 |
| 7 | Second leg contact | 1 when contacting ground, otherwise 0 |

The environment provides these encodings; the project adds no `VecNormalize`
wrapper. The browser HUD reports world positions and velocities in simulator
units, so its numbers differ from the encoded observation shown in inspection.
A negative altitude above the pad means the hull centre is below pad elevation;
that value alone does not establish a crash or a successful landing.

### Four actions

| Action | Control |
| --- | --- |
| 0 | Coast; engines idle |
| 1 | Fire left orientation engine |
| 2 | Fire main engine |
| 3 | Fire right orientation engine |

The actor produces four logits. A categorical distribution converts those
logits into action probabilities. Training samples actions from that
distribution; evaluation and demo flights use deterministic action selection.
The random baseline samples the four actions with equal probability from an
independently seeded action space.

The probabilities in **Inspect flight** describe the network's action
preferences for one observation. They are not estimates of landing probability,
safety, or certainty about the environment.

### Network architecture

Both recorded checkpoints use Stable Baselines3 `MlpPolicy`, an
`ActorCriticPolicy` with a parameter-free flattening feature extractor and
separate actor and critic networks:

```text
Observation: 8 floats
    |
    +--> Actor:  Linear(8,64) -> Tanh -> Linear(64,64) -> Tanh
    |              -> Linear(64,4) -> categorical action distribution
    |
    +--> Critic: Linear(8,64) -> Tanh -> Linear(64,64) -> Tanh
                   -> Linear(64,1) -> estimated discounted return
```

| Component | Trainable parameters |
| --- | ---: |
| Actor, including four-action output | 4,996 |
| Critic, including value output | 4,801 |
| Total | **9,797** |

The critic supports training by estimating return. It does not choose the
engine action. This feed-forward policy uses the current observation without
a recurrent memory state. The saved archive also contains optimizer state and
algorithm configuration for resuming training.

The checked architecture, optimizer details, full checkpoint SHA-256 values
and hyperparameters are recorded in [docs/model-card.json](docs/model-card.json).
Those values were read from the local saved models, rather than inferred from
current library defaults.

### PPO training configuration

The project uses PPO's clipped policy objective. It collects a rollout,
estimates advantages using the value network, and performs minibatch updates.
Clipping limits changes in action-probability ratios during each update.
The entropy term encourages exploration while training.

| Setting | Value in both recorded checkpoints |
| --- | ---: |
| Training seed | 42 |
| Device | CPU |
| Training environments | 1, wrapped in `Monitor` |
| PyTorch threads during training | 1 |
| Rollout length, `n_steps` | 1,024 |
| Minibatch size | 64 |
| Epochs per rollout | 10 |
| Optimizer | Adam |
| Learning rate | 0.0003 |
| Policy clip range | 0.2 |
| Discount, `gamma` | 0.999 |
| GAE lambda | 0.98 |
| Entropy coefficient | 0.01 |
| Value-loss coefficient | 0.5 |
| Gradient-norm limit | 0.5 |
| Advantage normalization | Enabled |
| Target KL early-stop threshold | Unset |

`rocket.py` sets the rollout length, minibatch size, discount, GAE lambda and
entropy coefficient. The saved configuration also retains the remaining
settings in this table. Resuming a checkpoint loads its saved hyperparameters;
it does not construct a new policy using fresh defaults.

### Reward and the mission's success rule

Training uses Gymnasium's existing reward without modifications. Its shaping
rewards progress toward the target, slower motion, a more upright attitude and
leg contacts. Main and side engines incur costs of up to 0.30 and 0.03 per step,
respectively. Fuel is unlimited. Terminal rewards include -100 for a hull
collision or leaving the horizontal bounds, and +100 when the hull sleeps.

A sleeping body can be resting outside the pad. The training reward therefore
does not exactly match this project's stricter mission outcome rule. Changing
the classifier did not retrain either checkpoint or change their rewards.

CLI evaluation and the browser share **`pad_gear_contacts_v1`**:

| Outcome | Condition, checked in this order |
| --- | --- |
| `crashed` | Simulator reports hull collision (`game_over`) |
| `out_of_bounds` | Absolute encoded horizontal position is at least 1 |
| `off_pad` | Episode terminates with a sleeping hull, but either leg's support centre lies outside the pad's horizontal interval |
| `unsafe_landing` | Episode terminates with a sleeping hull and both support centres inside the pad, but either leg lacks ground contact |
| `landed` | Episode terminates with a sleeping hull, both support centres inside the pad and both legs contacting ground |
| `timeout` | Remaining terminal/truncation cases, including the step limit |

This is an operational simulator criterion, not an engineering certification
of a safe rocket landing. Reward above 200 alone does not count as success.

## Recorded model lineage

The local experiment started from seed 42 with a one-million-step request.
An execution limit stopped the first process around 723,000 steps before it
saved a final archive. The 700,000-step periodic checkpoint survived. A second
run resumed that checkpoint with an additional 300,000-step budget and finished
at a cumulative counter of **1,000,032 steps**.

| Checkpoint | Local path | Recorded steps | Selection |
| --- | --- | ---: | --- |
| Final | `runs/continued/final_model.zip` | 1,000,032 | End of resumed training segment |
| Validation-selected | `runs/continued/best/best_model.zip` | 880,000 | Highest mean validation reward in the resumed segment |

Training saves periodic checkpoints every 50,000 steps. Every 20,000 steps,
`EvalCallback` evaluates five episodes with deterministic actions and saves an
improved validation checkpoint. The evaluation environment starts with seed
10,042 for the default training seed. The resumed run's selected checkpoint
had mean validation reward 287.83. Its selection preceded the 20-flight
comparison below.

The name `best` refers to that validation selection. It does not imply the
highest score on every later evaluation batch.

[RESULTS.md](RESULTS.md) preserves the original experiment report. Its landing
counts use the earlier sleeping-body criterion. Use the fresh results below
for the corrected pad-contact rule.

## Measured results

Re-evaluated on **2026-10-20**, using matching starting seeds **100–119**,
deterministic learned-policy actions and no user pushes. All controllers used
the default environment. Evaluation ran on Windows, Python 3.12.14, CPU, with
one PyTorch thread. Reports contain dependency versions and model hashes.
Standard deviations below use the population definition across 20 rewards.

| Controller | Mean reward | Reward std. dev. | Pad landings | Off pad | Unconfirmed contact | Crashes | Out of bounds | Timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Random | -191.8 | 112.3 | 0/20 (0%) | 0 | 0 | 18 | 2 | 0 |
| Final, 1,000,032 steps | 223.1 | 110.8 | 14/20 (70%) | 0 | 2 | 2 | 0 | 2 |
| Validation-selected, 880,000 steps | 216.2 | 96.3 | 13/20 (65%) | 1 | 0 | 2 | 0 | 4 |

Raw per-flight evidence:

- [Random controller](docs/evaluation/2026-10-20-random.json)
- [Final checkpoint](docs/evaluation/2026-10-20-trained-final.json)
- [Validation-selected checkpoint](docs/evaluation/2026-10-20-trained-best.json)

The historical final-policy figure was 16/20 under the older sleep criterion.
Two of those episodes lack both leg contacts under the current rule. The mean
reward remains 223.1 because the new classifier changes labels, not physics or
reward. For the validation-selected checkpoint, one former landing is off pad.

These results cover one training seed and 20 evaluation seeds. They do not
establish performance across independent training runs, different gravity,
wind, other tasks, or physical hardware. The deterministic action policy is
repeatable under matching model bytes, runtime and simulator conditions;
seeding alone does not promise bit-identical results across platforms.

### Reproduce evaluation

With the recorded local artifacts present:

```powershell
uv run rocket evaluate --random --episodes 20 --seed 100 --output runs/random-current.json
uv run rocket evaluate --model runs/continued/final_model.zip --episodes 20 --seed 100 --output runs/final-current.json
uv run rocket evaluate --model runs/continued/best/best_model.zip --episodes 20 --seed 100 --output runs/best-current.json
```

The published run set the PyTorch thread count to one before evaluation.
To match that CPU threading choice when running the CLI from PowerShell:

```powershell
$env:OMP_NUM_THREADS = '1'
$env:MKL_NUM_THREADS = '1'
```

New evaluation reports contain `outcome_rule`, episode rewards, per-flight
seed/outcome/step counts, aggregate outcomes and `landing_rate`. Use a new output
filename to retain a historical report. The committed evidence additionally
records checkpoint hashes and the measurement runtime.

## Train, resume and watch

```powershell
# Train a new policy.
uv run rocket train --steps 1000000 --seed 42 --run runs/my-run

# Resume from a periodic checkpoint into a different folder.
uv run rocket train --resume runs/my-run/checkpoints/rl_model_700000_steps.zip --steps 300000 --seed 42 --run runs/my-resumed

# Watch the simulator's native 2D rendering.
uv run rocket watch --model runs/my-run/final_model.zip --seed 100 --episodes 3

# Watch the random baseline.
uv run rocket watch --random --seed 100 --episodes 3
```

With `--resume`, `--steps` means additional training steps. PPO restores
weights, optimizer state, hyperparameters and the cumulative step counter.
The new segment starts a fresh simulator episode and random sequence. It does
not reproduce uninterrupted training. The new `config.json` records the
source checkpoint and starting counter; callback intervals restart for that
segment. **Ctrl+C** asks training to save its current policy before exiting.

A run directory contains:

```text
runs/my-run/
  config.json                  Requested seed, budget and resume source
  train.monitor.csv            Training episode returns and lengths
  logs/progress.csv            PPO training metrics
  checkpoints/                 Periodic policy archives
  evaluation/evaluations.npz    Validation episode results
  best/best_model.zip           Validation-selected policy
  final_model.zip              Policy saved at completion or interruption
```

The `.zip` filenames are Stable Baselines3 model archives. `runs/` is ignored
by Git; cloning this repository does not download trained weights. The
fingerprints in the model card identify this machine's measured checkpoints.
A new training run can produce different bytes and performance.

## Use the flight lab

The default model paths are the two `runs/continued/` checkpoints above.
Override `--model` and `--best-model` to inspect another run. Missing archives
disable the corresponding controller; random remains available.

- **Flight setup:** choose a controller, seed and optional comparison with random.
  Fresh conditions are enabled by default. Editing the seed disables that option.
- **Playback:** pause, restart, scrub the shared timeline and choose 0.5×, 1×,
  2× or 4× speed. **Space** toggles playback outside an interactive control;
  **Enter** launches from the seed field.
- **Disturb flight:** in a single flight, **A/D** or the push buttons add
  +/-1.5 simulator units/s of horizontal velocity. The backend replays the seed,
  applies the impulse at the selected frame and computes later policy decisions
  from the changed observation. Up to 12 pushes are retained. Earlier frames
  stay unchanged; a push after rewinding discards pushes at or after that frame.
- **Without your push:** compute a matched reference with only the latest push
  removed. Earlier pushes remain, and the policy makes its own subsequent
  decisions. This measures one intervention pair, not a general causal effect.
- **Inspect flight:** examine altitude, horizontal/vertical velocity, tilt,
  action probabilities, the exact pre-action observation and linked evidence
  notes at the same selected frame. Frame zero has no policy decision.
- **Recorder:** replay immutable original flights, disturbed branches and
  comparison pairs. History lasts until the page reloads.
- **Cameras and graphics:** switch between Chase, Surface and the retained 2D
  view. Failed GPU initialization or context loss falls back to Canvas 2D.

The backend computes the full episode before the browser plays it. Display
refresh rate differs from the simulator's 50 Hz; interpolation smooths the
geometry between recorded frames. Inspection pauses playback. The drawer
shows a compact scene preview on phones and supports keyboard plot navigation.

For the recorded final checkpoint, seeds 100, 105 and 107 demonstrate a pad
landing, timeout and crash. Seed 116 demonstrates why reward alone cannot
confirm landing: its reward is about 296.2, but only one leg reports contact.
Outcomes can change when you load another checkpoint or add pushes.

### Scientific records and visual effects

Each generated flight includes environment settings, runtime/dependency
versions, model-byte SHA-256, initial random-generator states, seed and
controller. A `context_id` identifies matching experiment conditions;
`revision_id` identifies the completed trajectory. The server rejects a push
or matched reference if its expected context differs. A loaded policy's
fingerprint describes the cached bytes even if the file later changes on disk.

Decision diagnostics record the observation and four-action distribution
before the action associated with the next frame. Enabling those passive
diagnostics does not sample another action or change the rollout.

The browser reconstructs recorded 2D fixture geometry in 3D. The landscape,
paint, plume lighting, dust and wreckage are cosmetic. Confirmed crashes show
a crushed/scorched version of the same craft with bent shell strips, damaged
nozzle and glass, exposed tubing, a soil rim and faint smoke. A separate
1.8-second visual clock animates the aftermath while telemetry and simulation
time hold the final recorded frame. Rewind restores the craft. Reduced motion
shows static settled wreckage; comparison references keep their wireframe style.
The damage is procedural and stylized, not a structural-failure simulation.

Three.js **0.186.1**, its MIT license and an integrity manifest are bundled
under `rocket_ui/vendor/three/`. The graphics need no CDN. The app reports
locally measured display intervals and CPU render-submission time in
**The experiment**; these are separate from episode-generation time and GPU
execution time.

The UI's historical benchmark panel reads `runs/random.json`,
`runs/trained-final.json` and `runs/trained-best.json` if present. Reports
without the current `outcome_rule` are labelled as legacy simulator-rest
counts. The panel does not evaluate a newly selected checkpoint automatically.

## Source map

| File or directory | Responsibility |
| --- | --- |
| [rocket.py](rocket.py) | Training, resume, watch/evaluate CLI and shared outcome rule |
| [rocket_demo.py](rocket_demo.py) | Local HTTP server, seeded rollouts and interventions |
| [rocket_experiment.py](rocket_experiment.py) | Model/runtime identity, passive policy diagnostics and revisions |
| [rocket_ui/app.js](rocket_ui/app.js) | Browser controls, playback and cosmetic aftermath clock |
| [rocket_ui/modules/](rocket_ui/modules/) | Immutable flight state, derived measurements, inspection and renderers |
| [tests/](tests/) | CLI/API parity, identity, outcome, asset and frontend behavior checks |
| [docs/model-card.json](docs/model-card.json) | Verified local checkpoint architecture and fingerprints |
| [docs/evaluation/](docs/evaluation/) | Current per-flight evaluation evidence |

## Verification

```powershell
uv run python -m unittest discover -s tests -v
node --test tests/test_ui.cjs
```

The Python suite covers CLI validation, training/resume, seeded API/CLI parity,
interventions, outcome rules, model identity and diagnostic-on/off parity.
The Node suite uses the production modules to check state, stale requests,
rewind, comparisons, plots, graphics fallback and deterministic wreckage.
No Node packages are needed.

Latest frontend run: **18/18 passed**. The asset import/integrity check also
passed. A full Python run in this Windows environment encountered connection
resets (`WinError 10054`) while reading the two HTTP trajectory-parity subcases;
the remaining methods passed. The same transport failure occurred before the
UI changes. It remains unresolved, so the project does not claim a fully green
Python suite. The committed evaluation reports come from 60 fresh direct
simulator episodes and do not depend on that HTTP transport.

## References

- [Gymnasium Lunar Lander documentation](https://gymnasium.farama.org/environments/box2d/lunar_lander/)
- [Stable Baselines3 PPO documentation](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html)
- [Proximal Policy Optimization paper](https://arxiv.org/abs/1707.06347)
- [Historical local experiment](RESULTS.md)
