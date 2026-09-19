"use client";

import { useEffect, useState } from "react";
import { Moon, Radio, Sun } from "lucide-react";
import type { Recommendation } from "@/lib/crowd";
import { applyTheme, resolveTheme, toggleTheme, type Theme } from "@/lib/theme";

type Props = {
  demoMode: boolean;
  recommendation: Recommendation;
  onDemo: () => void;
  onLive: () => void;
};

export default function TopBar({
  demoMode,
  recommendation,
  onDemo,
  onLive,
}: Props) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initial = resolveTheme();
    applyTheme(initial);
    setTheme(initial);
  }, []);

  return (
    <header className="map-topbar">
      <div className="map-topbar-left">
        <a
          className="vt-lockup"
          href="https://www.vt.edu/"
          target="_blank"
          rel="noreferrer"
          title="Virginia Tech"
        >
          {/* Demo lockup using VT brand colors. Official assets: brand.vt.edu */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/vt-logo.svg"
            alt="Virginia Tech"
            className="vt-logo"
            width={120}
            height={56}
          />
        </a>
        <div className="brand-divider" aria-hidden />
        <div className="brand-lockup-text">
          <span className={`live-dot${!demoMode ? " on" : ""}`} aria-hidden />
          <div className="brand-text-stack">
            <p className="brand">Packed</p>
            <p className="brand-sub">Virginia Tech · Blacksburg</p>
            <p
              className={`brand-tip tone-${recommendation.tone}`}
              title={recommendation.detail}
            >
              {recommendation.text}
            </p>
          </div>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className={`theme-switch${theme === "dark" ? " is-dark" : ""}`}
          role="switch"
          aria-checked={theme === "dark"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          onClick={() => setTheme((t) => toggleTheme(t))}
        >
          <span className="theme-switch-track" aria-hidden>
            <Sun size={12} className="theme-switch-icon theme-switch-sun" />
            <Moon size={12} className="theme-switch-icon theme-switch-moon" />
          </span>
          <span className="theme-switch-thumb" aria-hidden />
        </button>

        <div className="mode-toggle" role="group" aria-label="Data mode">
          <button
            type="button"
            className={`mode-btn${demoMode ? " active" : ""}`}
            aria-pressed={demoMode}
            onClick={onDemo}
          >
            Demo
          </button>
          <button
            type="button"
            className={`mode-btn${!demoMode ? " active" : ""}`}
            aria-pressed={!demoMode}
            onClick={onLive}
          >
            <Radio size={12} aria-hidden />
            Live
          </button>
        </div>
      </div>
    </header>
  );
}
