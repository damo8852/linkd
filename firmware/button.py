# Button debounce. Pure logic (no machine import) so it runs under CPython host tests and on the board.
# The button pulls the pin to GND: level 0 = pressed, 1 = released (internal pull-up).


class Debouncer:
    """Emits 'pressed' / 'released' once the pin level has held steady for settle_ms.

    ticks_diff(a, b) returns a - b in ms; pass time.ticks_diff on the board, where ticks wrap.
    """

    def __init__(self, settle_ms=30, ticks_diff=lambda a, b: a - b):
        self._settle_ms = settle_ms
        self._ticks_diff = ticks_diff
        self._stable = 1  # start released, so an idle button emits nothing
        self._candidate = 1
        self._since = 0

    def update(self, level, now_ms):
        if level != self._candidate:
            self._candidate = level
            self._since = now_ms
            return None
        if self._candidate != self._stable and self._ticks_diff(now_ms, self._since) >= self._settle_ms:
            self._stable = self._candidate
            return 'pressed' if self._stable == 0 else 'released'
        return None
