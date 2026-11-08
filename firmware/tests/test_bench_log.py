import unittest

from bench_log import boot_line, heartbeat_line, start_line, stop_line, summarize


class BootLineTest(unittest.TestCase):
    def test_a_power_on_in_the_middle_of_a_run_is_unexpected(self):
        prev = [start_line('stress'), heartbeat_line(60), heartbeat_line(120)]
        self.assertEqual(boot_line('PWRON_RESET', prev), 'BOOT cause=PWRON_RESET unexpected=1 last_up_s=120')

    def test_a_power_on_after_a_clean_stop_is_expected(self):
        prev = [start_line('idle'), heartbeat_line(60), stop_line()]
        self.assertEqual(boot_line('PWRON_RESET', prev), 'BOOT cause=PWRON_RESET unexpected=0 last_up_s=60')

    def test_a_first_boot_with_no_log_is_expected(self):
        self.assertEqual(boot_line('PWRON_RESET', []), 'BOOT cause=PWRON_RESET unexpected=0 last_up_s=0')

    def test_a_soft_reset_is_never_unexpected(self):
        prev = [start_line('stress'), heartbeat_line(60)]
        self.assertEqual(boot_line('SOFT_RESET', prev), 'BOOT cause=SOFT_RESET unexpected=0 last_up_s=60')

    def test_a_crash_or_watchdog_mid_run_is_unexpected(self):
        prev = [start_line('stress'), heartbeat_line(60)]
        self.assertIn('unexpected=1', boot_line('HARD_RESET', prev))
        self.assertIn('unexpected=1', boot_line('WDT_RESET', prev))


class SummarizeTest(unittest.TestCase):
    def test_counts_runs_unexpected_resets_and_the_longest_run(self):
        lines = [
            boot_line('PWRON_RESET', []),
            start_line('stress'),
            heartbeat_line(60),
            heartbeat_line(120),
            'BOOT cause=PWRON_RESET unexpected=1 last_up_s=120',
            start_line('stress'),
            heartbeat_line(60),
            stop_line(),
        ]
        self.assertEqual(
            summarize(lines),
            {'runs': 2, 'unexpected_resets': 1, 'longest_up_s': 120, 'last_up_s': 60, 'stopped_cleanly': True},
        )

    def test_a_run_that_never_stopped_reports_the_last_heartbeat(self):
        lines = [start_line('idle'), heartbeat_line(60), heartbeat_line(7200)]
        s = summarize(lines)
        self.assertEqual((s['runs'], s['last_up_s'], s['stopped_cleanly']), (1, 7200, False))

    def test_garbage_lines_are_ignored(self):
        self.assertEqual(summarize(['', 'UP x', 'nonsense'])['runs'], 0)


if __name__ == '__main__':
    unittest.main()
