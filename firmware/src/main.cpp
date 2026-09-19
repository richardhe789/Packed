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
#include <Preferences.h>
#include <math.h>
#include <string.h>

#include "config.h"
#include "location_config.generated.h"

// --- Tunable packet-density mapping (edit live at venue) ---
static const uint8_t PACKET_ROLLING_WINDOWS = 3;
static const float BUSY_PACKET_INCREASE_PCT = 20.0f;
static const float TARGET_BUSY_PACKET_INCREASE_PCT = 100.0f;
static const float DENSITY_DEADBAND = 8.0f;
static const int DENSITY_MAX_STEP = 12;
// Quiet-room calibration uses this many full measurement windows.
static const uint8_t BASELINE_WINDOWS = 3;

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
static const char *BASELINE_NAMESPACE = "crowd_base";

static Preferences preferences;
static bool baselineValid = false;
static float baselineAvgRssi = 0.0f;
static float baselineAvgPackets = 0.0f;
static String baselineLocation;
static bool manualAnchorValid = false;
static float manualAnchorPackets = 0.0f;
static int manualAnchorDensity = 0;
static String manualAnchorLocation;
static bool calibrationActive = false;
static uint8_t calibrationWindowsCollected = 0;
static float calibrationRssiTotal = 0.0f;
static float calibrationPacketsTotal = 0.0f;
static uint32_t packetHistory[PACKET_ROLLING_WINDOWS] = {};
static uint8_t packetHistoryCount = 0;
static uint8_t packetHistoryNext = 0;
static bool hasSmoothedPacketSample = false;
static float latestSmoothedPackets = 0.0f;
static int density = 0;
static unsigned long windowStartMs = 0;
static bool serialAnchorPending = false;
static char serialAnchorDigits[4] = {};
static uint8_t serialAnchorLength = 0;
static unsigned long serialAnchorLastByteMs = 0;

static void resetWindowAccumulators();
static void resetPacketSmoothing();

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

static void printBaselineStatus() {
  if (!baselineValid) {
    Serial.printf("[baseline] no usable baseline for location=%s; send C in a quiet room\n", LOCATION);
    return;
  }
  Serial.printf("[baseline] loaded location=%s avg_rssi=%.2f avg_packets=%.2f\n",
                baselineLocation.c_str(), baselineAvgRssi, baselineAvgPackets);
}

static void printManualAnchorStatus() {
  if (!manualAnchorValid) {
    Serial.printf("[anchor] no usable manual anchor for location=%s\n", LOCATION);
    return;
  }
  Serial.printf("[anchor] loaded location=%s packets=%.2f density=%d\n",
                manualAnchorLocation.c_str(), manualAnchorPackets, manualAnchorDensity);
}

static void printCalibrationStatus() {
  printBaselineStatus();
  printManualAnchorStatus();
  if (hasSmoothedPacketSample) {
    Serial.printf("[status] location=%s smoothed_packets=%.2f density=%d\n",
                  LOCATION, latestSmoothedPackets, density);
  } else {
    Serial.printf("[status] location=%s no smoothed packet sample yet density=%d\n",
                  LOCATION, density);
  }
}

static void loadBaseline() {
  baselineValid = false;
  baselineLocation = "";
  if (!preferences.begin(BASELINE_NAMESPACE, true)) {
    Serial.println(F("[baseline] NVS unavailable; calibration will not persist"));
    return;
  }

  const bool savedValid = preferences.getBool("valid", false);
  const String savedLocation = preferences.getString("location", "");
  const float savedRssi = preferences.getFloat("avg_rssi", NAN);
  const float savedPackets = preferences.getFloat("avg_packets", NAN);
  preferences.end();

  if (!savedValid) {
    Serial.println(F("[baseline] no saved calibration"));
    return;
  }
  if (!isfinite(savedRssi) || !isfinite(savedPackets) || savedPackets < 0.0f ||
      savedLocation.length() == 0 || savedLocation.length() > 64) {
    Serial.println(F("[baseline] saved calibration is invalid/corrupt; send C to recalibrate"));
    return;
  }
  if (savedLocation != LOCATION) {
    Serial.printf("[baseline] saved for location=%s, current=%s; send C to calibrate this location\n",
                  savedLocation.c_str(), LOCATION);
    return;
  }

  baselineAvgRssi = savedRssi;
  baselineAvgPackets = savedPackets;
  baselineLocation = savedLocation;
  baselineValid = true;
  printBaselineStatus();
}

