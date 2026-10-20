"""A small, reproducible Lunar Lander training project."""

import argparse
import json
from pathlib import Path

import gymnasium as gym
import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback
from stable_baselines3.common.logger import configure
from stable_baselines3.common.monitor import Monitor

ENV_ID = "LunarLander-v3"
OUTCOME_RULE = "pad_gear_contacts_v1"


def flight_outcome(env, observation, terminated):
    """Classify a completed flight from simulator state, not reward."""
    if env.unwrapped.game_over:
        return "crashed"
    if abs(float(observation[0])) >= 1.0:
        return "out_of_bounds"
    if terminated and not env.unwrapped.lander.awake:
        world = env.unwrapped
        # Gymnasium ends successfully when the body sleeps anywhere on terrain.
        # Our mission requires both gear supports on the marked landing pad.
        if not all(world.helipad_x1 <= leg.position.x <= world.helipad_x2
                   for leg in world.legs):
            return "off_pad"
        if not (bool(observation[6]) and bool(observation[7])):
            return "unsafe_landing"
        return "landed"
    return "timeout"


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return number


def nonnegative(value):
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be at least 0")
    return number


def train(args):
    run = args.run
    if args.resume is not None and not args.resume.is_file():
        raise ValueError(f"Checkpoint does not exist: {args.resume}")
    # Avoid mixing metrics or replacing a previous experiment by accident.
    if run.exists() and any(run.iterdir()):
        raise ValueError(f"{run} is not empty. Choose a new --run folder.")
    run.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(1)
    env = Monitor(gym.make(ENV_ID), str(run / "train.monitor.csv"))
    evaluation = Monitor(gym.make(ENV_ID))
    evaluation.reset(seed=args.seed + 10_000)
    if args.resume is None:
        model = PPO("MlpPolicy", env, seed=args.seed, device="cpu", verbose=1,
                    n_steps=1024, batch_size=64, gamma=0.999,
                    gae_lambda=0.98, ent_coef=0.01)
    else:
        model = PPO.load(args.resume, env=env, seed=args.seed,
                         device="cpu", verbose=1)
    (run / "config.json").write_text(json.dumps({
        "environment": ENV_ID, "algorithm": "PPO", "seed": args.seed,
        "requested_steps": args.steps, "reward": "Gymnasium default",
        "resumed_from": str(args.resume.resolve()) if args.resume else None,
        "starting_steps": model.num_timesteps,
    }, indent=2), encoding="utf-8")
    model.set_logger(configure(str(run / "logs"), ["stdout", "csv"]))
    callbacks = [
        CheckpointCallback(save_freq=50_000, save_path=str(run / "checkpoints")),
        EvalCallback(evaluation, best_model_save_path=str(run / "best"),
                     log_path=str(run / "evaluation"), eval_freq=20_000,
                     n_eval_episodes=5, deterministic=True),
    ]
    try:
        model.learn(total_timesteps=args.steps, callback=callbacks,
                    reset_num_timesteps=args.resume is None)
    except KeyboardInterrupt:
        print("\nTraining interrupted; saving current policy.")
    finally:
        model.save(run / "final_model")
        env.close()
        evaluation.close()
    print(f"Saved {run / 'final_model.zip'}")


def rollout(args):
    model = None
    if not args.random:
        if args.model is None or not args.model.is_file():
            raise ValueError("Provide --model path/to/model.zip, or use --random.")
        model = PPO.load(args.model, device="cpu")
    env = gym.make(ENV_ID, render_mode="human" if args.command == "watch" else None)
    returns = []
    flights = []
    outcomes = {"landed": 0, "off_pad": 0, "unsafe_landing": 0,
                "crashed": 0, "out_of_bounds": 0, "timeout": 0}
    try:
        for episode in range(args.episodes):
            observation, _ = env.reset(seed=args.seed + episode)
            env.action_space.seed(args.seed + episode)
            total = 0.0
            steps = 0
            while True:
                action = (env.action_space.sample() if model is None else
                          int(model.predict(observation, deterministic=True)[0]))
                observation, reward, terminated, truncated, _ = env.step(action)
                total += reward
                steps += 1
                if terminated or truncated:
                    outcome = flight_outcome(env, observation, terminated)
                    outcomes[outcome] += 1
                    returns.append(total)
                    flights.append({"seed": args.seed + episode,
                                    "reward": total, "steps": steps,
                                    "outcome": outcome})
                    print(f"Episode {episode + 1:>3}: reward {total:>8.1f} | {outcome}")
                    break
    finally:
        env.close()
    report = {"environment": ENV_ID, "outcome_rule": OUTCOME_RULE,
              "policy": "random" if model is None else str(args.model),
              "seed": args.seed, "episodes": args.episodes,
              "mean_reward": float(np.mean(returns)),
              "std_reward": float(np.std(returns)), "outcomes": outcomes,
              "episode_rewards": returns, "flights": flights,
              "landing_rate": outcomes["landed"] / args.episodes}
    print(f"Mean reward: {report['mean_reward']:.1f} +/- {report['std_reward']:.1f}")
    print(f"Pad landings: {outcomes['landed']}/{args.episodes}")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo", help="Open the browser mission-control demo")
    demo.add_argument("--port", type=positive, default=8000)
    demo.add_argument("--model", type=Path,
                      default=Path("runs/continued/final_model.zip"))
    demo.add_argument("--best-model", type=Path,
                      default=Path("runs/continued/best/best_model.zip"))
    demo.add_argument("--no-browser", action="store_true")
    def start_demo(args):
        from rocket_demo import serve
        serve(args)
    demo.set_defaults(func=start_demo)
    training = commands.add_parser("train", help="Train PPO and save checkpoints")
    training.add_argument("--steps", type=positive, default=1_000_000,
                          help="Additional training steps (rounded up to full rollouts)")
    training.add_argument("--resume", type=Path,
                          help="Continue training a saved PPO model in a new run folder")
    training.add_argument("--seed", type=nonnegative, default=42)
    training.add_argument("--run", type=Path, default=Path("runs/first"))
    training.set_defaults(func=train)
    for command in ("watch", "evaluate"):
        sub = commands.add_parser(command, help="Replay flights" if command == "watch" else "Measure performance without a window")
        policy = sub.add_mutually_exclusive_group(required=True)
        policy.add_argument("--model", type=Path)
        policy.add_argument("--random", action="store_true")
        sub.add_argument("--episodes", type=positive, default=5 if command == "watch" else 20)
        sub.add_argument("--seed", type=nonnegative, default=100)
        sub.add_argument("--output", type=Path, help="Write evaluation results as JSON")
        sub.set_defaults(func=rollout)
    args = parser.parse_args()
    try:
        args.func(args)
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
