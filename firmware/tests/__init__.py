# Host tests run under CPython: `python -m unittest` from firmware/.
# Make the firmware modules and the generated protocol module importable, as they are on the board.
import os
import sys

_here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(_here, '..'), os.path.join(_here, '..', '..', 'packages', 'ble-protocol', 'generated')]
