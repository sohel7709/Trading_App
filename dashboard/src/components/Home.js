import React, { useState, useEffect } from "react";
import Dashboard from "./Dashboard";
import TopBar from "./TopBar";

/* ─── Kite Splash Screen ─────────────────────────────────────── */
const SplashScreen = ({ onDone }) => {
  const [fade, setFade] = useState(false);

  useEffect(() => {
    // Start fade-out after 1.8s, then call onDone at 2.2s
    const fadeTimer = setTimeout(() => setFade(true), 1800);
    const doneTimer = setTimeout(() => onDone(), 2200);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#fff",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      zIndex: 9999,
      opacity: fade ? 0 : 1,
      transition: "opacity 0.4s ease",
    }}>
      {/* Zerodha / Kite logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        {/* Zerodha / Kite logo — blue circle with white ring (matches real app) */}
        <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Outer blue circle */}
          <circle cx="44" cy="44" r="44" fill="#387ed1"/>
          {/* White filled ring */}
          <circle cx="44" cy="44" r="26" fill="white"/>
          {/* Inner blue circle to create ring effect */}
          <circle cx="44" cy="44" r="14" fill="#387ed1"/>
        </svg>

        {/* Kite wordmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#387ed1", letterSpacing: "-1px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            Kite
          </span>
          <span style={{ fontSize: 13, color: "#aaa", fontFamily: "system-ui, -apple-system, sans-serif", letterSpacing: "0.5px" }}>
            by Zerodha
          </span>
        </div>
      </div>

      {/* Loading dots */}
      <div style={{ position: "absolute", bottom: 60, display: "flex", gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#387ed1",
            animation: `splashDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes splashDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

/* ─── Home ───────────────────────────────────────────────────── */
const Home = () => {
  // Show splash only once per session
  const [showSplash, setShowSplash] = useState(
    () => !sessionStorage.getItem("kite_splash_shown")
  );

  const handleSplashDone = () => {
    sessionStorage.setItem("kite_splash_shown", "1");
    setShowSplash(false);
  };

  return (
    <>
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
      <TopBar />
      <Dashboard />
    </>
  );
};

export default Home;
