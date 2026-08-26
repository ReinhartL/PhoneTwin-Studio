# Historical Product Mode Architecture

> Archived planning document. The current native ReplayKit and Core Motion pipeline is complete. See `../ARCHITECTURE.md` and the project root `README.md` for current behavior.

The browser page is the Mac workbench and preview receiver. It is not the production
iPhone capture client.

```text
iPhone ReplayKit Broadcast Extension ── binary screen frames ──────┐
iPhone Core Motion ─────────────── DataChannel / motion packets ──┼─ Mac session
                                                                  └─ Three.js display + recorder
```

## Current status

- Browser receiver: working development fallback; captures an AirPlay/QuickTime iPhone
  mirror window with `getDisplayMedia` and maps it to `display-glass`.
- Motion relay: HTTPS/WSS plus SSE fallback, with session-ready packet format.
- Native sender: Xcode source scaffold in `native/PhoneTwinSender`.
- ReplayKit handler: receives system screen frames, JPEG-encodes a bounded 30 fps stream,
  and sends binary frames in the same native session. The production upgrade is binding
  those frames to a WebRTC `RTCVideoSource`; the app controls and session protocol remain
  unchanged.

## Test flow now

1. Use iPhone Control Center → Screen Mirroring → this Mac.
2. In the workbench Control tab click `CAPTURE IPHONE MIRROR WINDOW`.
3. Select the iPhone mirror window. This is the current no-install validation path.

## Shipping path

Add GoogleWebRTC (or an equivalent WebRTC stack) to both native targets, create one
offer/answer session per `sessionId`, and send the screen track plus motion DataChannel
over the same PeerConnection. The relay must route by `sessionId`, never broadcast
unrelated phones to every open workbench.
