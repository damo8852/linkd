import unittest

import linkd_ble
from frames import button_frame


class FramesTest(unittest.TestCase):
    def test_button_frames_match_the_app_encoder(self):
        self.assertEqual(button_frame(True), linkd_ble.FRAME_BUTTON_PRESSED)
        self.assertEqual(button_frame(False), linkd_ble.FRAME_BUTTON_RELEASED)


if __name__ == '__main__':
    unittest.main()
