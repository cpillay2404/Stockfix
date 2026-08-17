import { useEffect, useState } from "react";
import splashArtwork from "@/assets/stockfix-splash-bg.png";

interface SplashScreenProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

// Single approved artwork, full-screen, nothing else rendered with it.
// Architecture fixed 2026-08-08: this component owns its own entrance/hold/
// exit lifecycle and only calls onComplete once fully faded out - App.tsx
// unmounts this and mounts the role-selection UI only at that point, never
// both at once.
export function SplashScreen({ onComplete, minDisplayTime = 1100 }: SplashScreenProps) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const toHold = setTimeout(() => setPhase("hold"), 500); // entrance: 500ms
    const toOut = setTimeout(() => setPhase("out"), minDisplayTime);
    const toComplete = setTimeout(onComplete, minDisplayTime + 250); // exit: 250ms
    return () => {
      clearTimeout(toHold);
      clearTimeout(toOut);
      clearTimeout(toComplete);
    };
  }, [onComplete, minDisplayTime]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 9999,
        overflow: "hidden",
        background: "#020D1D",
      }}
    >
      <img
        src={splashArtwork}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          display: "block",
          opacity: phase === "out" ? 0 : 1,
          transform: phase === "in" ? "scale(0.985)" : "scale(1)",
          transition:
            phase === "out"
              ? "opacity 250ms ease-out"
              : "opacity 500ms ease-out, transform 500ms ease-out",
        }}
      />

      {/* Live syncing indicator, overlaid on the artwork - a static image
          alone gives no sense that anything is actually happening. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "max(18%, env(safe-area-inset-bottom, 0px) + 14%)",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          opacity: phase === "in" ? 0 : phase === "out" ? 0 : 1,
          transition: "opacity 300ms ease-out",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 150, 300].map((delay) => (
            <div
              key={delay}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#FF7900",
                animation: "splashDotBounce 1s ease-in-out infinite",
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </div>
        <p style={{ color: "#91A7C9", fontSize: 13, margin: 0 }}>Syncing data...</p>
      </div>

      <style>{`
        @keyframes splashDotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
