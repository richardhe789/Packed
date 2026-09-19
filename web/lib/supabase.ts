export type ReadingRow = {
  density: number;
  created_at: string;
  location: string;
  avg_rssi: number | null;
  packet_count: number | null;
  src: string | null;
};

/** Dev: Live panel reads `sim_readings` instead of ESP32 `readings`. Flip off after demo. */
export const USE_SIM_READINGS = true;

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey || anonKey.includes("YOUR_")) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
  return { url, anonKey };
}

export async function fetchLatestReadings(
  locationId: string,
  init?: { signal?: AbortSignal },
): Promise<{ latest: ReadingRow | null; previous: ReadingRow | null }> {
  const { url, anonKey } = getSupabaseConfig();
  const table = USE_SIM_READINGS ? "sim_readings" : "readings";
  const endpoint = new URL(`${url}/rest/v1/${table}`);
  endpoint.searchParams.set(
    "select",
    "density,created_at,location,avg_rssi,packet_count,src",
  );
  endpoint.searchParams.set("location", `eq.${locationId}`);
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "2");

  const res = await fetch(endpoint.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
    signal: init?.signal,
  });

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }

  const rows = (await res.json()) as ReadingRow[];
  const tagged = USE_SIM_READINGS
    ? rows.map((r) => ({ ...r, src: r.src ?? "sim" }))
    : rows;
  return {
    latest: tagged[0] ?? null,
    previous: tagged[1] ?? null,
  };
}

export async function fetchReadingHistory(
  locationId: string,
  limit = 800,
  init?: { signal?: AbortSignal },
): Promise<ReadingRow[]> {
  const { url, anonKey } = getSupabaseConfig();
  const endpoint = new URL(`${url}/rest/v1/sim_readings`);
  endpoint.searchParams.set(
    "select",
    "density,created_at,location,avg_rssi,packet_count",
  );
  endpoint.searchParams.set("location", `eq.${locationId}`);
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", String(limit));

  const res = await fetch(endpoint.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
    signal: init?.signal,
  });

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }

  const rows = (await res.json()) as ReadingRow[];
  return rows.slice().reverse();
}
