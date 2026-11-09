import unittest

import linkd_ble
from frames import battery_critical_frame, parse_ack, sos_trigger_frame
from hold import HoldDetector
from trigger import TriggerSender

HOLD = linkd_ble.SOS_HOLD_MS
RESEND = linkd_ble.TRIGGER_RESEND_MS
PENDING = linkd_ble.TRIGGER_PENDING_MS


class FramesTest(unittest.TestCase):
    def test_trigger_and_battery_frames_match_the_app_encoder(self):
        self.assertEqual(sos_trigger_frame(7), linkd_ble.FRAME_SOS_TRIGGER_7)
        self.assertEqual(battery_critical_frame(), linkd_ble.FRAME_BATTERY_CRITICAL)

    def test_an_ack_from_the_app_encoder_parses_to_its_seq(self):
        self.assertEqual(parse_ack(linkd_ble.FRAME_ACK_7), 7)

    def test_anything_but_a_well_formed_ack_is_ignored(self):
        for bad in (b'', b'\x02\x80', b'\x02\x80\x07\x00', b'\x01\x80\x07', b'\x02\x02\x07', linkd_ble.FRAME_BUTTON_PRESSED):
            self.assertIsNone(parse_ack(bad), bad)


class HoldDetectorTest(unittest.TestCase):
    def test_fires_once_when_the_button_has_been_held_for_the_full_hold(self):
        hold = HoldDetector(HOLD)
        self.assertFalse(hold.update(True, 0))
        self.assertFalse(hold.update(True, HOLD - 1))
        self.assertTrue(hold.update(True, HOLD))
        self.assertFalse(hold.update(True, HOLD + 10))
        self.assertFalse(hold.update(True, 10 * HOLD))

    def test_a_press_released_early_never_fires(self):
        hold = HoldDetector(HOLD)
        hold.update(True, 0)
        self.assertFalse(hold.update(False, HOLD - 1))
        self.assertFalse(hold.update(False, 10 * HOLD))

    def test_each_new_hold_can_fire_again_and_the_clock_restarts(self):
        hold = HoldDetector(HOLD)
        hold.update(True, 0)
        self.assertTrue(hold.update(True, HOLD))
        hold.update(False, HOLD + 100)
        self.assertFalse(hold.update(True, HOLD + 200))
        self.assertFalse(hold.update(True, 2 * HOLD + 199))
        self.assertTrue(hold.update(True, 2 * HOLD + 200))

    def test_uses_the_injected_ticks_diff_so_board_tick_wrap_works(self):
        wrap = 1 << 30
        hold = HoldDetector(HOLD, ticks_diff=lambda a, b: (a - b) % wrap)
        hold.update(True, wrap - 1000)
        self.assertTrue(hold.update(True, HOLD - 1000))


class TriggerSenderTest(unittest.TestCase):
    def test_sends_at_once_then_resends_every_resend_interval_until_acked(self):
        sender = TriggerSender()
        seq = sender.trigger(0)
        self.assertEqual(sender.due(0, True), sos_trigger_frame(seq))
        self.assertIsNone(sender.due(RESEND - 1, True))
        self.assertEqual(sender.due(RESEND, True), sos_trigger_frame(seq))
        sender.ack(seq)
        self.assertIsNone(sender.due(10 * RESEND, True))

    def test_waits_while_disconnected_and_sends_at_once_on_reconnect(self):
        sender = TriggerSender()
        seq = sender.trigger(0)
        self.assertIsNone(sender.due(0, False))
        self.assertIsNone(sender.due(30_000, False))
        self.assertEqual(sender.due(30_001, True), sos_trigger_frame(seq))

    def test_a_reconnect_sends_at_once_even_inside_the_resend_interval(self):
        sender = TriggerSender()
        seq = sender.trigger(0)
        sender.due(0, True)
        self.assertIsNone(sender.due(RESEND // 2, False))
        self.assertEqual(sender.due(RESEND // 2 + 1, True), sos_trigger_frame(seq))

    def test_drops_a_trigger_still_unacked_after_the_pending_limit(self):
        sender = TriggerSender()
        sender.trigger(0)
        self.assertIsNotNone(sender.due(PENDING - 1, True))
        self.assertIsNone(sender.due(PENDING, True))
        self.assertIsNone(sender.due(PENDING + RESEND, True))

    def test_an_ack_for_another_seq_does_not_stop_the_resends(self):
        sender = TriggerSender()
        seq = sender.trigger(0)
        sender.ack((seq + 1) % 256)
        self.assertEqual(sender.due(RESEND, True), sos_trigger_frame(seq))

    def test_each_trigger_gets_the_next_seq_wrapping_at_255(self):
        sender = TriggerSender(first_seq=254)
        self.assertEqual([sender.trigger(t) for t in (0, 1, 2)], [254, 255, 0])

    def test_a_new_hold_replaces_the_pending_one_and_the_old_ack_is_ignored(self):
        sender = TriggerSender()
        old = sender.trigger(0)
        new = sender.trigger(500)
        sender.ack(old)
        self.assertEqual(sender.due(500, True), sos_trigger_frame(new))

    def test_uses_the_injected_ticks_diff(self):
        wrap = 1 << 30
        sender = TriggerSender(ticks_diff=lambda a, b: (a - b) % wrap)
        seq = sender.trigger(wrap - 100)
        sender.due(wrap - 100, True)
        self.assertEqual(sender.due(RESEND - 100, True), sos_trigger_frame(seq))


if __name__ == '__main__':
    unittest.main()
