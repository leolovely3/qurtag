const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

export const isMapboxConfigured = !!TOKEN;

/**
 * Static-tile preview URL for a location card.
 * Centered, with a single signal-coral pin.
 */
export function mapboxStaticUrl(lat: number, lng: number, opts?: { zoom?: number; width?: number; height?: number }): string | null {
  if (!TOKEN) return null;
  const zoom = opts?.zoom ?? 14;
  const w = opts?.width ?? 640;
  const h = opts?.height ?? 280;
  const pin = `pin-l+ff5c2e(${lng},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${pin}/${lng},${lat},${zoom}/${w}x${h}@2x?access_token=${TOKEN}`;
}

interface MapboxPlace {
  lat: number;
  lng: number;
  label: string | null;
  city: string | null;
}

/**
 * Reverse geocode coordinates to a human label. Best-effort. Failures
 * just return null and we keep the raw coords.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<MapboxPlace | null> {
  if (!TOKEN) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${TOKEN}&types=place,neighborhood,locality,address&limit=1`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        context?: Array<{ id: string; text: string }>;
        text?: string;
      }>;
    };
    const first = json.features?.[0];
    if (!first) return null;
    const city =
      first.context?.find((c) => c.id.startsWith('place'))?.text ??
      first.text ??
      null;
    return {
      lat,
      lng,
      label: first.place_name ?? null,
      city,
    };
  } catch (e) {
    console.warn('[QurTag] reverseGeocode', e);
    return null;
  }
}

interface MapboxAddressSuggestion {
  id: string;
  label: string;
  city: string | null;
  lat: number;
  lng: number;
}

/**
 * Address autocomplete for the courier flow.
 */
export async function searchAddresses(query: string): Promise<MapboxAddressSuggestion[]> {
  if (!TOKEN || query.trim().length < 3) return [];
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${TOKEN}&types=address&limit=5`,
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      features?: Array<{
        id: string;
        place_name: string;
        center?: [number, number];
        context?: Array<{ id: string; text: string }>;
      }>;
    };
    return (json.features ?? []).map((f) => ({
      id: f.id,
      label: f.place_name,
      city: f.context?.find((c) => c.id.startsWith('place'))?.text ?? null,
      lat: f.center?.[1] ?? 0,
      lng: f.center?.[0] ?? 0,
    }));
  } catch (e) {
    console.warn('[QurTag] searchAddresses', e);
    return [];
  }
}
