"""Scientific records must describe the actual decision without altering flight."""
import hashlib
import tempfile
from pathlib import Path
import unittest

import numpy as np
from stable_baselines3 import PPO
import torch

from rocket import ENV_ID
from rocket_demo import MissionControl


class ExperimentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)
        cls.directory = tempfile.TemporaryDirectory()
        cls.path = Path(cls.directory.name) / 'model.zip'
        model = PPO('MlpPolicy', ENV_ID, seed=42, device='cpu', n_steps=1024)
        model.save(cls.path)
        model.get_env().close()

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def mission(self):
        return MissionControl(self.path, self.path)

    def test_decision_records_use_exact_pre_action_observation(self):
        flight = self.mission().flight('trained', 100, [{'step':10,'direction':1}])
        self.assertIn('experiment', flight)
        self.assertIsNone(flight['frames'][0]['decision'])
        for frame in flight['frames'][1:]:
            decision = frame['decision']
            self.assertEqual(decision['source_step'], frame['step']-1)
            self.assertEqual(len(decision['observation']), 8)
            self.assertEqual(decision['selected_action'], frame['action'])
            self.assertEqual(len(decision['probabilities']), 4)
            self.assertTrue(np.isfinite(decision['probabilities']).all())
            self.assertTrue(all(p >= 0 for p in decision['probabilities']))
            self.assertAlmostEqual(sum(decision['probabilities']), 1., delta=1e-6)
            self.assertEqual(np.argmax(decision['probabilities']), frame['action'])
        expected = (flight['frames'][10]['velocity'][0] + 1.5) * .2
        self.assertAlmostEqual(flight['frames'][11]['decision']['observation'][2], expected, places=6)

    def test_diagnostics_leave_learned_and_random_trajectories_unchanged(self):
        mission = self.mission()
        for policy in ('random', 'trained'):
            plain = mission.flight(policy, 100, diagnostics=False)
            recorded = mission.flight(policy, 100)
            for frame in recorded['frames']:
                frame.pop('decision')
            for frame in plain['frames']:
                frame.pop('decision')
            self.assertEqual(plain, recorded)

    def test_context_and_revision_distinguish_inputs_and_branches(self):
        mission = self.mission()
        first = mission.flight('random', 100)
        self.assertIn('context_id', first)
        self.assertEqual(first, mission.flight('random', 100))
        changed = mission.flight('random',100,[{'step':10,'direction':1}], expected_context_id=first['context_id'])
        self.assertEqual(changed['context_id'], first['context_id'])
        self.assertNotEqual(changed['revision_id'], first['revision_id'])
        self.assertEqual(first['frames'][:11], changed['frames'][:11])
        self.assertNotEqual(first['context_id'], mission.flight('random',101)['context_id'])
        self.assertIn('environment_rng',first['experiment']['initial_rng'])
        self.assertEqual(first['experiment']['environment']['gravity'], -10.)
        self.assertEqual(first['experiment']['inference_mode'],'seeded_random')
        for frame in first['frames'][1:]:
            self.assertEqual(frame['decision']['probabilities'], [.25]*4)

    def test_context_mismatch_is_rejected(self):
        from rocket_experiment import ExperimentMismatchError
        with self.assertRaises(ExperimentMismatchError):
            self.mission().flight('random',100,expected_context_id='wrong')

    def test_cached_fingerprint_describes_loaded_bytes_after_file_replacement(self):
        data = self.path.read_bytes()
        mission = self.mission()
        first = mission.flight('trained',100)
        self.assertIn('experiment', first)
        try:
            self.path.write_bytes(b'replaced file is not the loaded checkpoint')
            cached = mission.flight('trained',100)
            self.assertEqual(first,cached)
            self.assertEqual(cached['experiment']['model']['sha256'], hashlib.sha256(data).hexdigest())
        finally:
            self.path.write_bytes(data)


if __name__ == '__main__':
    unittest.main()
