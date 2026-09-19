# Packed demo guide

Packed estimates relative crowd activity with an ESP32. It uses aggregate Wi-Fi
packet activity only—no MAC addresses, people counts, or GPS.

## Before the demo

1. Edit `location.config.json`: `id`, `label`, `latitude`, `longitude`.
2. Put credentials only in ignored files:
   - `firmware/include/config.h`: hotspot, Supabase URL/anon key,
     `DEVICE_INGEST_KEY`
   - `web/.env.local`: Supabase URL/anon key

## Flash the ESP32

Use short windows for the demo:

```powershell
cd firmware
pio run -e esp32dev_short --target upload
pio device monitor -b 115200
```

`esp32dev_short` uses 30-second windows. Normal `esp32dev` uses five-minute
windows.

## Serial commands

Send these in Serial Monitor at **115200 baud**. Commands are case-insensitive
and do not pause sniffing or uploads.

| Command | Action |
| --- | --- |
| `C` | Start quiet-room baseline calibration. |
| `S30` | Save current activity as subjective density 30. Use `S0`–`S100`. |
| `A` | Clear only the manual density anchor. |
| `B` | Print baseline, anchor, packet activity, density, and location. |
| `X` | Clear the saved baseline and anchor. |

## Demo flow

1. Put the ESP32 in a quiet room.
2. Send `C`.
3. Wait for three windows: about **90 seconds** in short mode.
4. Wait for `[calibration] complete and saved to NVS`.
5. Move the ESP32 to the testing area. The baseline survives power loss.
6. After a smoothed reading, optionally send `S30`, `S50`, or `S80`.
7. Run the dashboard:

   ```powershell
   cd web
   pnpm dev
   ```

8. Open `http://localhost:3000/?live=1`.

The baseline is density 0. A manual `S<number>` anchor maps its packet activity
to that score; density moves gradually toward its target and stays within
0–100. Changing the location ID requires a new baseline and anchor.

For full location/calibration details, see [LOCATION.md](LOCATION.md).
