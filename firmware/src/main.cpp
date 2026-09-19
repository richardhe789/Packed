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
#include <math.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>

#include "config.h"
#include "location_config.generated.h"

// --- Tunable density scoring (edit live at venue) ---
// combined_score = packet_z - rssi_z. Climb when packets are above the empty-room
// baseline and/or RSSI is weaker (more negative) than baseline.
// Step 0 (unlabeled readings): dining_hall quiet cluster often moves together
// window-to-window (noise — why this is not a rolling % delta). Goodwin levels
// corr(avg_rssi, packet_count) ≈ -0.58, so keep packet_z - rssi_z. Flip the
// minus to a plus if a labeled walk shows RSSI strengthening with people.
static const float SCORE_THRESHOLD = 1.0f;
static const int STEP_UP = 10;
static const int STEP_DOWN = 5;
static const float RSSI_STDDEV_EPS = 1.0f;      // dBm; avoid /0
static const float PACKET_STDDEV_EPS = 50.0f;   // packets; avoid /0

// Permanent empty-room floor (dining_hall_main quiet windows, ~30s).
// After a new empty run, paste Serial "calibration done" numbers here and reflash.
static const float EMPTY_RSSI_MEAN = -72.89f;
static const float EMPTY_RSSI_STDDEV = 0.94f;
static const float EMPTY_PACKET_MEAN = 4401.6f;
static const float EMPTY_PACKET_STDDEV = 223.0f;

#ifndef CALIBRATION_MS
static const unsigned long CALIBRATION_MS = 5UL * 60UL * 1000UL;
#endif

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
         !hasPlaceholder(DEVICE_INGEST_KEY) &&
         url.startsWith("https://") && url.endsWith(".supabase.co") &&
         url.indexOf("supabase.com/dashboard") < 0;
}

// --- Window accumulators (updated from promiscuous callback) ---
static portMUX_TYPE sniffMux = portMUX_INITIALIZER_UNLOCKED;
static volatile int64_t rssiSum = 0;
static volatile uint32_t packetCount = 0;

static int density = 0;

// Empty-room baseline from an explicit calibration run (not the live window cycle).
struct RunningStats {
  uint32_t n = 0;
  double mean = 0.0;
  double m2 = 0.0;
};

static bool calibrating = false;
static bool calibrated = false;
static unsigned long calibStartMs = 0;
static RunningStats rssiCal;
static RunningStats packetCal;
static float rssi_baseline_mean = 0.0f;
static float rssi_baseline_stddev = RSSI_STDDEV_EPS;
static float packet_baseline_mean = 0.0f;
static float packet_baseline_stddev = PACKET_STDDEV_EPS;

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

static void statsAdd(RunningStats *s, double x) {
  s->n++;
  const double d = x - s->mean;
  s->mean += d / static_cast<double>(s->n);
  s->m2 += d * (x - s->mean);
}

static float statsStddev(const RunningStats *s, float eps) {
  if (s->n < 2) {
    return eps;
  }
  const double var = s->m2 / static_cast<double>(s->n - 1);
  const float sd = static_cast<float>(sqrt(var));
  return sd < eps ? eps : sd;
}

static void applyHardcodedBaseline() {
  calibrating = false;
  calibrated = true;
  rssi_baseline_mean = EMPTY_RSSI_MEAN;
  rssi_baseline_stddev = EMPTY_RSSI_STDDEV < RSSI_STDDEV_EPS ? RSSI_STDDEV_EPS
                                                             : EMPTY_RSSI_STDDEV;
  packet_baseline_mean = EMPTY_PACKET_MEAN;
  packet_baseline_stddev = EMPTY_PACKET_STDDEV < PACKET_STDDEV_EPS
                               ? PACKET_STDDEV_EPS
                               : EMPTY_PACKET_STDDEV;
  Serial.println(F("[cal] using hardcoded empty-room baseline"));
  Serial.printf("  rssi_baseline_mean=%.2f  rssi_baseline_stddev=%.2f\n",
                rssi_baseline_mean, rssi_baseline_stddev);
  Serial.printf("  packet_baseline_mean=%.1f  packet_baseline_stddev=%.1f\n",
                packet_baseline_mean, packet_baseline_stddev);
  Serial.println(F("[cal] send 'c' to recapture empty (RAM only until you paste into EMPTY_*)"));
}