static void loadManualAnchor() {
  manualAnchorValid = false;
  manualAnchorLocation = "";
  if (!preferences.begin(BASELINE_NAMESPACE, true)) {
    Serial.println(F("[anchor] NVS unavailable; manual anchor not loaded"));
    return;
  }
  const bool savedValid = preferences.getBool("anchor_valid", false);
  const String savedLocation = preferences.getString("anchor_location", "");
  const float savedPackets = preferences.getFloat("anchor_packets", NAN);
  const uint32_t savedDensity = preferences.getUInt("anchor_density", 101);
  preferences.end();

  if (!savedValid) {
    return;
  }
  if (!isfinite(savedPackets) || savedPackets < 0.0f || savedDensity > 100 ||
      savedLocation.length() == 0 || savedLocation.length() > 64) {
    Serial.println(F("[anchor] saved anchor is invalid/corrupt; send S<number> again"));
    return;
  }
  if (savedLocation != LOCATION) {
    Serial.printf("[anchor] saved for location=%s, current=%s; send S<number> again\n",
                  savedLocation.c_str(), LOCATION);
    return;
  }
  if (baselineValid && savedDensity > 0 && savedPackets <= baselineAvgPackets) {
    Serial.println(F("[anchor] saved anchor is not above the current quiet baseline; send S<number> again"));
    return;
  }

  manualAnchorPackets = savedPackets;
  manualAnchorDensity = static_cast<int>(savedDensity);
  manualAnchorLocation = savedLocation;
  manualAnchorValid = true;
  printManualAnchorStatus();
}

static bool saveBaseline(float avgRssi, float avgPackets) {
  if (!isfinite(avgRssi) || !isfinite(avgPackets) || avgPackets < 0.0f ||
      !preferences.begin(BASELINE_NAMESPACE, false)) {
    Serial.println(F("[baseline] failed to open NVS for saving"));
    return false;
  }
  const bool saved = preferences.putFloat("avg_rssi", avgRssi) == sizeof(float) &&
                     preferences.putFloat("avg_packets", avgPackets) == sizeof(float) &&
                     preferences.putString("location", LOCATION) == strlen(LOCATION) &&
                     preferences.putBool("valid", true) == sizeof(bool);
  preferences.end();
  if (!saved) {
    Serial.println(F("[baseline] failed to save calibration"));
    return false;
  }

  baselineAvgRssi = avgRssi;
  baselineAvgPackets = avgPackets;
  baselineLocation = LOCATION;
  baselineValid = true;
  return true;
}

