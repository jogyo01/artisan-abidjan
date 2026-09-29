import type { GeoCoordinates } from "@/lib/geolocation";

/** Centre par défaut d'Abidjan (Plateau), sans GPS utilisateur. */
export const ABIDJAN_MAP_CENTER: GeoCoordinates = {
  latitude: 5.3599517,
  longitude: -4.0082563,
};

export const NEARBY_RADIUS_KM_OPTIONS = [5, 10, 20, 50] as const;

export type NearbyRadiusKm = (typeof NEARBY_RADIUS_KM_OPTIONS)[number];

export const DEFAULT_NEARBY_RADIUS_KM: NearbyRadiusKm = 10;

/**
 * Itinéraire externe sans clé API (Google Maps directions).
 * N'expose pas de coordonnées dans l'interface : uniquement dans l'URL ouverte.
 */
export function externalDirectionsUrl(
  destination: GeoCoordinates,
  origin?: GeoCoordinates,
): string {
  const destinationParam = `${destination.latitude},${destination.longitude}`;
  const params = new URLSearchParams({
    api: "1",
    destination: destinationParam,
  });

  if (origin) {
    params.set("origin", `${origin.latitude},${origin.longitude}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
