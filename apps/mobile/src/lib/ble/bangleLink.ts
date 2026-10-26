import { decodeFrame, PROTOCOL_VERSION, type Frame } from '@linkd/ble-protocol';

/** What the bangle side of a transport can tell the link. */
export type TransportHandlers = {
  onNotification: (bytes: Uint8Array) => void;
  onDisconnect: () => void;
};

/** The seam to the BLE library, so the link logic can be tested with a fake. */
export type BleTransport = {
  /** Finds the bangle, connects, and resolves with its raw version characteristic. Rejects if it cannot. */
  connect: (handlers: TransportHandlers) => Promise<Uint8Array>;
  disconnect: () => Promise<void>;
};

/** `unsupported`: a bangle answered, but on a protocol version this app does not speak. */
export type LinkState = 'connecting' | 'connected' | 'disconnected' | 'unsupported' | 'failed';

/**
 * Connects to the bangle and reports link state and decoded frames. Frames are passed on only
 * while the link is up and the bangle's protocol version has been accepted; malformed and
 * unknown frames are dropped. Never throws: a bangle that cannot be reached reports `failed`.
 *
 * These are button edges for display. Nothing here feeds the SOS state machine.
 */
export async function connectBangle(
  transport: BleTransport,
  on: { state: (state: LinkState) => void; event: (event: Frame) => void },
): Promise<void> {
  let accepted = false;
  let refused = false;
  on.state('connecting');

  let version: Uint8Array;
  try {
    version = await transport.connect({
      onNotification: (bytes) => {
        const frame = accepted ? decodeFrame(bytes) : null;
        if (frame !== null) {
          on.event(frame);
        }
      },
      onDisconnect: () => {
        accepted = false;
        // A refused bangle stays `unsupported`; dropping it is our own doing, not a lost link.
        if (!refused) {
          on.state('disconnected');
        }
      },
    });
  } catch {
    on.state('failed');
    return;
  }

  if (version.length !== 1 || version[0] !== PROTOCOL_VERSION) {
    refused = true;
    await transport.disconnect().catch(() => {});
    on.state('unsupported');
    return;
  }
  accepted = true;
  on.state('connected');
}
