'use strict';

/**
 * Mock location directory (F9.1b) — UN duty stations.
 *
 * MCP-like signatures so swapping to a real MCP tool later is a single import
 * change. NOT production data — a fixture for the pilot flow.
 *
 * @module instances/flowdesk/services/directory/location.mock
 */

const MOCK_LOCATIONS = [
  { code: 'NY-HQ', name: 'New York HQ', building: 'Secretariat', city: 'New York', timezone: 'America/New_York' },
  { code: 'GVA', name: 'Geneva', building: 'Palais des Nations', city: 'Geneva', timezone: 'Europe/Zurich' },
  { code: 'VIE', name: 'Vienna', building: 'Vienna International Centre', city: 'Vienna', timezone: 'Europe/Vienna' },
  { code: 'NBO', name: 'Nairobi', building: 'UNON', city: 'Nairobi', timezone: 'Africa/Nairobi' },
  { code: 'ROM', name: 'Rome', building: 'FAO HQ', city: 'Rome', timezone: 'Europe/Rome' },
  { code: 'BKK', name: 'Bangkok', building: 'UN Conference Centre', city: 'Bangkok', timezone: 'Asia/Bangkok' },
  { code: 'SCL', name: 'Santiago', building: 'ECLAC', city: 'Santiago', timezone: 'America/Santiago' },
  { code: 'ADD', name: 'Addis Ababa', building: 'ECA', city: 'Addis Ababa', timezone: 'Africa/Addis_Ababa' },
  { code: 'BEY', name: 'Beirut', building: 'ESCWA', city: 'Beirut', timezone: 'Asia/Beirut' },
  { code: 'HAG', name: 'The Hague', building: 'Peace Palace', city: 'The Hague', timezone: 'Europe/Amsterdam' },
];

/** All duty stations. */
async function listLocations() {
  return MOCK_LOCATIONS.map((l) => ({ ...l }));
}

/** Resolve one location by code (case-insensitive). Returns null if unknown. */
async function resolveLocation(code) {
  if (!code) return null;
  const hit = MOCK_LOCATIONS.find((l) => l.code.toLowerCase() === String(code).toLowerCase());
  return hit ? { ...hit } : null;
}

/** Fuzzy search by name/city/code (for free-text location mentions). */
async function searchLocations(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return MOCK_LOCATIONS
    .filter((l) => l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.code.toLowerCase().includes(q))
    .map((l) => ({ ...l }));
}

module.exports = { listLocations, resolveLocation, searchLocations, MOCK_LOCATIONS };
