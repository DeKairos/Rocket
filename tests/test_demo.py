"""Exercise simulator parity and the local browser API without run artifacts."""

import argparse
from contextlib import redirect_stdout
from functools import partial
from http.server import ThreadingHTTPServer
import io
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

from stable_baselines3 import PPO
import torch

from rocket import ENV_ID, rollout
from rocket_demo import DemoHandler, MissionControl


class DemoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls.directory.name)
        cls.model_path = cls.root / "policy.zip"
        model = PPO("MlpPolicy", ENV_ID, seed=42, device="cpu", n_steps=1024)
        model.save(cls.model_path)
        model.get_env().close()
        cls.mission = MissionControl(cls.model_path, cls.root / "missing.zip", cls.root)
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(DemoHandler, mission=cls.mission))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.directory.cleanup()

    def test_browser_trajectory_matches_cli_for_both_controllers(self):
        for policy in ("random", "trained"):
            with self.subTest(policy=policy):
                with urlopen(f"{self.url}/api/flight?policy={policy}&seed=100") as response:
                    flight = json.load(response)
                output = self.root / f"cli-{policy}.json"
                args = argparse.Namespace(
                    random=policy == "random", model=self.model_path,
                    command="evaluate", episodes=1, seed=100, output=output)
                with redirect_stdout(io.StringIO()):
                    rollout(args)
                report = json.loads(output.read_text(encoding="utf-8"))
                self.assertEqual(flight["reward"], report["episode_rewards"][0])
                self.assertEqual(flight["outcome"], report["flights"][0]["outcome"])
                self.assertEqual(flight["steps"], report["flights"][0]["steps"])
                self.assertEqual(len(flight["frames"]), flight["steps"] + 1)
                self.assertEqual(flight["frames"][-1]["reward"], flight["reward"])
                self.assertEqual(len(flight["world"]["terrain"]), 11)
                self.assertEqual(len(flight["frames"][0]["bodies"]), 3)
                self.assertTrue(all(0 <= f["action"] <= 3 for f in flight["frames"]))

    def test_bad_requests_and_missing_policy_have_actionable_errors(self):
        for query, code in (("seed=-1", 400), ("seed=4.5", 400),
                            ("seed=4294967296", 400), ("policy=unknown", 400),
                            ("policy=best", 404)):
            with self.subTest(query=query):
                with self.assertRaises(HTTPError) as error:
                    urlopen(f"{self.url}/api/flight?{query}")
                self.assertEqual(error.exception.code, code)
                self.assertIn("error", json.load(error.exception))

    def test_push_changes_only_future_physics_and_replays_exactly(self):
        for policy in ("random", "trained"):
            with self.subTest(policy=policy):
                original = self.mission.flight(policy, 100)
                pushes = [{"step": 10, "direction": 1}]
                changed = self.mission.flight(policy, 100, pushes)
                self.assertEqual(changed["frames"][:11], original["frames"][:11])
                self.assertNotEqual(changed["frames"][11]["velocity"],
                                    original["frames"][11]["velocity"])
                self.assertEqual(changed["interventions"], pushes)
                self.assertEqual(changed, self.mission.flight(policy, 100, pushes))
                second = self.mission.flight(policy, 100, pushes + [{"step": 20, "direction": -1}])
                self.assertEqual(second["frames"][:21], changed["frames"][:21])
                self.assertNotEqual(second["frames"][21], changed["frames"][21])

    def test_push_validation(self):
        invalid = [None, {}, [{"step": -1, "direction": 1}],
                   [{"step": 1000, "direction": 1}], [{"step": 1.5, "direction": 1}],
                   [{"step": True, "direction": 1}], [{"step": 1, "direction": 0}],
                   [{"step": 1, "direction": True}], [{"step": 1}],
                   [{"step": 1, "direction": 1}] * 2,
                   [{"step": n, "direction": 1} for n in range(13)]]
        for pushes in invalid:
            with self.subTest(pushes=pushes):
                query = urlencode({"policy": "random", "interventions": json.dumps(pushes)})
                with self.assertRaises(HTTPError) as error:
                    urlopen(f"{self.url}/api/flight?{query}")
                self.assertEqual(error.exception.code, 400)
        flight = self.mission.flight("random", 100)
        with self.assertRaisesRegex(ValueError, "episode has ended"):
            self.mission.flight("random", 100, [{"step": flight["steps"], "direction": 1}])

    def test_status_and_packaged_assets(self):
        with urlopen(f"{self.url}/api/status") as response:
            status = json.load(response)
        self.assertEqual(status["policies"], {"random": True, "trained": True, "best": False})
        self.assertEqual(status["benchmarks"], {})
        for path, content_type in (("/", "text/html"), ("/style.css", "text/css"),
                                   ("/app.js", "text/javascript"),
                                   ("/favicon.svg", "image/svg+xml")):
            with self.subTest(path=path), urlopen(self.url + path) as response:
                self.assertEqual(response.status, 200)
                self.assertIn(content_type, response.headers["Content-Type"])
                self.assertGreater(len(response.read()), 50)
        with self.assertRaises(HTTPError) as error:
            urlopen(f"{self.url}/rocket.py")
        self.assertEqual(error.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
