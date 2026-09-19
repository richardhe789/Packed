/**
 * WiFi Ambient Crowd Density Sensor (ESP32)
 *
 * Passive promiscuous sniff → avg RSSI + packet count per window →
 * on-device density accumulator (0–100) → HTTPS POST to Supabase.
 *
 * Privacy: never extracts, stores, or keys off MAC addresses.
 * Uplink: phone hotspot STA (not campus WiFi).
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>

#include "config.h"

// --- Tunable density thresholds (edit live at venue) ---
static const float RSSI_THRESHOLD = 10.0f;    // % drop required
static const float PACKET_THRESHOLD = 15.0f;  // % rise required
static const int STEP_UP = 10;
static const int STEP_DOWN = 5;

// Window length (ms). Use 5 min for demo; shorten for faster testing via SHORT_WINDOWS.
#ifndef SHORT_WINDOWS
static const unsigned long WINDOW_MS = 5UL * 60UL * 1000UL;
#else
static const unsigned long WINDOW_MS = 30UL * 1000UL;  // 30s for bench testing
#endif

// Sniff channel: 0 = use the channel of the connected hotspot AP.
// Set to 1–13 if venue ambient traffic is on a different channel (may need
// alternating sniff/upload — see pauseSniffForUpload / resumeSniff).
#ifndef SNIFF_CHANNEL
#define SNIFF_CHANNEL 0
#endif

static const char *LOCATION = LOCATION_ID;

static bool hasPlaceholder(const char *value) {
  return value == nullptr || value[0] == '\0' || String(value).indexOf("YOUR_") >= 0;
}

static bool hasUsableConfig() {
  const String url(SUPABASE_URL);
  return !hasPlaceholder(WIFI_SSID) && !hasPlaceholder(WIFI_PASSWORD) &&
         !hasPlaceholder(SUPABASE_API_KEY) &&
         url.startsWith("https://") && url.endsWith(".supabase.co") &&
         url.indexOf("supabase.com/dashboard") < 0;
}

// --- Window accumulators (updated from promiscuous callback) ---
static portMUX_TYPE sniffMux = portMUX_INITIALIZER_UNLOCKED;
static volatile int64_t rssiSum = 0;
static volatile uint32_t packetCount = 0;

static float prevAvgRssi = 0.0f;
static uint32_t prevPacketCount = 0;
static bool hasPrevWindow = false;
static int density = 0;

static unsigned long windowStartMs = 0;
static bool sniffing = false;
static uint8_t activeSniffChannel = 1;

// wifi_pkt_rx_ctrl_t is provided by esp_wifi_types.h (via esp_wifi.h)
static void IRAM_ATTR promiscuousRxCb(void *buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT && type != WIFI_PKT_DATA && type != WIFI_PKT_CTRL) {
    return;
  }
  const wifi_promiscuous_pkt_t *pkt = static_cast<wifi_promiscuous_pkt_t *>(buf);
  const wifi_pkt_rx_ctrl_t *rx = &pkt->rx_ctrl;
  // Aggregate only — no MAC parsing
  portENTER_CRITICAL_ISR(&sniffMux);
  rssiSum += rx->rssi;
  packetCount += 1;
  portEXIT_CRITICAL_ISR(&sniffMux);
}

static void printNearbyAps() {
  Serial.println(F("[scan] Nearby APs (for channel calibration):"));
  int n = WiFi.scanNetworks(/*async=*/false, /*show_hidden=*/true);
  if (n <= 0) {
    Serial.println(F("[scan] No networks found"));
    return;
  }
  for (int i = 0; i < n; i++) {
    Serial.printf("  SSID=%s  ch=%d  RSSI=%d\n",
                  WiFi.SSID(i).c_str(), WiFi.channel(i), WiFi.RSSI(i));
  }
  WiFi.scanDelete();
}

static bool connectHotspot() {
  Serial.printf("[wifi] Connecting to hotspot \"%s\"...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long deadline = millis() + 30000UL;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[wifi] FAILED to connect"));
    return false;
  }

  Serial.printf("[wifi] connected, IP: %s  channel: %d  RSSI: %d\n",
                WiFi.localIP().toString().c_str(),
                WiFi.channel(),
                WiFi.RSSI());
  return true;
}

static void startSniffing() {
  if (SNIFF_CHANNEL > 0) {
    activeSniffChannel = static_cast<uint8_t>(SNIFF_CHANNEL);
  } else {
    activeSniffChannel = static_cast<uint8_t>(WiFi.channel());
    if (activeSniffChannel < 1) {
      activeSniffChannel = 1;
    }
  }

  esp_wifi_set_promiscuous(false);
  esp_wifi_set_promiscuous_rx_cb(&promiscuousRxCb);
  wifi_promiscuous_filter_t filter = {};
  filter.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT | WIFI_PROMIS_FILTER_MASK_DATA |
                       WIFI_PROMIS_FILTER_MASK_CTRL;
  esp_wifi_set_promiscuous_filter(&filter);
  esp_wifi_set_channel(activeSniffChannel, WIFI_SECOND_CHAN_NONE);
  esp_err_t err = esp_wifi_set_promiscuous(true);
  sniffing = (err == ESP_OK);
  Serial.printf("[sniff] promiscuous %s on channel %u\n",
                sniffing ? "ON" : "FAILED", activeSniffChannel);
}

