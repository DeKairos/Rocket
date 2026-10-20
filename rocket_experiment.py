"""Identity and passive diagnostics for the local simulation records."""
import copy
import hashlib
from importlib.metadata import version
import json
import platform

import numpy as np
import torch
from gymnasium.envs.box2d.lunar_lander import FPS, SCALE


class ExperimentMismatchError(ValueError):
    """The requested reference would use different experimental conditions."""


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False).encode()).hexdigest()


def experiment_record(env, seed, policy, model_record):
    world = env.unwrapped
    return {
        'environment': {'id': env.spec.id, 'gravity': float(world.world.gravity.y),
                        'continuous': world.continuous, 'enable_wind': world.enable_wind,
                        'wind_power': world.wind_power, 'turbulence_power': world.turbulence_power,
                        'max_episode_steps': env.spec.max_episode_steps, 'scale': SCALE},
        'runtime': {'python': platform.python_version(), 'platform': platform.system(),
                    'machine': platform.machine(), 'device': 'cpu',
                    'torch_threads': torch.get_num_threads(),
                    'versions': {name: version(name) for name in
                                 ('gymnasium', 'stable-baselines3', 'torch', 'numpy', 'Box2D')}},
        'seed': seed, 'controller': policy, 'fps': FPS,
        'inference_mode': 'seeded_random' if policy == 'random' else 'deterministic',
        'model': copy.deepcopy(model_record),
        'initial_rng': {'environment_rng': copy.deepcopy(env.np_random.bit_generator.state),
                        'action_space_rng': copy.deepcopy(env.action_space.np_random.bit_generator.state)},
        'units': 'simulator units', 'dynamics': '2D', 'weights_fixed': True,
    }


def decision_record(model, observation, action, source_step):
    if model is None:
        probabilities = [.25] * 4
    else:
        with torch.no_grad():
            tensor, _ = model.policy.obs_to_tensor(observation)
            probabilities = model.policy.get_distribution(tensor).distribution.probs[0].cpu().numpy().tolist()
    values = np.asarray(probabilities)
    if (values.shape != (4,) or not np.isfinite(values).all() or (values < 0).any()
            or abs(float(values.sum()) - 1.) > 1e-6):
        raise ValueError('Policy action probabilities must be four finite nonnegative values summing to one.')
    return {'source_step': source_step, 'observation': list(map(float, observation)),
            'probabilities': probabilities, 'selected_action': action}


def trajectory_revision(flight):
    # Diagnostics are optional; recording them cannot change experimental identity.
    return digest({'context_id': flight['context_id'], 'interventions': flight['interventions'],
                   'frames': [{k: v for k, v in frame.items() if k != 'decision'}
                              for frame in flight['frames']],
                   'outcome': flight['outcome']})
