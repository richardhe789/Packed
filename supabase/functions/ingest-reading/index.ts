import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "x-device-key, authorization, apikey, content-type",
};

type ReadingInsert = {
  avg_rssi: number;
  packet_count: number;
  density: number;
  location: string;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseReadingBody(raw: unknown): ReadingInsert | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.avg_rssi !== "number" || !Number.isFinite(o.avg_rssi)) {
    return null;
  }
  if (
    typeof o.packet_count !== "number" ||
    !Number.isFinite(o.packet_count) ||
    o.packet_count < 0
  ) {
    return null;
  }
  if (
    typeof o.density !== "number" ||
    !Number.isFinite(o.density) ||
    !Number.isInteger(o.density) ||
    o.density < 0 ||
    o.density > 100
  ) {
    return null;
  }
  if (typeof o.location !== "string" || o.location.trim().length === 0) {
    return null;
  }

  return {
    avg_rssi: o.avg_rssi,
    packet_count: o.packet_count,
    density: o.density,
    location: o.location.trim(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const expectedKey = Deno.env.get("DEVICE_INGEST_KEY");
  const deviceKey = req.headers.get("x-device-key");
  if (!expectedKey || !deviceKey || deviceKey !== expectedKey) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const reading = parseReadingBody(payload);
  if (!reading) {
    return jsonResponse({ error: "invalid body" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase.from("readings").insert(reading);

  if (error) {
    console.error("insert failed:", error.message);
    return jsonResponse({ error: "insert failed" }, 500);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
