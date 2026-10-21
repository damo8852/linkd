import unittest

from button import Debouncer


def feed(deb, samples):
    """samples: (ms, level) pairs; level 0 = pressed (pull-up). Returns the emitted events with times."""
    return [(ms, ev) for ms, level in samples if (ev := deb.update(level, ms))]


class DebouncerTest(unittest.TestCase):
    def test_a_clean_press_and_release_each_emit_once_after_the_settle_time(self):
        deb = Debouncer(settle_ms=30)
        events = feed(deb, [(0, 1), (10, 0), (20, 0), (40, 0), (50, 0), (100, 1), (120, 1), (130, 1)])
        self.assertEqual(events, [(40, 'pressed'), (130, 'released')])

    def test_contact_bounce_shorter_than_the_settle_time_emits_nothing(self):
        deb = Debouncer(settle_ms=30)
        events = feed(deb, [(0, 1), (10, 0), (15, 1), (20, 0), (25, 1), (60, 1)])
        self.assertEqual(events, [])

    def test_bounce_before_a_real_press_delays_it_until_the_level_is_stable(self):
        deb = Debouncer(settle_ms=30)
        events = feed(deb, [(0, 0), (5, 1), (10, 0), (39, 0), (40, 0)])
        self.assertEqual(events, [(40, 'pressed')])

    def test_holding_the_button_does_not_repeat_the_press(self):
        deb = Debouncer(settle_ms=30)
        events = feed(deb, [(t, 0) for t in range(0, 5000, 10)])
        self.assertEqual(events, [(30, 'pressed')])

    def test_starts_released_so_an_idle_button_emits_nothing(self):
        deb = Debouncer(settle_ms=30)
        self.assertEqual(feed(deb, [(t, 1) for t in range(0, 1000, 10)]), [])

    def test_uses_the_given_tick_difference_so_a_wrapping_clock_still_works(self):
        wrap = 1 << 30
        deb = Debouncer(settle_ms=30, ticks_diff=lambda a, b: (a - b) % wrap)
        events = feed(deb, [(wrap - 10, 0), (5, 0), (20, 0)])
        self.assertEqual(events, [(20, 'pressed')])


if __name__ == '__main__':
    unittest.main()