static void pauseSniffForUpload() {
  if (sniffing) {
    esp_wifi_set_promiscuous(false);
    sniffing = false;
  }
  // Ensure STA association is usable for HTTPS
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[wifi] reconnecting before upload..."));
    connectHotspot();
  }
}

static void resumeSniff() {
  startSniffing();
}

static void resetWindowAccumulators() {
  portENTER_CRITICAL(&sniffMux);
  rssiSum = 0;
  packetCount = 0;
  portEXIT_CRITICAL(&sniffMux);
}

static void snapshotWindow(int64_t *outRssiSum, uint32_t *outPackets) {
  portENTER_CRITICAL(&sniffMux);
  *outRssiSum = rssiSum;
  *outPackets = packetCount;
  rssiSum = 0;
  packetCount = 0;
  portEXIT_CRITICAL(&sniffMux);
}

static float pctChange(float current, float previous) {
  if (previous == 0.0f) {
    return current == 0.0f ? 0.0f : 100.0f;
  }
  return ((current - previous) / previous) * 100.0f;
}

static bool pushReadingToSupabase(float avgRssi, uint32_t packets, int dens) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[http] skip POST — not connected"));
    return false;
  }

  String url = String(SUPABASE_URL) + "/rest/v1/readings";
  WiFiClientSecure client;
  client.setInsecure();  // hackathon: skip cert pinning

  HTTPClient http;
  if (!http.begin(client, url)) {
    Serial.println(F("[http] begin() failed"));
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_API_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_API_KEY);
  http.addHeader("Prefer", "return=minimal");
  http.setTimeout(15000);

  JsonDocument doc;
  doc["avg_rssi"] = avgRssi;
  doc["packet_count"] = packets;
  doc["density"] = dens;
  doc["location"] = LOCATION;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code < 200 || code >= 300) {
    Serial.printf("[http] POST failed code=%d body=%s\n", code, http.getString().c_str());
    http.end();
    return false;
  }

  Serial.printf("[http] POST ok (%d) density=%d packets=%u avg_rssi=%.1f\n",
                code, dens, packets, avgRssi);
  http.end();
  return true;
}

static void processWindow() {
  int64_t sum = 0;
  uint32_t packets = 0;
  snapshotWindow(&sum, &packets);

  float avgRssi = 0.0f;
  if (packets > 0) {
    avgRssi = static_cast<float>(sum) / static_cast<float>(packets);
  }

  float rssiDeltaPct = 0.0f;
  float packetDeltaPct = 0.0f;

  if (hasPrevWindow) {
    rssiDeltaPct = pctChange(avgRssi, prevAvgRssi);
    packetDeltaPct = pctChange(static_cast<float>(packets),
                               static_cast<float>(prevPacketCount));

    const bool rssiDropped = rssiDeltaPct <= -RSSI_THRESHOLD;
    const bool packetsRose = packetDeltaPct >= PACKET_THRESHOLD;

    if (rssiDropped && packetsRose) {
      density = min(100, density + STEP_UP);
    } else {
      density = max(0, density - STEP_DOWN);
    }
  } else {
    Serial.println(F("[window] first window — establishing baseline, density unchanged"));
  }

  Serial.println(F("---------- window ----------"));
  Serial.printf("  avg_rssi=%.2f  packet_count=%u\n", avgRssi, packets);
  Serial.printf("  rssi_%%Δ=%.1f  packet_%%Δ=%.1f\n", rssiDeltaPct, packetDeltaPct);
  Serial.printf("  density=%d\n", density);
  Serial.println(F("----------------------------"));

  prevAvgRssi = avgRssi;
  prevPacketCount = packets;
  hasPrevWindow = true;

  // Radio: pause sniff → POST → resume (single-radio coexistence)
  pauseSniffForUpload();
  pushReadingToSupabase(avgRssi, packets, density);
  resumeSniff();
  windowStartMs = millis();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println(F("=== WiFi Ambient Crowd Density Sensor ==="));
  Serial.println(F("No MAC tracking. Aggregate RSSI + packet count only."));

  if (!hasUsableConfig()) {
    Serial.println(F("[fatal] Invalid local config.h. Set hotspot credentials, the"));
    Serial.println(F("        https://<project-ref>.supabase.co URL, and anon key."));
    while (true) {
      delay(5000);
    }
  }

  if (!connectHotspot()) {
    Serial.println(F("[fatal] Hotspot connect failed. Fix credentials in config.h and reset."));
    // Keep looping so Serial stays useful; no sniffing until connected.
    while (true) {
      delay(5000);
      Serial.println(F("[fatal] still not connected — check WIFI_SSID / WIFI_PASSWORD"));
      connectHotspot();
      if (WiFi.status() == WL_CONNECTED) {
        break;
      }
    }
  }

  // Optional calibration aid: print nearby AP channels once at boot
  printNearbyAps();
  // Re-join after scan (scan can disrupt STA)
  if (WiFi.status() != WL_CONNECTED) {
    connectHotspot();
  }

  resetWindowAccumulators();
  startSniffing();
  windowStartMs = millis();
  Serial.printf("[ready] window=%lu ms  location=%s\n", WINDOW_MS, LOCATION);
  Serial.println(F("[ready] Tunables: RSSI_THRESHOLD, PACKET_THRESHOLD, STEP_UP, STEP_DOWN"));
}

void loop() {
  // Keep STA alive when possible; if sniff channel differs from AP, association
  // may drop until pauseSniffForUpload reconnects — that is expected.
  if (millis() - windowStartMs >= WINDOW_MS) {
    processWindow();
  }
  delay(50);
}
