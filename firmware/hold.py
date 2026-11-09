# SOS hold detection. Pure logic (no machine import) so it runs under CPython host tests and on the board.


class HoldDetector:
    """Says True exactly once per press, the moment the button has been held for hold_ms.

    Feed it the debounced button state on every loop. ticks_diff(a, b) returns a - b in ms; pass
    time.ticks_diff on the board, where ticks wrap.
    """

    def __init__(self, hold_ms, ticks_diff=lambda a, b: a - b):
        self._hold_ms = hold_ms
        self._ticks_diff = ticks_diff
        self._pressed_at = None
        self._fired = False

    def update(self, pressed, now_ms):
        if not pressed:
            self._pressed_at = None
            self._fired = False
            return False
        if self._pressed_at is None:
            self._pressed_at = now_ms
        if not self._fired and self._ticks_diff(now_ms, self._pressed_at) >= self._hold_ms:
            self._fired = True
            return True
        return False
