# First training experiment

Measured locally on Windows, CPU, Python 3.12, using the dependency versions
in `uv.lock` (Gymnasium 1.4.0 and Stable Baselines3 2.9.0).

## Training

Training used seed 42 and the PPO settings in `rocket.py`:

```powershell
uv run rocket train --steps 1000000 --run runs/first
```

The command execution limit terminated this process at approximately 723,000
steps. It did not write a final model. Periodic checkpoints and the
validation-selected model survived. Training continued from the 700,000-step
checkpoint:

```powershell
uv run rocket train --resume runs/first/checkpoints/rl_model_700000_steps.zip --steps 300000 --run runs/continued
```

The resumed segment completed at a cumulative counter of **1,000,032 steps**
after rounding the additional budget to full rollouts. Work after the
700,000-step checkpoint in the first process was discarded. Resuming starts
a fresh simulator episode and random sequence; this is not equivalent to an
uninterrupted million-step run.

The best mean validation reward in the first segment was 277.35 at step
560,000. In the resumed segment it was 287.83 at step 880,000. These use five
validation episodes per evaluation. The resumed segment's validation-selected
model was chosen for the comparison below based on validation reward, before
running held-out evaluation.

## Held-out comparison

Each controller ran 20 episodes on matching starting seeds **100–119**.
Learned policies used deterministic actions. Standard deviation below is
population standard deviation across episode rewards.

| Controller | Mean reward | Reward std. dev. | Landed | Crashed | Out of bounds | Timeout |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Random | -191.8 | 112.3 | 0/20 (0%) | 18 | 2 | 0 |
| Final, 1,000,032 steps | 223.1 | 110.8 | 16/20 (80%) | 2 | 0 | 2 |
| Validation-selected, 880,000 steps | 216.2 | 96.3 | 14/20 (70%) | 2 | 0 | 4 |

```powershell
uv run rocket evaluate --random --episodes 20 --seed 100 --output runs/random.json
uv run rocket evaluate --model runs/continued/final_model.zip --episodes 20 --seed 100 --output runs/trained-final.json
uv run rocket evaluate --model runs/continued/best/best_model.zip --episodes 20 --seed 100 --output runs/trained-best.json
```

The final policy performed better on this batch, but neither policy landed
every flight. These measurements describe one training seed and 20 evaluation
seeds; they do not establish reliability across independent training runs.
Evaluation outcomes come from the simulator's terminal state, not a reward
threshold.

## Watch the learned controller

Replay three held-out flights that landed with the final policy:

```powershell
uv run rocket watch --model runs/continued/final_model.zip --seed 100 --episodes 3
```

Inspect a timeout and a crash from the same evaluation batch:

```powershell
uv run rocket watch --model runs/continued/final_model.zip --seed 105 --episodes 1
uv run rocket watch --model runs/continued/final_model.zip --seed 107 --episodes 1
```

Model files, training logs, and full JSON reports are local artifacts under
the ignored `runs/` directory. A fresh clone needs training before these
replay commands can run. The commands above document the experiment; rerunning
training may produce different policies on other hardware or software versions.
