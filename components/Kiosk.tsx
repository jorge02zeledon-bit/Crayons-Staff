"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type PunchType = "in" | "break_start" | "break_end" | "out";
type Lookup = { teacher: { id: string; name: string }; tz: string; state: "off" | "working" | "break"; since: string | null; stale: boolean; allowed: PunchType[]; error?: string };
const LABEL: Record<PunchType, string> = { in: "Clock in", break_start: "Start break", break_end: "End break", out: "Clock out" };
const PAST: Record<PunchType, string> = { in: "clocked in", break_start: "started a break", break_end: "is back from break", out: "clocked out" };
const STATE_TEXT = { off: "Not clocked in", working: "Working", break: "On break" };

function fmt(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Scans badges three ways: the tablet camera (QR), a USB/Bluetooth barcode or card
 * reader (which types the code and presses Enter), or a code typed by hand.
 */
export function Kiosk({ schoolName }: { schoolName: string }) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [source, setSource] = useState<"kiosk-qr" | "kiosk-card" | "kiosk-tap">("kiosk-tap");
  const [done, setDone] = useState<{ name: string; what: string; at: string } | null>(null);
  const [error, setError] = useState("");
  const [cameraState, setCameraState] = useState<"idle" | "on" | "unavailable">("idle");
  const [typed, setTyped] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const identify = useCallback(async (code: string, how: "kiosk-qr" | "kiosk-card" | "kiosk-tap") => {
    const clean = code.replace(/^CS:/i, "").trim();
    if (!clean || busyRef.current) return;
    const now = Date.now();
    // The camera sees the same badge many times a second; a card reader or typed code is deliberate.
    if (how === "kiosk-qr" && lastCodeRef.current.code === clean && now - lastCodeRef.current.at < 4000) return;
    lastCodeRef.current = { code: clean, at: now };
    busyRef.current = true;
    setError(""); setDone(null);
    try {
      const r = await fetch("/api/kiosk", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badgeCode: clean }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Could not read that badge."); setLookup(null); }
      else { setLookup(j); setSource(how); }
    } catch { setError("Could not reach the server."); }
    busyRef.current = false;
  }, []);

  async function punch(type: PunchType) {
    if (!lookup) return;
    const r = await fetch("/api/kiosk", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badgeCode: lastCodeRef.current.code, type, source }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "That did not go through. Scan again."); setLookup(null); return; }
    setDone({ name: j.teacher.name, what: PAST[type], at: fmt(new Date().toISOString(), j.tz) });
    setLookup(null);
    lastCodeRef.current = { code: "", at: 0 };
    setTimeout(() => setDone((d) => (d && d.name === j.teacher.name ? null : d)), 6000);
  }

  // Keyboard-wedge scanners type the code then Enter. Keep the hidden input focused.
  useEffect(() => {
    const refocus = () => { if (!document.activeElement || document.activeElement === document.body) inputRef.current?.focus(); };
    const t = setInterval(refocus, 1500);
    refocus();
    return () => clearInterval(t);
  }, []);

  // Camera scanning: BarcodeDetector where available, jsQR otherwise.
  useEffect(() => {
    let stop = false;
    let raf = 0;
    async function start() {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) { setCameraState("unavailable"); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        setCameraState("on");
      } catch {
        setCameraState("unavailable");
        return;
      }
      const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement | HTMLCanvasElement): Promise<{ rawValue: string }[]> } };
      const detector = w.BarcodeDetector ? new w.BarcodeDetector({ formats: ["qr_code"] }) : null;
      type JsQR = (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
      let jsQR: JsQR | null = null;
      if (!detector) jsQR = (await import("jsqr")).default as unknown as JsQR;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;
      const loop = async (ts: number) => {
        if (stop) return;
        if (ts - last > 250 && video.readyState >= 2) {
          last = ts;
          try {
            if (detector) {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) identify(codes[0].rawValue, "kiosk-qr");
            } else if (jsQR && ctx) {
              const size = 360;
              canvas.width = size; canvas.height = size;
              const vw = video.videoWidth, vh = video.videoHeight, s = Math.min(vw, vh);
              ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, size, size);
              const img = ctx.getImageData(0, 0, size, size);
              const code = jsQR(img.data, size, size);
              if (code?.data) identify(code.data, "kiosk-qr");
            }
          } catch { /* keep scanning */ }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    start();
    return () => { stop = true; cancelAnimationFrame(raf); streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [identify]);

  return (
    <main className="kiosk">
      <header className="topbar"><span className="brand">{schoolName}</span><a className="btn btn-sm btn-ghost" href="/schedule">Schedule</a></header>
      <h1>Scan your badge</h1>
      <p className="muted">Hold your badge up to the camera, or tap it on the card reader.</p>

      <input
        ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { identify(typed, "kiosk-card"); setTyped(""); } }}
        className="input" style={{ marginTop: 12 }} placeholder="Badge code (card readers type it here)"
        autoComplete="off" autoCapitalize="characters" aria-label="Badge code"
      />

      {lookup ? (
        <section className="card kiosk-person" aria-live="polite">
          <div className="name">{lookup.teacher.name}</div>
          <div className="muted">{STATE_TEXT[lookup.state]}{lookup.since && lookup.state !== "off" ? ` since ${fmt(lookup.since, lookup.tz)}` : ""}</div>
          {lookup.stale ? <p className="notice warn" style={{ marginTop: 10 }}>The last shift was never clocked out. The office can fix it later.</p> : null}
          <div className="kiosk-actions">
            {lookup.allowed.map((t) => (
              <button key={t} className={`btn ${t === "in" || t === "break_end" ? "btn-primary" : "btn-outline"}`} onClick={() => punch(t)}>{LABEL[t]}</button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setLookup(null)}>Not you? Cancel</button>
        </section>
      ) : done ? (
        <section className="card kiosk-done" role="status">
          <div className="big">{done.name} {done.what}</div>
          <div className="muted">{done.at}. Have a good one!</div>
        </section>
      ) : (
        <div className="scanner" style={{ marginTop: 16 }}>
          <video ref={videoRef} muted playsInline />
          <div className="frame" />
          {cameraState !== "on" ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", padding: 20, textAlign: "center" }}>
              {cameraState === "unavailable" ? "No camera. Use a card reader or type the badge code above." : "Starting camera…"}
            </div>
          ) : null}
        </div>
      )}
      {error ? <p className="notice warn" role="alert" style={{ marginTop: 12 }}>{error}</p> : null}
    </main>
  );
}
