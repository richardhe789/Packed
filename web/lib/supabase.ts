export type ReadingRow = {
  density: number;
  created_at: string;
  location: string;
  avg_rssi: number | null;
  packet_count: number | null;
  src: string | null;
};

/** Live panel + graph read ESP32 `readings`. */
export const USE_SIM_READINGS = false;

function readingsTable(): "sim_readings" | "readings" {
  return USE_SIM_READINGS ? "sim_readings" : "readings";
}

/** Publishable anon key — same as firmware. Lets Vercel Live work without dashboard env. */
const FALLBACK_SUPABASE_URL = "https://myjfbuathehfghagbnot.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15amZidWF0aGVoZmdoYWdibm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3ODIzOTIsImV4cCI6MjEwNTM1ODM5Mn0.Wa8W2VWnlR1Mx6o_1q0NKsed_5Gp8f1MRNVg1LrFSQM";

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
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
  const endpoint = new URL(`${url}/rest/v1/${readingsTable()}`);
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
  limit = 240,
  init?: { signal?: AbortSignal },
): Promise<ReadingRow[]> {
  const { url, anonKey } = getSupabaseConfig();
  const endpoint = new URL(`${url}/rest/v1/${readingsTable()}`);
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
