"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { areValidCoordinates, type GeoCoordinates } from "@/lib/geolocation";
import { ABIDJAN_MAP_CENTER } from "@/lib/maps";
import type { MapArtisanPin } from "@/components/maps/map-types";

type ArtisansMapProps = {
  artisans: MapArtisanPin[];
  userPosition?: GeoCoordinates | null;
  radiusKm?: number | null;
  className?: string;
};

function formatDistanceKm(distanceKm: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(distanceKm)} km`;
}

function FitView({
  artisans,
  userPosition,
}: {
  artisans: MapArtisanPin[];
  userPosition?: GeoCoordinates | null;
}) {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = artisans
      .filter((artisan) =>
        areValidCoordinates(artisan.coordinates.latitude, artisan.coordinates.longitude),
      )
      .map((artisan) => [artisan.coordinates.latitude, artisan.coordinates.longitude]);

    if (userPosition && areValidCoordinates(userPosition.latitude, userPosition.longitude)) {
      points.push([userPosition.latitude, userPosition.longitude]);
    }

    if (points.length === 0) {
      map.setView([ABIDJAN_MAP_CENTER.latitude, ABIDJAN_MAP_CENTER.longitude], 12);
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
  }, [artisans, map, userPosition]);

  return null;
}

export default function ArtisansMap({
  artisans,
  userPosition = null,
  radiusKm = null,
  className,
}: ArtisansMapProps) {
  const artisanIcon = useMemo(
    () =>
      L.divIcon({
        className: "aa-map-pin",
        html: '<span style="display:block;height:16px;width:16px;border-radius:9999px;border:2px solid #fff;background:#18181b;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
      }),
    [],
  );

  const userIcon = useMemo(
    () =>
      L.divIcon({
        className: "aa-map-pin",
        html: '<span style="display:block;height:16px;width:16px;border-radius:9999px;border:2px solid #fff;background:#2563eb;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
      }),
    [],
  );

  const pins = artisans.filter((artisan) =>
    areValidCoordinates(artisan.coordinates.latitude, artisan.coordinates.longitude),
  );

  const userLatLng =
    userPosition && areValidCoordinates(userPosition.latitude, userPosition.longitude)
      ? ([userPosition.latitude, userPosition.longitude] as [number, number])
      : null;

  return (
    <div className={className ?? "h-72 w-full overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] lg:h-[28rem]"}>
      <MapContainer
        center={[ABIDJAN_MAP_CENTER.latitude, ABIDJAN_MAP_CENTER.longitude]}
        zoom={12}
        scrollWheelZoom
        className="h-full w-full"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitView artisans={pins} userPosition={userLatLng && userPosition ? userPosition : null} />
        {userLatLng && radiusKm && radiusKm > 0 ? (
          <Circle
            center={userLatLng}
            radius={radiusKm * 1000}
            pathOptions={{ color: "#1a5c5a", weight: 1, fillOpacity: 0.06 }}
          />
        ) : null}
        {userLatLng && userPosition ? (
          <Marker position={userLatLng} icon={userIcon}>
            <Popup>Votre position</Popup>
          </Marker>
        ) : null}
        {pins.map((artisan) => (
          <Marker
            key={artisan.id}
            position={[artisan.coordinates.latitude, artisan.coordinates.longitude]}
            icon={artisanIcon}
          >
            <Popup>
              <div className="min-w-40 text-sm">
                <p className="font-semibold text-zinc-950">{artisan.business_name}</p>
                <p className="mt-1 text-zinc-700">{artisan.city || "Ville non renseignée"}</p>
                {artisan.categoryLabel ? (
                  <p className="mt-1 text-zinc-600">{artisan.categoryLabel}</p>
                ) : null}
                {artisan.distanceKm !== null ? (
                  <p className="mt-1 text-zinc-600">{formatDistanceKm(artisan.distanceKm)}</p>
                ) : null}
                <Link
                  href={`/artisans/${artisan.id}`}
                  className="mt-2 inline-flex font-medium text-zinc-950 underline"
                >
                  Voir le profil
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