static bool saveManualAnchor(int anchorDensity) {
  if (!baselineValid) {
    Serial.println(F("[anchor] quiet baseline required before S<number>"));
    return false;
  }
  if (!hasSmoothedPacketSample) {
    Serial.println(F("[anchor] no smoothed packet sample yet; wait for a measurement window"));
    return false;
  }
  if (anchorDensity < 0 || anchorDensity > 100) {
    Serial.println(F("[anchor] density must be an integer from 0 through 100"));
    return false;
  }
  if (anchorDensity > 0 && latestSmoothedPackets <= baselineAvgPackets) {
    Serial.println(F("[anchor] packet activity must be above the quiet baseline for a nonzero anchor"));
    return false;
  }
  if (!preferences.begin(BASELINE_NAMESPACE, false)) {
    Serial.println(F("[anchor] failed to open NVS for saving"));
    return false;
  }
  const bool saved = preferences.putFloat("anchor_packets", latestSmoothedPackets) == sizeof(float) &&
                     preferences.putUInt("anchor_density", anchorDensity) == sizeof(uint32_t) &&
                     preferences.putString("anchor_location", LOCATION) == strlen(LOCATION) &&
                     preferences.putBool("anchor_valid", true) == sizeof(bool);
  preferences.end();
  if (!saved) {
    Serial.println(F("[anchor] failed to save manual anchor"));
    return false;
  }

  manualAnchorPackets = latestSmoothedPackets;
  manualAnchorDensity = anchorDensity;
  manualAnchorLocation = LOCATION;
  manualAnchorValid = true;
  Serial.printf("[anchor] saved packets=%.2f density=%d location=%s\n",
                manualAnchorPackets, manualAnchorDensity, LOCATION);
  return true;
}

static void clearManualAnchor() {
  manualAnchorValid = false;
  manualAnchorPackets = 0.0f;
  manualAnchorDensity = 0;
  manualAnchorLocation = "";
  if (!preferences.begin(BASELINE_NAMESPACE, false)) {
    Serial.println(F("[anchor] NVS unavailable; in-memory anchor cleared"));
    return;
  }
  preferences.remove("anchor_packets");
  preferences.remove("anchor_density");
  preferences.remove("anchor_location");
  preferences.remove("anchor_valid");
  preferences.end();
  Serial.println(F("[anchor] cleared from NVS"));
}

static void startCalibration() {
  calibrationActive = true;
  calibrationWindowsCollected = 0;
  calibrationRssiTotal = 0.0f;
  calibrationPacketsTotal = 0.0f;
  density = 0;
  resetPacketSmoothing();
  resetWindowAccumulators();
  windowStartMs = millis();
  Serial.printf("[calibration] started for location=%s; keep the room quiet for %u windows\n",
                LOCATION, BASELINE_WINDOWS);
}

static void clearBaseline() {
  calibrationActive = false;
  calibrationWindowsCollected = 0;
  baselineValid = false;
  baselineLocation = "";
  baselineAvgRssi = 0.0f;
  baselineAvgPackets = 0.0f;
  density = 0;
  resetPacketSmoothing();
  if (preferences.begin(BASELINE_NAMESPACE, false)) {
    preferences.clear();
    preferences.end();
    Serial.println(F("[baseline] cleared from NVS; send C to calibrate"));
  } else {
    Serial.println(F("[baseline] NVS unavailable; in-memory baseline cleared"));
  }
}

static void resetAnchorCommand() {
  serialAnchorPending = false;
  serialAnchorLength = 0;
  serialAnchorDigits[0] = '\0';
}

static void finishAnchorCommand() {
  if (!serialAnchorPending) return;
  if (serialAnchorLength == 0) {
    Serial.println(F("[serial] use S<number>, for example S30"));
    resetAnchorCommand();
    return;
  }
  serialAnchorDigits[serialAnchorLength] = '\0';
  const int anchorDensity = atoi(serialAnchorDigits);
  saveManualAnchor(anchorDensity);
  resetAnchorCommand();
}

static void handleSerialCommands() {
  while (Serial.available() > 0) {
    const char command = static_cast<char>(Serial.read());
    if (serialAnchorPending) {
      if (command >= '0' && command <= '9' && serialAnchorLength < 3) {
        serialAnchorDigits[serialAnchorLength++] = command;
        serialAnchorLastByteMs = millis();
      } else if (command == '\r' || command == '\n') {
        finishAnchorCommand();
      } else {
        Serial.println(F("[serial] invalid S command; use S0 through S100"));
        resetAnchorCommand();
      }
      continue;
    }

    switch (command) {
      case 'S': case 's':
        serialAnchorPending = true;
        serialAnchorLength = 0;
        serialAnchorLastByteMs = millis();
        break;
      case 'C': case 'c': startCalibration(); break;
      case 'X': case 'x': clearBaseline(); break;
      case 'A': case 'a': clearManualAnchor(); break;
      case 'B': case 'b': printCalibrationStatus(); break;
      case '\r': case '\n': case ' ': break;
      default:
        Serial.println(F("[serial] commands: C, X, B, A, or S<number> (for example S30)"));
        break;
    }
  }

  // Handles serial monitors configured without a line ending without waiting.
  if (serialAnchorPending && millis() - serialAnchorLastByteMs >= 150UL) {
    finishAnchorCommand();
  }
}

