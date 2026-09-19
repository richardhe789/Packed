"use client";

import { MapPin, Radio } from "lucide-react";
import type { Recommendation } from "@/lib/crowd";

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
          <div>
            <p className="brand">Packed</p>
            <p className="brand-sub">Virginia Tech · Blacksburg</p>
          </div>
        </div>
      </div>

      <div
        className={`reco-chip tone-${recommendation.tone}`}
        aria-live="polite"
        title={recommendation.detail}
      >
        <MapPin size={14} aria-hidden />
        <span>{recommendation.text}</span>
      </div>

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
    </header>
  );
}
