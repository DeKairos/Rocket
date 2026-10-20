"""Local mission control: real simulator trajectories, browser-side playback."""

from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from io import BytesIO
import hashlib
import json
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlsplit
import webbrowser

import gymnasium as gym
from gymnasium.envs.box2d.lunar_lander import FPS, SCALE, VIEWPORT_H, VIEWPORT_W
from stable_baselines3 import PPO
import torch

from rocket import ENV_ID, flight_outcome
from rocket_experiment import (ExperimentMismatchError, decision_record, digest,
                               experiment_record, trajectory_revision)


class MissionControl:
    def __init__(self, model, best_model, reports=Path("runs")):
        self.paths = {"trained": Path(model), "best": Path(best_model)}
        self.models = {}
        self.model_records = {}
        self.lock = Lock()
        self.reports = Path(reports)

    def status(self):
        benchmarks = {}
        for policy, filename in (("random", "random.json"),
                                 ("trained", "trained-final.json"),
                                 ("best", "trained-best.json")):
            path = self.reports / filename
            if path.is_file():
                try:
                    report = json.loads(path.read_text(encoding="utf-8"))
                    benchmarks[policy] = {key: report[key] for key in
                                          ("episodes", "seed", "mean_reward",
                                           "std_reward", "outcomes", "landing_rate")}
                except (ValueError, KeyError, TypeError):
                    pass
        return {"environment": ENV_ID, "fps": FPS,
                "policies": {"random": True, **{
                    key: path.is_file() for key, path in self.paths.items()}},
                "benchmarks": benchmarks}

    def flight(self, policy, seed, interventions=(), expected_context_id=None, diagnostics=True):
        if policy not in ("random", "trained", "best"):
            raise ValueError("Unknown policy. Choose trained, best, or random.")
        if seed < 0 or seed > 2**32 - 1:
            raise ValueError("Seed must be between 0 and 4294967295.")
        if not isinstance(interventions, (list, tuple)) or len(interventions) > 12:
            raise ValueError("A flight supports up to 12 pushes.")
        pushes = {}
        for item in interventions:
            if (not isinstance(item, dict) or set(item) != {"step", "direction"}
                    or type(item["step"]) is not int or not 0 <= item["step"] < 1000
                    or type(item["direction"]) is not int or item["direction"] not in (-1, 1)):
                raise ValueError("Each push needs a step from 0 to 999 and direction -1 or 1.")
            if item["step"] in pushes:
                raise ValueError("Only one push is allowed per simulation step.")
            pushes[item["step"]] = item["direction"]
        with self.lock:
            model = None
            if policy != "random":
                path = self.paths[policy]
                if not path.is_file():
                    raise FileNotFoundError(
                        "Policy file is missing. Train a model, then launch "
                        "rocket demo --model path/to/final_model.zip "
                        "--best-model path/to/best_model.zip. Random flights are available."
                    )
                if policy not in self.models:
                    data = path.read_bytes()
                    self.models[policy] = PPO.load(BytesIO(data), device="cpu")
                    self.model_records[policy] = {
                        'checkpoint': path.name, 'sha256': hashlib.sha256(data).hexdigest(),
                        'training_steps': int(self.models[policy].num_timesteps)}
                model = self.models[policy]
            env = gym.make(ENV_ID)
            try:
                observation, _ = env.reset(seed=seed)
                env.action_space.seed(seed)
                world = env.unwrapped
                experiment = experiment_record(env, seed, policy, self.model_records.get(policy))
                context_id = digest(experiment)
                if expected_context_id is not None and expected_context_id != context_id:
                    raise ExperimentMismatchError('Experiment changed. Launch a new flight before comparing or pushing.')
                terrain = [list(map(float, poly[0])) for poly in world.sky_polys]
                terrain.append(list(map(float, world.sky_polys[-1][1])))
                total = 0.0
                terminated = False
                step = 0
                frames = [self.frame(world, observation, 0, 0, total)]
                for step in range(1, env.spec.max_episode_steps + 1):
                    if step - 1 in pushes:
                        # A horizontal impulse changes velocity by 1.5 simulator
                        # units/s. Feed the changed state into the next decision.
                        body = world.lander
                        body.ApplyLinearImpulse(
                            (body.mass * 1.5 * pushes[step - 1], 0),
                            body.worldCenter, True)
                        observation = observation.copy()
                        observation[2] = body.linearVelocity.x * (VIEWPORT_W / SCALE / 2) / FPS
                    action = (int(env.action_space.sample()) if model is None else
                              int(model.predict(observation, deterministic=True)[0]))
                    decision = decision_record(model, observation, action, step-1) if diagnostics else None
                    observation, reward, terminated, truncated, _ = env.step(action)
                    total += float(reward)
                    frames.append(self.frame(world, observation, action, step, total, decision))
                    if terminated or truncated:
                        break
                if any(push_step >= step for push_step in pushes):
                    raise ValueError("Cannot push a flight after its episode has ended.")
                result = {"policy": policy, "seed": seed, "fps": FPS,
                        'schema_version': 2, 'experiment': experiment, 'context_id': context_id,
                        "world": {"width": VIEWPORT_W / SCALE,
                                  "height": VIEWPORT_H / SCALE,
                                  "terrain": terrain,
                                  "pad": [world.helipad_x1, world.helipad_x2,
                                          world.helipad_y]},
                        "frames": frames, "steps": step, "reward": total,
                        "outcome": flight_outcome(env, observation, terminated),
                        "interventions": list(interventions),
                        "model_steps": int(model.num_timesteps) if model else 0}
                result['revision_id'] = trajectory_revision(result)
                return result
            finally:
                env.close()

    @staticmethod
    def frame(world, observation, action, step, reward, decision=None):
        bodies = []
        for body in [world.lander, *world.legs]:
            bodies.append([[float(point[0]), float(point[1])]
                           for point in (body.transform * vertex
                                         for vertex in body.fixtures[0].shape.vertices)])
        return {"step": step, 'decision': decision, "position": list(map(float, world.lander.position)),
                "velocity": list(map(float, world.lander.linearVelocity)),
                "angle": float(world.lander.angle), "action": action,
                "reward": reward, "contacts": [bool(observation[6]), bool(observation[7])],
                "bodies": bodies}


class DemoHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, mission, **kwargs):
        self.mission = mission
        super().__init__(*args, **kwargs)

    def send_body(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, data):
        self.send_body(status, json.dumps(data, separators=(',', ':')).encode("utf-8"), "application/json")

    def do_GET(self):
        url = urlsplit(self.path)
        try:
            if url.path == "/api/status":
                self.send_json(200, self.mission.status())
            elif url.path == "/api/flight":
                query = parse_qs(url.query)
                seed = int(query.get("seed", ["100"])[0])
                policy = query.get("policy", ["trained"])[0]
                interventions = json.loads(query.get("interventions", ["[]"])[0])
                expected_context_id = query.get('expected_context_id', [None])[0]
                self.send_json(200, self.mission.flight(policy, seed, interventions, expected_context_id))
            else:
                assets = {"/": ("index.html", "text/html; charset=utf-8"),
                          "/style.css": ("style.css", "text/css; charset=utf-8"),
                          "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                          "/favicon.svg": ("favicon.svg", "image/svg+xml")}
                if url.path not in assets:
                    self.send_json(404, {"error": "Not found"})
                    return
                filename, content_type = assets[url.path]
                self.send_body(200, files("rocket_ui").joinpath(filename).read_bytes(),
                               content_type)
        except ExperimentMismatchError as error:
            self.send_json(409, {'error': str(error)})
        except FileNotFoundError as error:
            self.send_json(404, {"error": str(error)})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.send_json(500, {"error": "Simulation failed. Check the server terminal."})
            raise


def serve(args):
    if args.port > 65535:
        raise ValueError("Port must be between 1 and 65535.")
    torch.set_num_threads(1)
    mission = MissionControl(args.model, args.best_model)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port),
                                     partial(DemoHandler, mission=mission))
    except OSError as error:
        raise ValueError(f"Cannot start demo on port {args.port}: {error}") from error
    url = f"http://127.0.0.1:{args.port}"
    print(f"\nROCKET / Mission Control\n{url}\nCtrl+C to stop.\n", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nMission control offline.")
    finally:
        server.server_close()