// --- Window accumulators (updated from promiscuous callback) ---
static portMUX_TYPE sniffMux = portMUX_INITIALIZER_UNLOCKED;
static volatile int64_t rssiSum = 0;
static volatile uint32_t packetCount = 0;

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

static void resetPacketSmoothing() {
  for (uint8_t i = 0; i < PACKET_ROLLING_WINDOWS; i++) {
    packetHistory[i] = 0;
  }
  packetHistoryCount = 0;
  packetHistoryNext = 0;
  hasSmoothedPacketSample = false;
  latestSmoothedPackets = 0.0f;
}

static float addPacketSampleAndAverage(uint32_t packets) {
  packetHistory[packetHistoryNext] = packets;
  packetHistoryNext = (packetHistoryNext + 1) % PACKET_ROLLING_WINDOWS;
  if (packetHistoryCount < PACKET_ROLLING_WINDOWS) {
    packetHistoryCount += 1;
  }

  float total = 0.0f;
  for (uint8_t i = 0; i < packetHistoryCount; i++) {
    total += static_cast<float>(packetHistory[i]);
  }
  latestSmoothedPackets = total / packetHistoryCount;
  hasSmoothedPacketSample = true;
  return latestSmoothedPackets;
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

  float rssiDeltaPct = 0.0f;
  float packetDeltaPct = 0.0f;
  float smoothedPackets = 0.0f;
  int targetDensity = density;
  const char *updateReason = "waiting";

  if (calibrationActive) {
    calibrationRssiTotal += avgRssi;
    calibrationPacketsTotal += static_cast<float>(packets);
    calibrationWindowsCollected += 1;
    density = 0;
    targetDensity = 0;
    updateReason = "calibrating";
    Serial.printf("[calibration] window %u/%u avg_rssi=%.2f packets=%u\n",
                  calibrationWindowsCollected, BASELINE_WINDOWS, avgRssi, packets);
    if (calibrationWindowsCollected >= BASELINE_WINDOWS) {
      const float calibratedRssi = calibrationRssiTotal / BASELINE_WINDOWS;
      const float calibratedPackets = calibrationPacketsTotal / BASELINE_WINDOWS;
      calibrationActive = false;
      if (saveBaseline(calibratedRssi, calibratedPackets)) {
        Serial.println(F("[calibration] complete and saved to NVS; safe to power off"));
        printBaselineStatus();
      }
    }
  } else if (baselineValid) {
    smoothedPackets = addPacketSampleAndAverage(packets);
    // RSSI remains diagnostic only; packet activity determines density.
    const float rssiMagnitude = fabsf(baselineAvgRssi);
    if (rssiMagnitude >= 0.1f) {
      rssiDeltaPct = ((baselineAvgRssi - avgRssi) / rssiMagnitude) * 100.0f;
    }
    if (baselineAvgPackets > 0.0f) {
      packetDeltaPct = ((smoothedPackets - baselineAvgPackets) /
                        baselineAvgPackets) * 100.0f;
    } else if (smoothedPackets > 0.0f) {
      packetDeltaPct = 100.0f;
    }

    if (packetHistoryCount < PACKET_ROLLING_WINDOWS) {
      updateReason = "smoothing-warmup";
    } else if (fabsf(packetDeltaPct) <= DENSITY_DEADBAND) {
      updateReason = "deadband-hold";
    } else {
      if (manualAnchorValid && manualAnchorDensity > 0 &&
          manualAnchorPackets > baselineAvgPackets) {
        const float anchorSpan = manualAnchorPackets - baselineAvgPackets;
        if (smoothedPackets <= baselineAvgPackets) {
          targetDensity = 0;
          updateReason = "anchor-below-baseline";
        } else if (smoothedPackets <= manualAnchorPackets) {
          targetDensity = static_cast<int>(roundf(
              ((smoothedPackets - baselineAvgPackets) / anchorSpan) * manualAnchorDensity));
          updateReason = "anchor-interpolate";
        } else {
          // Continue at the same slope above the subjective anchor until 100.
          targetDensity = static_cast<int>(roundf(
              manualAnchorDensity +
              ((smoothedPackets - manualAnchorPackets) / anchorSpan) * manualAnchorDensity));
          updateReason = "anchor-extend";
        }
      } else if (manualAnchorValid) {
        targetDensity = 0;
        updateReason = "anchor-zero";
      } else {
        targetDensity = static_cast<int>(roundf(
            (packetDeltaPct / TARGET_BUSY_PACKET_INCREASE_PCT) * 100.0f));
        updateReason = packetDeltaPct >= BUSY_PACKET_INCREASE_PCT
                           ? "baseline-map-busy"
                           : "baseline-map";
      }
      targetDensity = constrain(targetDensity, 0, 100);
      if (density < targetDensity) {
        density = min(targetDensity, density + DENSITY_MAX_STEP);
        if (strcmp(updateReason, "anchor-interpolate") == 0 ||
            strcmp(updateReason, "anchor-extend") == 0) {
          updateReason = "anchor-rise";
        }
      } else if (density > targetDensity) {
        density = max(targetDensity, density - DENSITY_MAX_STEP);
        updateReason = manualAnchorValid ? "anchor-fall" : "below-target-fall";
      } else {
        updateReason = "at-target";
      }
    }
  } else {
    density = 0;
    targetDensity = 0;
    updateReason = "no-baseline";
    Serial.println(F("[baseline] no active calibration; send C in a quiet room"));
  }

  Serial.println(F("---------- window ----------"));
  Serial.printf("  avg_rssi=%.2f  raw_packets=%u  smoothed_packets=%.2f\n",
                avgRssi, packets, smoothedPackets);
  Serial.printf("  quiet_baseline_packets=%.2f  anchor_packets=%.2f anchor_density=%d\n",
                baselineAvgPackets, manualAnchorPackets, manualAnchorDensity);
  Serial.printf("  packet_%%Δ=%.1f  rssi_%%Δ=%.1f\n", packetDeltaPct, rssiDeltaPct);
  Serial.printf("  target_density=%d  density=%d  reason=%s\n",
                targetDensity, density, updateReason);
  Serial.println(F("----------------------------"));

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
  loadBaseline();
  loadManualAnchor();
  startSniffing();
  windowStartMs = millis();
  Serial.printf("[ready] window=%lu ms  location=%s\n", WINDOW_MS, LOCATION);
  Serial.println(F("[ready] Commands: C=quiet baseline, S<number>=anchor, A=clear anchor, X=clear baseline, B=status"));
  Serial.printf("[ready] Baseline calibration uses %u windows\n", BASELINE_WINDOWS);
  Serial.printf("[ready] Packet score: %u-window average, %d max step, %.0f%% deadband\n",
                PACKET_ROLLING_WINDOWS, DENSITY_MAX_STEP, DENSITY_DEADBAND);
}

void loop() {
  // Keep STA alive when possible; if sniff channel differs from AP, association
  // may drop until pauseSniffForUpload reconnects — that is expected.
  handleSerialCommands();
  if (millis() - windowStartMs >= WINDOW_MS) {
    processWindow();
  }
  delay(50);
}
