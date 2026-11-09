# SOS_TRIGGER delivery. Pure logic (no machine import) so it runs under CPython host tests and on the board.
import linkd_ble
from frames import sos_trigger_frame


class TriggerSender:
    """Holds the one pending SOS trigger and says when to (re)send it.

    Sent at once, then every TRIGGER_RESEND_MS while connected, until the app acks its seq. Kept
    across disconnects and sent at once on reconnect; dropped once TRIGGER_PENDING_MS old (the
    link loss starts its own SOS on the phone). A new hold replaces a pending trigger with a new seq.
    """

    def __init__(self, first_seq=0, ticks_diff=lambda a, b: a - b):
        self._next_seq = first_seq
        self._ticks_diff = ticks_diff
        self._seq = None
        self._created = 0
        self._last_sent = None

    def trigger(self, now_ms):
        self._seq = self._next_seq
        self._next_seq = (self._next_seq + 1) % 256
        self._created = now_ms
        self._last_sent = None
        return self._seq

    def ack(self, seq):
        if seq == self._seq:
            self._seq = None

    def due(self, now_ms, connected):
        """The frame to send now, or None."""
        if self._seq is None:
            return None
        if self._ticks_diff(now_ms, self._created) >= linkd_ble.TRIGGER_PENDING_MS:
            self._seq = None
            return None
        if not connected:
            # Sent at once when the link is back.
            self._last_sent = None
            return None
        if self._last_sent is not None and self._ticks_diff(now_ms, self._last_sent) < linkd_ble.TRIGGER_RESEND_MS:
            return None
        self._last_sent = now_ms
        return sos_trigger_frame(self._seq)
