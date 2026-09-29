import type { GeoCoordinates } from "@/lib/geolocation";

export type MapArtisanPin = {
  id: string;
  business_name: string;
  city: string | null;
  categoryLabel: string | null;
  distanceKm: number | null;
  coordinates: GeoCoordinates;
};
