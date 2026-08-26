import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import "./style.css";
import { createIPhone17ProMaxModel } from "./createIPhone17ProMax.js";
import ColorBends from "./ColorBends.jsx";
import Strands from "./Strands.jsx";
import { shouldStartDirector } from "./sceneMotion.mjs";
const motionSocketUrl = () =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/motion`;
const motionEventsUrl = () => `${location.origin}/motion/events`;
const modelFlip = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI,
);
function PhoneScene({
  preset,
  spinning,
  setSpinning,
  view,
  director,
  directorRun,
  directorPlaying,
  directorSpeed,
  autoSpeed,
  motionMode,
  onDirectorFinished,
  onScreenError,
  materialSettings,
  deviceColor,
  motionQuaternion,
  screenFrame,
  calibrationVersion,
  actionReset,
}) {
  const ref = useRef();
  const state = useRef({});
  const [magnifierEnabled, setMagnifierEnabled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      32,
      el.clientWidth / el.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0, 11.8);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const modelPivot = new THREE.Group();
    // Flip the model itself by 180°. Sensor data remains untouched and is
    // applied only to the model inside this pivot.
    modelPivot.quaternion.copy(modelFlip);
    scene.add(modelPivot);
    const root = createIPhone17ProMaxModel();
    modelPivot.add(root);
    root.rotation.y = 0.55;
    state.current.root = root;
    state.current.modelPivot = modelPivot;
    state.current.camera = camera;
    state.current.directorPlaying = directorPlaying;
    state.current.directorSpeed = directorSpeed;
    state.current.autoSpeed = autoSpeed;
    state.current.motionMode = motionMode;
    state.current.onDirectorFinished = onDirectorFinished;
    const glow = new THREE.PointLight(preset.color, 2.5, 8);
    glow.position.set(-2, 2, 2);
    scene.add(glow);
    scene.add(new THREE.HemisphereLight(0x95c7ff, 0x090c15, 2.4));
    const backFill = new THREE.DirectionalLight(0xffd2aa, 0.72);
    backFill.position.set(0, 1, 5);
    scene.add(backFill);
    const sideLight = new THREE.DirectionalLight(
      preset.sideColor || 0x8b5cf6,
      preset.sideIntensity || 1.7,
    );
    sideLight.position.set(4, 1.5, -3);
    scene.add(sideLight);
    const fillLight = new THREE.DirectionalLight(
      preset.fillColor || 0x65d5ff,
      0.65,
    );
    fillLight.position.set(-3, -0.5, 2);
    scene.add(fillLight);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 64),
      new THREE.MeshBasicMaterial({
        color: 0x0e121c,
        transparent: true,
        opacity: 0.75,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.25;
    scene.add(floor);
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    let dragging = false,
      lastX = 0,
      lastY = 0;
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z + e.deltaY * 0.008,
        7.2,
        17,
      );
    };
    const down = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const move = (e) => {
      const bounds = el.getBoundingClientRect();
      state.current.pointerX = THREE.MathUtils.clamp(
        e.clientX - bounds.left,
        0,
        bounds.width,
      );
      state.current.pointerY = THREE.MathUtils.clamp(
        e.clientY - bounds.top,
        0,
        bounds.height,
      );
      state.current.pointerInside = true;
      if (!dragging) return;
      root.rotation.y += (e.clientX - lastX) * 0.008;
      root.rotation.x = THREE.MathUtils.clamp(
        root.rotation.x + (e.clientY - lastY) * 0.005,
        -0.65,
        0.65,
      );
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => {
      dragging = false;
    };
    const leave = () => {
      dragging = false;
      state.current.pointerInside = false;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", leave);
    addEventListener("resize", onResize);
    let t = 0;
    const tick = () => {
      t += 0.01;
      const frame = state.current.directorTween;
      if (frame && state.current.directorPlaying && !dragging) {
        frame.progress = Math.min(1, frame.progress + 0.016 * state.current.directorSpeed);
        const eased = frame.progress < 0.5
          ? 4 * frame.progress * frame.progress * frame.progress
          : 1 - Math.pow(-2 * frame.progress + 2, 3) / 2;
        camera.position.z = THREE.MathUtils.lerp(frame.fromZ, frame.toZ, eased);
        root.rotation.x = THREE.MathUtils.lerp(frame.fromRotation.x, frame.toRotation.x, eased);
        root.rotation.y = THREE.MathUtils.lerp(frame.fromRotation.y, frame.toRotation.y, eased);
        root.rotation.z = THREE.MathUtils.lerp(frame.fromRotation.z, frame.toRotation.z, eased);
        if (frame.progress >= 1) {
          state.current.directorTween = null;
          state.current.directorPlaying = false;
          state.current.onDirectorFinished?.();
        }
      }
      if (state.current.targetQuat && !dragging) {
        modelPivot.quaternion.slerp(state.current.targetQuat, 0.18);
      }
      // Sensor orientation lives on modelPivot. Autorotate is an independent
      // root motion, so connecting an iPhone no longer disables this control.
      if (state.current.spin && !dragging && !state.current.directorTween) {
        if (state.current.motionMode === "orbit")
          root.rotation.y += 0.008 * state.current.autoSpeed;
        if (state.current.motionMode === "float") {
          root.position.y = Math.sin(t * state.current.autoSpeed) * 0.14;
          root.rotation.z = Math.sin(t * 0.7 * state.current.autoSpeed) * 0.045;
        }
      } else if (state.current.motionMode !== "float") {
        root.position.y = THREE.MathUtils.lerp(root.position.y, 0, 0.12);
      }
      if (!dragging && !state.current.viewLock && !state.current.directorTween)
        root.rotation.x = Math.sin(t * 0.45) * 0.025;
      const width = Math.max(1, el.clientWidth);
      const height = Math.max(1, el.clientHeight);
      const followPointer = state.current.magnifierEnabled && state.current.pointerInside;
      const targetZoom = followPointer ? 1.65 : 1;
      state.current.focusZoom = THREE.MathUtils.lerp(
        state.current.focusZoom ?? 1,
        targetZoom,
        0.14,
      );
      state.current.focusX = THREE.MathUtils.lerp(
        state.current.focusX ?? width / 2,
        followPointer ? state.current.pointerX : width / 2,
        0.16,
      );
      state.current.focusY = THREE.MathUtils.lerp(
        state.current.focusY ?? height / 2,
        followPointer ? state.current.pointerY : height / 2,
        0.16,
      );
      if (state.current.focusZoom > 1.002) {
        const viewWidth = width / state.current.focusZoom;
        const viewHeight = height / state.current.focusZoom;
        camera.setViewOffset(
          width,
          height,
          THREE.MathUtils.clamp(state.current.focusX - viewWidth / 2, 0, width - viewWidth),
          THREE.MathUtils.clamp(state.current.focusY - viewHeight / 2, 0, height - viewHeight),
          viewWidth,
          viewHeight,
        );
      } else {
        camera.clearViewOffset();
      }
      renderer.render(scene, camera);
      state.current.raf = requestAnimationFrame(tick);
    };
    state.current.spin = spinning;
    tick();
    return () => {
      cancelAnimationFrame(state.current.raf);
      removeEventListener("resize", onResize);
      camera.clearViewOffset();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [preset]);
  useEffect(() => {
    state.current.magnifierEnabled = magnifierEnabled;
  }, [magnifierEnabled]);
  useEffect(() => {
    if (!motionQuaternion) {
      state.current.targetQuat = null;
      return;
    }
    const relative = new THREE.Quaternion(
      motionQuaternion.x,
      motionQuaternion.y,
      motionQuaternion.z,
      motionQuaternion.w,
    );
    // Compose the physical relative rotation before the model-only 180° flip.
    // Reversing this order mirrors rotations in the display plane around Z.
    state.current.targetQuat = relative
      .clone()
      .multiply(modelFlip)
      .normalize();
  }, [motionQuaternion]);
  useEffect(() => {
    const root = state.current.root;
    const camera = state.current.camera;
    if (!root || !camera) return;
    state.current.directorTween = null;
    state.current.viewLock = false;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0.55, 0);
    camera.position.z = 11.8;
  }, [actionReset]);
  useEffect(() => {
    state.current.directorPlaying = directorPlaying;
    if (!directorPlaying) state.current.directorTween = null;
  }, [directorPlaying]);
  useEffect(() => {
    state.current.directorSpeed = directorSpeed;
  }, [directorSpeed]);
  useEffect(() => {
    state.current.autoSpeed = autoSpeed;
  }, [autoSpeed]);
  useEffect(() => {
    state.current.motionMode = motionMode;
    if (motionMode !== "float" && state.current.root) {
      state.current.root.position.y = 0;
      state.current.root.rotation.z = 0;
    }
  }, [motionMode]);
  useEffect(() => {
    if (!calibrationVersion) return;
    const root = state.current.root;
    if (!root) return;
    // Calibration defines the neutral presentation as a straight-on display.
    // The outer modelPivot still supplies the independent 180° flip.
    root.rotation.set(0, 0, 0);
    state.current.viewLock = true;
    state.current.targetQuat = modelFlip.clone();
  }, [calibrationVersion]);
  useEffect(() => {
    const root = state.current.root;
    if (!root || !screenFrame) return;
    let cancelled = false;
    const applyBitmap = (bitmap) => {
      if (cancelled) {
        bitmap.close?.();
        return;
      }
      root.traverse((object) => {
        if (object.name !== "display-glass") return;
        const canvas =
          object.userData.nativeScreenCanvas ||
          document.createElement("canvas");
        canvas.width = bitmap.width || bitmap.naturalWidth || 1;
        canvas.height = bitmap.height || bitmap.naturalHeight || 1;
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        object.userData.nativeScreenCanvas = canvas;
        if (!object.userData.nativeScreenTexture) {
          object.userData.nativeScreenTexture = new THREE.CanvasTexture(canvas);
          object.userData.nativeScreenTexture.colorSpace = THREE.SRGBColorSpace;
          object.userData.nativeScreenTexture.minFilter = THREE.LinearFilter;
          object.userData.nativeScreenTexture.magFilter = THREE.LinearFilter;
          object.material.map = object.userData.nativeScreenTexture;
          // A phone display is self-lit. Emissive output keeps the captured
          // screen readable even when the scene lighting is dim or tinted.
          object.material.emissiveMap = object.userData.nativeScreenTexture;
          object.material.emissive.set(0xffffff);
          object.material.emissiveIntensity = 0.45;
          object.material.side = THREE.DoubleSide;
          object.material.toneMapped = false;
          object.material.transmission = 0;
          object.material.opacity = 1;
          object.material.transparent = false;
        } else {
          object.userData.nativeScreenTexture.needsUpdate = true;
        }
        // Keep the capture visible even when the glass material has low
        // transmission or the scene lights are pointed at the back shell.
        object.userData.nativeScreenTexture.needsUpdate = true;
        object.material.map = object.userData.nativeScreenTexture;
        object.material.emissiveMap = object.userData.nativeScreenTexture;
        object.material.color.set(0xffffff);
        object.material.needsUpdate = true;
      });
      bitmap.close?.();
    };
    const decodeWithImage = () => {
      const url = URL.createObjectURL(screenFrame);
      const image = new Image();
      image.onload = () => {
        applyBitmap(image);
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        onScreenError?.("JPEG decode failed");
        URL.revokeObjectURL(url);
      };
      image.src = url;
    };
    if (typeof createImageBitmap === "function") {
      createImageBitmap(screenFrame).then(applyBitmap).catch(decodeWithImage);
    } else {
      decodeWithImage();
    }
    return () => {
      cancelled = true;
    };
  }, [screenFrame]);
  useEffect(() => {
    state.current.spin = spinning;
  }, [spinning]);
  useEffect(() => {
    const r = state.current.root;
    if (!r) return;
    const a = {
      "Three-quarter": 0.55,
      Front: 0,
      Back: Math.PI,
      Right: Math.PI / 2,
      Left: -Math.PI / 2,
      Top: 0,
    };
    state.current.viewLock = view === "Top";
    r.rotation.y = a[view] ?? r.rotation.y;
    r.rotation.x = view === "Top" ? -1.1 : 0;
  }, [view]);
  useEffect(() => {
    if (!shouldStartDirector(directorRun)) return;
    const c = state.current.camera,
      r = state.current.root;
    if (!c || !r) return;
    const target = {
      orbit: { z: 11.8, rotation: [0.08, 0.85, 0] },
      micro: { z: 8.2, rotation: [0.02, -0.25, 0] },
      push: { z: 9.2, rotation: [0, 0, 0] },
      tilt: { z: 11.8, rotation: [0.28, -0.4, 0.12] },
      dive: { z: 10.4, rotation: [-0.45, 0.15, 0] },
      pull: { z: 15, rotation: [-0.08, Math.PI * 0.15, 0] },
    }[director] || { z: 11.8, rotation: [0, 0.55, 0] };
    state.current.viewLock = true;
    // directorRun is the authoritative restart signal. React may keep the
    // public playing state at true between two consecutive action clicks, so
    // explicitly re-arm the internal timeline for every run.
    state.current.directorPlaying = true;
    state.current.directorTween = {
      progress: 0,
      fromZ: c.position.z,
      toZ: target.z,
      fromRotation: r.rotation.clone(),
      toRotation: new THREE.Euler(...target.rotation),
    };
  }, [directorRun]);
  useEffect(() => {
    const r = state.current.root;
    if (!r || !deviceColor) return;
    const c = new THREE.Color(deviceColor);
    r.traverse((o) => {
      if (o.name === "unibody-frame" || o.name === "rear-glass")
        o.material.color.copy(c);
      if (o.name === "camera-plateau")
        o.material.color.copy(c).multiplyScalar(0.72);
    });
  }, [deviceColor]);
  useEffect(() => {
    const r = state.current.root;
    if (!r || !materialSettings) return;
    r.traverse((o) => {
      const key =
        o.name === "unibody-frame"
          ? "frame"
          : o.name === "display-glass"
            ? "glass"
            : o.name === "camera-plateau"
              ? "camera"
              : null;
      if (!key) return;
      const m = materialSettings[key];
      o.material.color.set(m.color);
      o.material.metalness = m.metalness;
      o.material.roughness = m.roughness;
      o.material.clearcoat = m.clearcoat;
      if (key === "glass") {
        o.material.transmission = 0.18;
        o.material.opacity = 0.92;
        o.material.transparent = true;
        o.material.ior = 1.45;
      }
      o.material.needsUpdate = true;
    });
  }, [materialSettings]);
  return (
    <div className="scene" ref={ref}>
      <button
        type="button"
        className={`magnifier-toggle${magnifierEnabled ? " active" : ""}`}
        aria-label={magnifierEnabled ? "Disable cursor magnifier" : "Enable cursor magnifier"}
        title={magnifierEnabled ? "Disable cursor magnifier" : "Enable cursor magnifier"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setMagnifierEnabled((enabled) => !enabled)}
      >
        <span aria-hidden="true" />
      </button>
      <button className="spin" onClick={() => setSpinning((v) => !v)}>
        {spinning ? "PAUSE" : "SPIN"} <span>↻</span>
      </button>
      <div className="scene-label">
        LIVE MODEL / 01 · WHEEL TO ZOOM · DRAG TO ORBIT · CURSOR MAGNIFIER
      </div>
    </div>
  );
}

const presets = [
  {
    name: "Aurora glass",
    color: 0x65d5ff,
    css: "aurora",
    strands: ["#65d5ff", "#22d3ee", "#8b5cf6"],
    strandSpeed: 0.5,
    sideColor: 0x8b5cf6,
    sideIntensity: 1.8,
    fillColor: 0x65d5ff,
  },
  {
    name: "Studio dark",
    color: 0xff6d9b,
    css: "studio",
    strands: ["#f472b6", "#fb7185", "#a78bfa"],
    strandSpeed: 0.32,
    sideColor: 0xf472b6,
    sideIntensity: 1.5,
    fillColor: 0xa78bfa,
  },
  {
    name: "Signal red",
    color: 0xff5a42,
    css: "signal",
    strands: ["#ff5a42", "#f59e0b", "#fb7185"],
    strandSpeed: 0.7,
    sideColor: 0xff5a42,
    sideIntensity: 2.1,
    fillColor: 0xf59e0b,
  },
];
function App() {
  const [preset, setPreset] = useState(presets[2]);
  const [background, setBackground] = useState({
    base: "#080a0f",
    accent: "#31546b",
    name: "Midnight grid",
  });
  const [showIntro, setShowIntro] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [motionMode, setMotionMode] = useState("orbit");
  const [motionSpeed, setMotionSpeed] = useState(60);
  const [director, setDirector] = useState("orbit");
  const [directorRun, setDirectorRun] = useState(0);
  const [directorPlaying, setDirectorPlaying] = useState(false);
  const [directorSpeed, setDirectorSpeed] = useState(1);
  const [actionReset, setActionReset] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Idle");
  const [captureWorkspace, setCaptureWorkspace] = useState(true);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const [view, setView] = useState("Three-quarter");
  const [material, setMaterial] = useState("frame");
  const [deviceColor, setDeviceColor] = useState("#202532");
  const [materialSettings, setMaterialSettings] = useState({
    frame: {
      color: 0x202532,
      metalness: 0.72,
      roughness: 0.28,
      clearcoat: 0.2,
    },
    glass: {
      color: 0x071019,
      metalness: 0.02,
      roughness: 0.08,
      clearcoat: 0.82,
    },
    camera: {
      color: 0x07080b,
      metalness: 0.25,
      roughness: 0.22,
      clearcoat: 0.4,
    },
  });
  const [motionReceiving, setMotionReceiving] = useState(false);
  const [motionQuaternion, setMotionQuaternion] = useState(null);
  const [screenFrame, setScreenFrame] = useState(null);
  const [screenFrames, setScreenFrames] = useState(0);
  const [screenStatus, setScreenStatus] = useState("Waiting for ReplayKit screen frames");
  const [relayRunning, setRelayRunning] = useState(false);
  const [relayStarting, setRelayStarting] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrationVersion, setCalibrationVersion] = useState(0);
  const motionCalibration = useRef(new THREE.Quaternion());
  const latestRawMotion = useRef(null);
  const previousRawMotion = useRef(null);
  const motionSource = useRef(null);
  const startRelay = async () => {
    setRelayStarting(true);
    try {
      const response = await fetch("/__relay/start", { method: "POST" });
      const data = await response.json();
      setRelayRunning(Boolean(data.running || data.started));
      window.setTimeout(async () => {
        try {
          const status = await fetch("/__relay/status");
          setRelayRunning(Boolean((await status.json()).running));
        } catch {}
      }, 500);
    } catch {
      setRelayRunning(false);
    } finally {
      setRelayStarting(false);
    }
  };
  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined") {
      setRecordingStatus("Recording is not supported by this browser");
      return;
    }
    let stream;
    try {
      if (captureWorkspace) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 60, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
          preferCurrentTab: true,
        });
      } else {
        const canvas = document.querySelector(".scene > canvas");
        if (!canvas?.captureStream) throw new Error("canvas capture unavailable");
        stream = canvas.captureStream(60);
      }
    } catch (error) {
      setRecordingStatus(error?.name === "NotAllowedError" ? "Screen capture permission cancelled" : "Unable to start recording");
      return;
    }
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const mimeType = candidates
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      setRecordingStatus("No supported recording codec available");
      return;
    }
    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
    recorder.ondataavailable = (event) => {
      if (event.data.size) recordedChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `phone-twin-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setRecordingStatus("Recording downloaded");
    };
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (recorder.state === "recording") recorder.stop();
    });
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);
    setRecordingStatus("Recording");
  };
  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };
  const resetAction = () => setActionReset((value) => value + 1);
  const toggleSender = () => {
    resetAction();
    setMotionQuaternion(null);
    setMotionReceiving((value) => !value);
  };
  const runDirector = (nextDirector) => {
    resetAction();
    setDirector(nextDirector);
    setMotionMode("orbit");
    setDirectorPlaying(true);
    setDirectorRun((run) => run + 1);
  };
  const chooseView = (nextView) => {
    resetAction();
    setDirectorPlaying(false);
    setView(nextView);
  };
  useEffect(() => {
    fetch("/__relay/status")
      .then((response) => response.json())
      .then((data) => setRelayRunning(Boolean(data.running)))
      .catch(() => setRelayRunning(false));
  }, []);
  useEffect(() => {
    if (!motionReceiving) {
      setMotionQuaternion(null);
      motionCalibration.current.identity();
      latestRawMotion.current = null;
      previousRawMotion.current = null;
      motionSource.current = null;
      setCalibrated(false);
      return;
    }
    motionCalibration.current.identity();
    latestRawMotion.current = null;
    previousRawMotion.current = null;
    motionSource.current = null;
    setCalibrated(false);
    const eventSource = new EventSource(motionEventsUrl());
    const socket = new WebSocket(motionSocketUrl());
    socket.binaryType = "blob";
    socket.addEventListener("open", () => console.info("PhoneTwin receiver WebSocket open"));
    socket.addEventListener("error", (event) => console.error("PhoneTwin receiver WebSocket error", event));
    socket.addEventListener("close", (event) => console.info("PhoneTwin receiver WebSocket closed", event.code, event.reason));
    socket.addEventListener("message", async (event) => {
      if (typeof event.data === "string") return;
      try {
        const bytes = new Uint8Array(
          event.data instanceof Blob
            ? await event.data.arrayBuffer()
            : event.data,
        );
        // ReplayKit sends a 4-byte magic, 8-byte timestamp, then JPEG bytes.
        // Keep a SOI fallback so older senders that emitted bare JPEG still
        // work through the same relay.
        if (bytes.length < 3) return;
        const magic = String.fromCharCode(...bytes.subarray(0, 4));
        console.debug("PhoneTwin binary frame", bytes.length, magic);
        let jpeg = magic === "PTV1" ? bytes.subarray(12) : null;
        if (!jpeg) {
          for (let i = 0; i < bytes.length - 1; i += 1) {
            if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
              jpeg = bytes.subarray(i);
              break;
            }
          }
        }
        if (!jpeg?.length) {
          setScreenStatus(`Unknown binary frame received (${bytes.length} bytes)`);
          return;
        }
        setScreenFrames((count) => count + 1);
        setScreenStatus(`JPEG received (${jpeg.length} bytes), applying texture`);
        setScreenFrame(new Blob([jpeg], { type: "image/jpeg" }));
      } catch {
        setScreenStatus("Screen frame parsing failed");
        // Ignore malformed frames and keep the last valid screen texture.
      }
    });
    let received = 0;
    const started = performance.now();
    eventSource.addEventListener("open", () =>
      setSensorState((s) => ({ ...s, connected: true })),
    );
    eventSource.addEventListener("error", () =>
      setSensorState((s) => ({ ...s, connected: false })),
    );
    const receive = (event) => {
      try {
        const data = JSON.parse(event.data);
        const incomingQuaternion = data.q || data.quaternion;
        if (data.type === "orientation" && incomingQuaternion) {
          // Once the ReplayKit extension is active, ignore the foreground
          // app's second motion stream. Mixing both streams causes visible
          // jumps because they do not share the same sampling clock.
          if (data.source === "broadcast") motionSource.current = "broadcast";
          if (
            data.source === "foreground" &&
            motionSource.current === "broadcast"
          ) return;
          received += 1;
          const raw = new THREE.Quaternion(
            incomingQuaternion.x,
            incomingQuaternion.y,
            incomingQuaternion.z,
            incomingQuaternion.w,
          );
          if (![raw.x, raw.y, raw.z, raw.w].every(Number.isFinite)) return;
          const length = raw.length();
          if (length < 0.5 || length > 1.5) return;
          raw.normalize();
          // q and -q encode the same orientation. Keep adjacent samples on
          // one hemisphere so interpolation cannot take the long way around
          // when a sender changes quaternion sign between frames.
          if (previousRawMotion.current && raw.dot(previousRawMotion.current) < 0)
            raw.multiplyScalar(-1);
          previousRawMotion.current = raw.clone();
          latestRawMotion.current = raw.clone();
          // Calibration is a relative quaternion: the captured baseline is
          // inverted and placed before each raw sample. The model's 180°
          // presentation flip lives on modelPivot, never in this signal.
          const mapped = motionCalibration.current
            .clone()
            .multiply(raw)
            .normalize();
          setMotionQuaternion({
            x: mapped.x,
            y: mapped.y,
            z: mapped.z,
            w: mapped.w,
          });
          setSensorState((s) => ({
            ...s,
            connected: true,
            events: received,
            rate: Math.round(
              received / Math.max((performance.now() - started) / 1000, 1),
            ),
            // Pass the native values through unchanged. Core Motion currently
            // sends radians; keeping them untouched avoids another coordinate
            // conversion being mistaken for physical sensor data.
            alpha: data.euler?.alpha ?? data.alpha ?? 0,
            beta: data.euler?.beta ?? data.beta ?? 0,
            gamma: data.euler?.gamma ?? data.gamma ?? 0,
            q: { x: mapped.x, y: mapped.y, z: mapped.z, w: mapped.w },
          }));
        }
      } catch {}
    };
    eventSource.addEventListener("message", receive);
    return () => {
      eventSource.removeEventListener("message", receive);
      eventSource.close();
      socket.close();
      setScreenFrame(null);
      setScreenFrames(0);
      setScreenStatus("Waiting for ReplayKit screen frames");
    };
  }, [motionReceiving]);
  const [sensorState, setSensorState] = useState({
    connected: false,
    events: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
    rate: 0,
    q: { x: 0, y: 0, z: 0, w: 1 },
  });
  const backgroundColors = useMemo(
    () => [background.base, background.accent, "#65d5ff"],
    [background.base, background.accent],
  );
  const strandColors = useMemo(() => preset.strands, [preset.strands]);
  const [tab, setTab] = useState("Model");
  useEffect(() => {
    const colors = [
      { base: "#080a0f", accent: "#31546b", name: "Midnight grid" },
      { base: "#10152c", accent: "#5b4aa8", name: "Deep violet" },
      { base: "#071f24", accent: "#1c9a9d", name: "Tidal cyan" },
      { base: "#28131d", accent: "#b84c6b", name: "Red velvet" },
      { base: "#17251d", accent: "#5aa87a", name: "Emerald haze" },
      { base: "#27384b", accent: "#c18c4c", name: "Copper dusk" },
    ];
    const handler = (e) => {
      const swatch = e.target.closest(".background-swatch span");
      if (swatch)
        setBackground(
          colors[
            [...document.querySelectorAll(".background-swatch span")].indexOf(
              swatch,
            )
          ],
        );
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);
  return (
    <main
      className={"app " + preset.css}
      style={{
        "--workspace-bg": background.base,
        "--workspace-accent": background.accent,
      }}
    >
      <ColorBends
        colors={backgroundColors}
        speed={0.2}
        frequency={1}
        noise={0.15}
        bandWidth={0.55}
        rotation={90}
        intensity={1.3}
      />
      <Strands
        colors={strandColors}
        speed={preset.strandSpeed}
        amplitude={0.8}
        waviness={1.2}
        thickness={0.55}
        glow={2.2}
        intensity={0.38}
      />
      <header>
        <div className="brand">
          <span className="mark">✦</span>
          <span>
            phone<span>Twin</span> Studio
          </span>
        </div>
        <div className="crumb">
          WORKSPACE / PHONE-01 <i>● connected</i>
        </div>
      </header>
      <section className="hero">
        <div className={showIntro ? "intro" : "intro intro-hidden"}>
          <button
            className="intro-toggle"
            onClick={() => setShowIntro((v) => !v)}
          >
            {showIntro ? "HIDE INFO" : "SHOW INFO"}
          </button>
          <div className="eyebrow">
            PROCEDURAL RECONSTRUCTION <span>v1.5.1</span>
          </div>
          <h1>
            Your phone,
            <br />
            <em>in motion.</em>
          </h1>
          <p>
            A live, animation-ready twin built from one reference image. Every
            surface, socket and state is yours to control.
          </p>
          <div className="chips">
            <span>● 60 FPS</span>
            <span>◈ 48.2k tris</span>
            <span>⌁ SYNC READY</span>
          </div>
        </div>
        <button
          className="stage-toggle"
          onClick={() => setShowIntro((v) => !v)}
        >
          {showIntro ? "HIDE INFO" : "SHOW INFO"}
        </button>
        <PhoneScene
          preset={preset}
          spinning={spinning}
          setSpinning={setSpinning}
          view={view}
          director={director}
          directorRun={directorRun}
          directorPlaying={directorPlaying}
          directorSpeed={directorSpeed}
          autoSpeed={motionSpeed / 60}
          motionMode={motionMode}
          onDirectorFinished={() => setDirectorPlaying(false)}
          onScreenError={setScreenStatus}
          materialSettings={materialSettings}
          deviceColor={deviceColor}
          motionQuaternion={motionQuaternion}
          screenFrame={screenFrame}
          calibrationVersion={calibrationVersion}
          actionReset={actionReset}
        />
        <aside className="panel">
          <div className="panel-tabs">
            {["Model", "Scene", "Control"].map((x) => (
              <button
                className={tab === x ? "active" : ""}
                onClick={() => setTab(x)}
              >
                {x}
              </button>
            ))}
          </div>
          {tab === "Model" && (
            <>
              <div className="panel-title">DEVICE STATES</div>
              <div className="state-grid">
                <button
                  onClick={toggleSender}
                  className={motionReceiving ? "selected" : ""}
                >
                  ↗ <b>{motionReceiving ? "DISCONNECT IPHONE SENDER" : "CONNECT IPHONE SENDER"}</b>
                  <small>{motionReceiving ? "motion + screen active" : "motion + screen"}</small>
                </button>
                <button
                  onClick={() => {
                    resetAction();
                    if (!spinning && motionMode === "off") setMotionMode("orbit");
                    setSpinning((v) => !v);
                  }}
                  className={spinning ? "selected" : ""}
                >
                  ◉ <b>{spinning ? "AUTOROTATE" : "ROTATION OFF"}</b>
                  <small>orbit control</small>
                </button>
              </div>
              <div className="panel-title">AUTO MOTION</div>
              <div className="motion">
                <div className="motion-row">
                  <button
                    className={motionMode === "orbit" ? "active" : ""}
                    onClick={() => {
                      resetAction();
                      setMotionMode("orbit");
                      setSpinning(true);
                    }}
                  >
                    ORBIT
                  </button>
                  <button
                    className={motionMode === "float" ? "active" : ""}
                    onClick={() => {
                      resetAction();
                      setMotionMode("float");
                      setSpinning(true);
                    }}
                  >
                    FLOAT
                  </button>
                  <button
                    className={motionMode === "off" ? "active" : ""}
                    onClick={() => {
                      resetAction();
                      setMotionMode("off");
                      setSpinning(false);
                    }}
                  >
                    OFF
                  </button>
                </div>
                <div className="slider-label">
                  <span>SPEED</span>
                  <b>{(motionSpeed / 60).toFixed(1)}</b>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={motionSpeed}
                  onChange={(e) => setMotionSpeed(Number(e.target.value))}
                />
                <div className="motion-row">
                  <button onClick={() => { resetAction(); setSpinning(true); }}>PLAY</button>
                  <button onClick={() => { resetAction(); setSpinning(false); }}>PAUSE</button>
                </div>
              </div>
              <div className="panel-title">
                MATERIAL STACK <span>03</span>
              </div>
              <div className="stack">
                <button
                  className="material-card"
                  onClick={() => setMaterial("frame")}
                >
                  <b>Obsidian frame</b>
                  <small>metalness · 0.72</small>
                  <strong style={{ background: "#202532" }} />
                </button>
                <button
                  className="material-card"
                  onClick={() => setMaterial("glass")}
                >
                  <b>Glass display</b>
                  <small>clearcoat · 0.80</small>
                  <strong style={{ background: "#79d6ed" }} />
                </button>
                <button
                  className="material-card"
                  onClick={() => setMaterial("camera")}
                >
                  <b>Camera island</b>
                  <small>roughness · 0.22</small>
                  <strong style={{ background: "#07080b" }} />
                </button>
              </div>
              <div className="device-color">
                <div className="editor-label">DEVICE COLOR</div>
                <label>
                  <input
                    type="color"
                    value={deviceColor}
                    onChange={(e) => setDeviceColor(e.target.value)}
                  />
                  <span>{deviceColor.toUpperCase()}</span>
                </label>
                <div className="color-presets">
                  <button
                    style={{ background: "#D27E4A" }}
                    onClick={() => setDeviceColor("#D27E4A")}
                    aria-label="orange"
                  ></button>
                </div>
              </div>
              <div className="material-editor">
                <div className="editor-label">
                  EDIT {material.toUpperCase()}
                </div>
                {["metalness", "roughness", "clearcoat"].map((k) => (
                  <label>
                    <span>{k}</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={materialSettings[material][k]}
                      onChange={(e) =>
                        setMaterialSettings((v) => ({
                          ...v,
                          [material]: {
                            ...v[material],
                            [k]: Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <b>{materialSettings[material][k].toFixed(2)}</b>
                  </label>
                ))}
              </div>
            </>
          )}
          {tab === "Control" && (
            <div className="control">
              <div className="connection">
                <div className="panel-title">NATIVE IPHONE RECEIVER</div>
                <button
                  className={`wide ${relayRunning ? "active" : ""}`}
                  onClick={startRelay}
                  disabled={relayStarting || relayRunning}
                >
                  {relayStarting
                    ? "STARTING MAC RELAY..."
                    : relayRunning
                      ? "MAC RELAY RUNNING · 8787 / 8788"
                      : "START MAC RELAY"}
                </button>
                <button
                  className={`wide ${motionReceiving ? "active" : ""}`}
                  onClick={toggleSender}
                >
                  {motionReceiving
                    ? "DISCONNECT IPHONE SENDER"
                    : "CONNECT IPHONE SENDER"}
                </button>
                <b>
                  ●{" "}
                  {sensorState.connected
                    ? "Motion Server connected"
                    : "Connecting to Motion Server"}
                </b>
                <small>
                  {sensorState.events
                    ? `${sensorState.events} motion samples received`
                    : "Waiting for native iPhone Sender data"}
                </small>
                <small>
                  {screenFrames ? `${screenStatus} · ${screenFrames} frames total` : screenStatus}
                </small>
                <small>
                  {location.protocol === "https:"
                    ? "Secure HTTPS / WSS channel"
                    : "HTTP / WS channel"}
                </small>
                <div className="telemetry">
                  <span>
                    α <b>{sensorState.alpha.toFixed(3)}</b>
                  </span>
                  <span>
                    β <b>{sensorState.beta.toFixed(3)}</b>
                  </span>
                  <span>
                    γ <b>{sensorState.gamma.toFixed(3)}</b>
                  </span>
                  <span>
                    RATE <b>{sensorState.rate} Hz</b>
                  </span>
                </div>
                <small>
                  q {sensorState.q.x.toFixed(3)}, {sensorState.q.y.toFixed(3)},{" "}
                  {sensorState.q.z.toFixed(3)}, {sensorState.q.w.toFixed(3)}
                </small>
                <label>
                  SMOOTHING <input type="range" defaultValue="15" />
                  <b>0.15</b>
                </label>
                <button
                  type="button"
                  className="calibration-button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    if (latestRawMotion.current) {
                      motionCalibration.current
                        .copy(latestRawMotion.current)
                        .invert();
                      setCalibrated(true);
                      setCalibrationVersion((version) => version + 1);
                    }
                    setSpinning(false);
                  }}
                >
                  {calibrated ? "CALIBRATED · SCREEN FACING FORWARD" : "FACE THE SCREEN FORWARD, THEN CALIBRATE"}
                </button>
              </div>
              <div className="panel-title">HIGH-RES OUTPUT</div>
              <button className="wide" onClick={recording ? stopRecording : startRecording}>{recording ? "STOP & DOWNLOAD" : "START RECORDING"}</button>
              <label className="check">
                <input type="checkbox" checked={captureWorkspace} onChange={(event) => setCaptureWorkspace(event.target.checked)} /> INCLUDE WORKSPACE BACKGROUND
              </label>
              {recordingStatus !== "Idle" && <small>{recordingStatus}</small>}
              <div className="panel-title">CAMERA DIRECTOR</div>
              <button className="wide" onClick={() => {
                resetAction();
                setDirectorPlaying(false);
                setSpinning(false);
                setMotionMode("off");
                setDirector("orbit");
                setView("Three-quarter");
              }}>RESET ACTIONS</button>
              <div className="director-grid">
                {[
                  { label: "FRONT PUSH", action: "push" },
                  { label: "TILTED SHOT", action: "tilt" },
                  { label: "TOP DIVE", action: "dive" },
                  { label: "VERTICAL PULL", action: "pull" },
                ].map((item, i) => (
                  <button
                    key={item.action}
                    onClick={() => runDirector(item.action)}
                  >
                    <b>{item.label}</b>
                    <small>ACTION · {i + 1}</small>
                  </button>
                ))}
              </div>
              <div className="motion-row speed">
                <button className={directorSpeed === 0.55 ? "active" : ""} onClick={() => setDirectorSpeed(0.55)}>SLOW</button>
                <button className={directorSpeed === 1 ? "active" : ""} onClick={() => setDirectorSpeed(1)}>STANDARD</button>
                <button className={directorSpeed === 1.8 ? "active" : ""} onClick={() => setDirectorSpeed(1.8)}>FAST</button>
              </div>
              <div className="motion-row">
                <button onClick={() => runDirector(director)}>PLAY</button>
                <button onClick={() => { resetAction(); setDirectorPlaying(false); }}>PAUSE</button>
              </div>
              <div className="panel-title">VIEW</div>
              <div className="view-grid">
                {[
                  "Front",
                  "Back",
                  "Left",
                  "Right",
                  "Top",
                  "Three-quarter",
                ].map((x) => (
                  <button
                    className={view === x ? "active" : ""}
                    onClick={() => chooseView(x)}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "Scene" && (
            <>
              <div className="panel-title">LIGHT PRESETS</div>
              <div className="presets">
                {presets.map((p) => (
                  <button
                    onClick={() => setPreset(p)}
                    className={preset.name === p.name ? "active" : ""}
                  >
                    <span
                      style={{
                        background: "#" + p.color.toString(16).padStart(6, "0"),
                      }}
                    />{" "}
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="panel-title">BACKGROUND</div>
              <div className="background-swatch">
                {[
                  { base: "#080a0f", accent: "#31546b" },
                  { base: "#10152c", accent: "#5b4aa8" },
                  { base: "#071f24", accent: "#1c9a9d" },
                  { base: "#28131d", accent: "#b84c6b" },
                  { base: "#17251d", accent: "#5aa87a" },
                  { base: "#27384b", accent: "#c18c4c" },
                ].map((c) => (
                  <span
                    style={{ background: c.base, "--swatch-accent": c.accent }}
                  />
                ))}
              </div>
            </>
          )}
        </aside>
      </section>
      <footer>
        <span>
          <b>01</b> REFERENCE INTAKE
        </span>
        <span className="line" />
        <span>
          <b>02</b> FORM PASS
        </span>
        <span className="line active-line" />
        <span>
          <b>03</b> INTERACTION
        </span>
        <span className="footer-note">
          built with img2threejs · code-only geometry
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
