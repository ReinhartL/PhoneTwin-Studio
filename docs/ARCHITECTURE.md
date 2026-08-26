# Architecture

## Runtime components

```text
┌──────────────────────────────── iPhone ────────────────────────────────┐
│ PhoneTwinSender                                                       │
│   CoreMotion 60 Hz ── orientation JSON ────────────────┐              │
│                                                        │              │
│ PhoneTwinBroadcast                                     │              │
│   ReplayKit 30 FPS ── PTV1 + timestamp + JPEG ─────────┤              │
└────────────────────────────────────────────────────────┼──────────────┘
                                                         ▼
                                              Native WS :8788
                                                         │
                                              relay/server.mjs
                                                         │
                                              Browser WSS :8787
                                                         ▼
┌────────────────────────────── Mac browser ─────────────────────────────┐
│ React workbench                                                       │
│   Motion quaternion → modelPivot                                      │
│   JPEG frame → CanvasTexture → display-glass                          │
│   Three.js renderer → preview / MediaRecorder                         │
└────────────────────────────────────────────────────────────────────────┘
```

## Relay

`relay/server.mjs` exposes two listeners:

- `8788`: plain WebSocket for the native iOS app and Broadcast Extension.
- `8787`: HTTPS and secure WebSocket for the browser receiver, plus `/events` SSE.

Every connection can announce a `sessionId` with a hello message. Text and binary messages are forwarded only to peers with the same session when session metadata is available.

## Motion packets

Motion is encoded as JSON:

```json
{
  "type": "orientation",
  "source": "broadcast",
  "sessionId": "...",
  "timestamp": 0,
  "alpha": 0,
  "beta": 0,
  "gamma": 0,
  "quaternion": { "x": 0, "y": 0, "z": 0, "w": 1 }
}
```

The browser uses the quaternion directly. Calibration stores the inverse of the current quaternion and treats that pose as neutral. Presentation corrections belong on the model pivot rather than in the incoming sensor signal.

## Screen frames

The Broadcast Extension receives ReplayKit video sample buffers, limits output to about 30 FPS, JPEG-encodes each frame at quality `0.68`, and sends a binary envelope:

```text
4 bytes   ASCII magic "PTV1"
8 bytes   big-endian Unix timestamp in milliseconds
N bytes   JPEG payload
```

Only the latest pending binary frame is retained while a previous WebSocket send is in flight. This prevents a slow Wi-Fi link from accumulating seconds of stale video.

The browser decodes the JPEG into a canvas, updates a `THREE.CanvasTexture`, and assigns it to the `display-glass` material as both the base map and emissive map.

## iOS process boundary

The main app and Broadcast Extension cannot share ordinary process memory. They use the App Group `group.com.img2threejs.phonetwin` to share:

- Relay endpoint
- Session identifier

The Extension owns screen capture after the user starts the system broadcast. The main app does not need to remain foregrounded, but iOS may suspend the broadcast after the device locks.

## Development certificate

Vite and browser-side Relay traffic use the key pair in `certs/`. The certificate is self-signed and intended only for local development. Native iOS traffic uses plain WS on a trusted LAN because development builds do not automatically trust this certificate.
