/**
 * Dining halls on the map besides the live ESP pin (location.config.json).
 *
 * To add a hall: append one object (id, label, lat/lng).
 * When an ESP32 starts posting, set liveSensor to true and use the same id
 * in location.config.json / firmware.
 */
export const CAMPUS_SITES = [
  {
    id: "dietrick",
    label: "Dietrick",
    shortLabel: "Dietrick",
    liveSensor: false,
    coords: { lat: 37.22453, lng: -80.42111 },
  },
  {
    id: "owens",
    label: "Owens",
    shortLabel: "Owens",
    liveSensor: false,
    coords: { lat: 37.229, lng: -80.4184 },
  },
  {
    id: "west_end",
    label: "West End",
    shortLabel: "West End",
    liveSensor: false,
    coords: { lat: 37.2312, lng: -80.4278 },
  },
  {
    id: "turner",
    label: "Turner Place",
    shortLabel: "Turner",
    liveSensor: false,
    coords: { lat: 37.232, lng: -80.421 },
  },
] as const;
