# BLE frames sent by the bangle. Pure logic; layout comes from the generated protocol module.
import linkd_ble


def button_frame(pressed):
    state = linkd_ble.BUTTON_PRESSED if pressed else linkd_ble.BUTTON_RELEASED
    return bytes((linkd_ble.PROTOCOL_VERSION, linkd_ble.MSG_BUTTON_EVENT, state))
