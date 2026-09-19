/**
 * Campus Crowd dashboard — polls Supabase for latest density readings.
 * Multi-location layout; only dining_hall_main has live ESP32 data for the demo.
 */

(function () {
  const POLL_MS = 30000;

  /** @type {{ id: string, label: string, live: boolean }[]} */
  const LOCATIONS = [
    { id: "dining_hall_main", label: "Dining Hall (Main)", live: true },
    { id: "dining_hall_west", label: "Dining Hall (West)", live: false },
    { id: "library_lobby", label: "Library Lobby", live: false },
  ];

  /** @type {Record<string, { density: number|null, created_at: string|null, prevDensity: number|null }>} */
  const state = {};
  LOCATIONS.forEach((loc) => {
    state[loc.id] = { density: null, created_at: null, prevDensity: null };
  });

  function statusFromDensity(density) {
    if (density == null || Number.isNaN(density)) {
      return { key: "unknown", label: "No data" };
    }
    if (density <= 33) return { key: "quiet", label: "Quiet" };
    if (density <= 66) return { key: "moderate", label: "Moderate" };
    return { key: "busy", label: "Busy" };
  }

  function trendArrow(current, previous) {
    if (current == null || previous == null) return "–";
    if (current > previous + 2) return "↑";
    if (current < previous - 2) return "↓";
    return "→";
  }

  function render() {
    const root = document.getElementById("locations");
    if (!root) return;

    root.innerHTML = LOCATIONS.map((loc) => {
      const s = state[loc.id];
      const status = statusFromDensity(s.density);
      const trend = trendArrow(s.density, s.prevDensity);
      const densityText =
        s.density != null ? `density ${s.density}/100` : loc.live ? "awaiting sensor" : "coming soon";
      const when = s.created_at
        ? new Date(s.created_at).toLocaleTimeString()
        : "";

      return `
        <article class="location-row" data-location="${loc.id}">
          <div>
            <h2>${loc.label}</h2>
            <p class="sub">${densityText}${when ? ` · ${when}` : ""}</p>
          </div>
          <span class="trend" aria-label="trend">${trend}</span>
          <span class="status-pill ${status.key}">${status.label}</span>
        </article>
      `;
    }).join("");
  }

  async function fetchLatest(locationId) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.CAMPUS_CROWD_CONFIG || {};
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR_")) {
      throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js");
    }

    const url = new URL(`${SUPABASE_URL}/rest/v1/readings`);
    url.searchParams.set("select", "density,created_at,location");
    url.searchParams.set("location", `eq.${locationId}`);
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "2");

    const res = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    }

    const rows = await res.json();
    const latest = rows[0] || null;
    const previous = rows[1] || null;

    state[locationId].prevDensity = previous ? previous.density : state[locationId].density;
    state[locationId].density = latest ? latest.density : null;
    state[locationId].created_at = latest ? latest.created_at : null;
  }

  async function refresh() {
    const meta = document.getElementById("last-updated");
    try {
      // Only poll live locations; placeholders stay "coming soon"
      const live = LOCATIONS.filter((l) => l.live);
      await Promise.all(live.map((l) => fetchLatest(l.id)));
      render();
      if (meta) {
        meta.textContent = `Updated ${new Date().toLocaleTimeString()} · polls every ${POLL_MS / 1000}s`;
      }
    } catch (err) {
      console.error(err);
      render();
      if (meta) {
        meta.textContent = `Error: ${err.message}`;
      }
    }
  }

  render();
  refresh();
  setInterval(refresh, POLL_MS);
})();
