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
      {/* TradeLab Logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#387ed1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800, color: "#fff" }}>
          T
        </div>

        {/* TradeLab wordmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#387ed1", letterSpacing: "-1px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            TradeLab
          </span>
          <span style={{ fontSize: 13, color: "#aaa", fontFamily: "system-ui, -apple-system, sans-serif", letterSpacing: "0.5px" }}>
            Paper Trading Platform
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
    () => !sessionStorage.getItem("tradelab_splash_shown")
  );

  const handleSplashDone = () => {
    sessionStorage.setItem("tradelab_splash_shown", "1");
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
