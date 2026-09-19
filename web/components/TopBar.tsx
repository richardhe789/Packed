"use client";

import { useEffect, useState } from "react";
import { Moon, Radio, Sun } from "lucide-react";
import { applyTheme, resolveTheme, toggleTheme, type Theme } from "@/lib/theme";

type Props = {
  demoMode: boolean;
  onDemo: () => void;
  onLive: () => void;
};

export default function TopBar({ demoMode, onDemo, onLive }: Props) {
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
          {/* Wikimedia Commons vector of the athletic VT. Official files: brand.vt.edu (license required). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/vt-logo.svg"
            alt="Virginia Tech"
            className="vt-logo"
            width={140}
            height={64}
          />
        </a>
        <span className="brand-x" aria-hidden>
          x
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/packed-logo.png"
          alt="Packed"
          className="packed-logo"
          width={64}
          height={64}
        />
      </div>

      <h1 className="map-topbar-title">PACKED</h1>

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
