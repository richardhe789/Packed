"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { LocationDef } from "@/lib/crowd";

type Props = {
  locations: LocationDef[];
  onPick: (id: string) => void;
};

export default function LocationSearch({ locations, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((loc) => {
      const hay = `${loc.label} ${loc.shortLabel} ${loc.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [locations, query]);

  function pick(id: string) {
    onPick(id);
    const loc = locations.find((l) => l.id === id);
    setQuery(loc?.label ?? "");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) pick(hit.id);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="map-search">
      <label className="map-search-field">
        <Search size={16} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search locations"
          aria-label="Search locations"
          aria-expanded={open}
          aria-controls="map-search-list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      {open ? (
        <ul id="map-search-list" className="map-search-list" role="listbox">
          {hits.length === 0 ? (
            <li className="map-search-empty">No matching halls</li>
          ) : (
            hits.map((loc, i) => (
              <li key={loc.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`map-search-hit${i === active ? " is-active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(loc.id)}
                >
                  <span>{loc.label}</span>
                  {!loc.liveSensor ? (
                    <span className="map-search-tag">Soon</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
