"""A sleeping body alone cannot confirm that the landing pad was reached."""
from types import SimpleNamespace
import unittest

from rocket import flight_outcome


class OutcomeTests(unittest.TestCase):
    def terminal(self, gear=(9, 11), contacts=(True, True), awake=False,
                 game_over=False, x=0):
        world = SimpleNamespace(
            game_over=game_over, lander=SimpleNamespace(awake=awake),
            helipad_x1=8, helipad_x2=12,
            legs=[SimpleNamespace(position=SimpleNamespace(x=value)) for value in gear])
        return SimpleNamespace(unwrapped=world), [x, 0, 0, 0, 0, 0, *contacts]

    def test_sleeping_off_pad_is_not_a_confirmed_landing(self):
        env, obs = self.terminal(gear=(5, 7))
        self.assertEqual(flight_outcome(env, obs, True), 'off_pad')

    def test_both_gear_supports_must_be_inside_the_pad(self):
        env, obs = self.terminal(gear=(7.9, 9.9))
        self.assertEqual(flight_outcome(env, obs, True), 'off_pad')

    def test_both_legs_must_have_ground_contact(self):
        env, obs = self.terminal(contacts=(True, False))
        self.assertEqual(flight_outcome(env, obs, True), 'unsafe_landing')

    def test_resting_on_pad_with_both_contacts_is_confirmed(self):
        env, obs = self.terminal()
        self.assertEqual(flight_outcome(env, obs, True), 'landed')

    def test_crash_bounds_and_timeout_take_precedence(self):
        for args, terminated, expected in [
            ({'game_over': True}, True, 'crashed'),
            ({'x': 1}, True, 'out_of_bounds'),
            ({'awake': True}, False, 'timeout'),
            ({}, False, 'timeout')]:
            with self.subTest(expected=expected, args=args):
                env, obs = self.terminal(**args)
                self.assertEqual(flight_outcome(env, obs, terminated), expected)
