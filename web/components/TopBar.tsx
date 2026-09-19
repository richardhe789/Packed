"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Moon, MoreVertical, Radio, Sun } from "lucide-react";
import { applyTheme, resolveTheme, toggleTheme, type Theme } from "@/lib/theme";

type Props = {
  demoMode: boolean;
  onDemo: () => void;
  onLive: () => void;
};

export default function TopBar({
  demoMode,
  onDemo,
  onLive,
}: Props) {
  const [theme, setTheme] = useState<Theme>("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = resolveTheme();
    applyTheme(initial);
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
      </div>

      <h1 className="map-topbar-title">PACKED</h1>

      <div className="topbar-actions" ref={wrapRef}>
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

        <div className="mode-toggle desktop-mode" role="group" aria-label="Data mode">
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

        <button
          type="button"
          className="icon-btn overflow-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreVertical size={18} />
        </button>

        {menuOpen ? (
          <div id={menuId} className="overflow-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className={`overflow-item${demoMode ? " is-active" : ""}`}
              onClick={() => {
                onDemo();
                setMenuOpen(false);
              }}
            >
              Demo
            </button>
            <button
              type="button"
              role="menuitem"
              className={`overflow-item${!demoMode ? " is-active" : ""}`}
              onClick={() => {
                onLive();
                setMenuOpen(false);
              }}
            >
              <Radio size={14} aria-hidden />
              Live
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