static void beginCalibration() {
  calibrating = true;
  calibrated = false;
  calibStartMs = millis();
  rssiCal = RunningStats{};
  packetCal = RunningStats{};
  density = 0;
  resetWindowAccumulators();
  windowStartMs = millis();
  Serial.printf("[cal] empty-room calibration started (%lu ms). Keep the space empty.\n",
                CALIBRATION_MS);
  Serial.println(F("[cal] send 'c' over serial to restart calibration"));
}

static void finishCalibration() {
  rssi_baseline_mean = static_cast<float>(rssiCal.mean);
  rssi_baseline_stddev = statsStddev(&rssiCal, RSSI_STDDEV_EPS);
  packet_baseline_mean = static_cast<float>(packetCal.mean);
  packet_baseline_stddev = statsStddev(&packetCal, PACKET_STDDEV_EPS);
  calibrating = false;
  calibrated = true;
  Serial.println(F("---------- calibration done ----------"));
  Serial.printf("  rssi_baseline_mean=%.2f  rssi_baseline_stddev=%.2f  n=%u\n",
                rssi_baseline_mean, rssi_baseline_stddev, rssiCal.n);
  Serial.printf("  packet_baseline_mean=%.1f  packet_baseline_stddev=%.1f\n",
                packet_baseline_mean, packet_baseline_stddev);
  Serial.println(F("  paste into EMPTY_* in main.cpp to keep this after reboot"));
  Serial.println(F("--------------------------------------"));
}

static void pollSerialCommands() {
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == 'c' || c == 'C') {
      beginCalibration();
    }
  }
}

static bool pushReadingToSupabase(float avgRssi, uint32_t packets, int dens) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[http] skip POST — not connected"));
    return false;
  }

  String url = String(SUPABASE_URL) + INGEST_PATH;
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
  http.addHeader("x-device-key", DEVICE_INGEST_KEY);
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

  float rssi_z = 0.0f;
  float packet_z = 0.0f;
  float combined_score = 0.0f;

  if (packets == 0) {
    Serial.println(F("[window] zero packets — skip score/calibration sample"));
  } else if (calibrating) {
    statsAdd(&rssiCal, avgRssi);
    statsAdd(&packetCal, static_cast<double>(packets));
    Serial.println(F("---------- cal window ----------"));
    Serial.printf("  avg_rssi=%.2f  packet_count=%u  n=%u\n", avgRssi, packets, rssiCal.n);
    Serial.println(F("--------------------------------"));
    if ((millis() - calibStartMs) >= CALIBRATION_MS && rssiCal.n >= 1) {
      finishCalibration();
    }
  } else if (calibrated) {
    rssi_z = (avgRssi - rssi_baseline_mean) / rssi_baseline_stddev;
    packet_z = (static_cast<float>(packets) - packet_baseline_mean) / packet_baseline_stddev;
    combined_score = packet_z - rssi_z;
    if (combined_score >= SCORE_THRESHOLD) {
      density = min(100, density + STEP_UP);
    } else {
      density = max(0, density - STEP_DOWN);
    }
    Serial.println(F("---------- window ----------"));
    Serial.printf("  avg_rssi=%.2f  packet_count=%u\n", avgRssi, packets);
    Serial.printf("  rssi_z=%.2f  packet_z=%.2f  combined_score=%.2f  density=%d\n",
                  rssi_z, packet_z, combined_score, density);
    Serial.println(F("----------------------------"));
  } else {
    Serial.println(F("[window] not calibrated — send 'c' (density unchanged)"));
    Serial.printf("  avg_rssi=%.2f  packet_count=%u  density=%d\n", avgRssi, packets, density);
  }

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
  // ponytail: one check that the z-score combine cannot silently invert.
  {
    const float combined = ((6000.0f - 4400.0f) / 200.0f) - ((-75.0f - (-72.5f)) / 1.0f);
    Serial.printf("[selfcheck] combined_score=%.1f (%s)\n", combined,
                  combined >= SCORE_THRESHOLD ? "ok" : "FAIL");
  }

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
  Serial.printf("[ready] window=%lu ms  location=%s\n", WINDOW_MS, LOCATION);
  Serial.println(F("[ready] Tunables: SCORE_THRESHOLD, STEP_UP, STEP_DOWN"));
  windowStartMs = millis();
  applyHardcodedBaseline();
}

void loop() {
  pollSerialCommands();
  // Keep STA alive when possible; if sniff channel differs from AP, association
  // may drop until pauseSniffForUpload reconnects — that is expected.
  if (millis() - windowStartMs >= WINDOW_MS) {
    processWindow();
  }
  delay(50);
}
