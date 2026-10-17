"""CLI regression checks using the real Lunar Lander simulator."""

from collections import Counter
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(ROOT / "rocket.py"), *args],
            cwd=ROOT, capture_output=True, text=True,
        )

    def test_negative_seeds_are_rejected_before_running(self):
        for command in ("train", "watch", "evaluate"):
            with self.subTest(command=command):
                policy = [] if command == "train" else ["--random"]
                result = self.run_cli(command, "--seed", "-1", *policy)
                self.assertEqual(result.returncode, 2)
                self.assertIn("must be at least 0", result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertEqual(result.stdout, "")

    def test_evaluation_is_repeatable_and_flights_match_summary(self):
        reports = []
        with tempfile.TemporaryDirectory() as directory:
            for index in range(2):
                output = Path(directory) / f"report-{index}.json"
                result = self.run_cli(
                    "evaluate", "--random", "--seed", "0",
                    "--episodes", "3", "--output", str(output),
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                reports.append(json.loads(output.read_text(encoding="utf-8")))
        self.assertEqual(reports[0], reports[1])
        report = reports[0]
        flights = report["flights"]
        self.assertEqual(report["environment"], "LunarLander-v3")
        self.assertEqual([flight["seed"] for flight in flights], [0, 1, 2])
        self.assertEqual([flight["reward"] for flight in flights],
                         report["episode_rewards"])
        self.assertTrue(all(0 < flight["steps"] <= 1000 for flight in flights))
        counts = Counter(flight["outcome"] for flight in flights)
        self.assertEqual(sum(report["outcomes"].values()), report["episodes"])
        for outcome, count in report["outcomes"].items():
            self.assertEqual(counts[outcome], count)
        self.assertEqual(report["landing_rate"], counts["landed"] / 3)


if __name__ == "__main__":
    unittest.main()
