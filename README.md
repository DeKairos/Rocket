# Rocket Lander

Train an AI to land a rocket using Gymnasium's 2D Lunar Lander and PPO.
Runs locally on CPU, with no API keys or paid services.

## Setup (PowerShell)

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from this folder:

```powershell
uv sync --python 3.12
```

The included `uv.lock` pins dependency versions for reproducible installs.

## Watch, train, compare

Watch an untrained random controller:

```powershell
uv run rocket watch --random --episodes 3
```

Train a policy (Ctrl+C saves the current policy before exiting):

```powershell
uv run rocket train --steps 1000000 --run runs/first
```

Replay the learned controller:

```powershell
uv run rocket watch --model runs/first/final_model.zip
```

Measure before and after on the same held-out starting seeds:

```powershell
uv run rocket evaluate --random --episodes 20 --output runs/random.json
uv run rocket evaluate --model runs/first/final_model.zip --episodes 20 --output runs/trained.json
```

Both commands default to starting seed 100 and increment it for each flight.
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
is not counted as a safe landing. The conventional score target is 200; use more
episodes and several training seeds before claiming reliable performance.

This first version uses the simulator's native 2D graphics. The reel's polished
3D rocket view would be a separate visualization layer.

## Checks

Run the CLI regression checks (headless, no training required):

```powershell
uv run python -m unittest discover -s tests -v
```

References: [Lunar Lander](https://gymnasium.farama.org/environments/box2d/lunar_lander/)
and [Stable Baselines3 PPO](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html).
