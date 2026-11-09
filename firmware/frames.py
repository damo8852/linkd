# BLE frames sent by the bangle. Pure logic; layout comes from the generated protocol module.
import linkd_ble


def button_frame(pressed):
    state = linkd_ble.BUTTON_PRESSED if pressed else linkd_ble.BUTTON_RELEASED
    return bytes((linkd_ble.PROTOCOL_VERSION, linkd_ble.MSG_BUTTON_EVENT, state))


def sos_trigger_frame(seq):
    return bytes((linkd_ble.PROTOCOL_VERSION, linkd_ble.MSG_SOS_TRIGGER, seq))


def battery_critical_frame():
    return bytes((linkd_ble.PROTOCOL_VERSION, linkd_ble.MSG_BATTERY_CRITICAL))


def parse_ack(data):
    """The seq of a well-formed ACK from the app, or None for anything else."""
    data = bytes(data)
    if len(data) == 3 and data[0] == linkd_ble.PROTOCOL_VERSION and data[1] == linkd_ble.MSG_ACK:
        return data[2]
    return None
