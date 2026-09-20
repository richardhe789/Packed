"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { LiveSourceKind } from "@/lib/crowd";
import { applyTheme, resolveTheme, toggleTheme, type Theme } from "@/lib/theme";

type Props = {
  espKind: LiveSourceKind;
};

const ESP_LABEL: Record<LiveSourceKind, string> = {
  live: "ESP32 is on",
  stale: "ESP32 last reading is old",
  sim: "Simulated data, ESP32 off",
  none: "ESP32 is off",
};

export default function TopBar({ espKind }: Props) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initial = resolveTheme();
    applyTheme(initial);
    setTheme(initial);
  }, []);

  return (
    <header className="map-topbar">
      <h1 className="map-topbar-title">
        <span className="map-topbar-title-shadow" aria-hidden="true">
          PACKED
        </span>
        <span className="map-topbar-title-face">PACKED</span>
      </h1>

      <div className="topbar-actions">
        <span
          className={`esp-blinker is-${espKind}`}
          role="status"
          aria-label={ESP_LABEL[espKind]}
          title={ESP_LABEL[espKind]}
        />

        <button
          type="button"
          className="icon-btn"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          onClick={() => setTheme((t) => toggleTheme(t))}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
