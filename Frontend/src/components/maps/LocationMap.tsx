"use client";

import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoCoordinates } from "@/lib/geolocation";

type LocationMapProps = {
  coordinates: GeoCoordinates;
  popupLabel: string;
  className?: string;
};

export default function LocationMap({
  coordinates,
  popupLabel,
  className,
}: LocationMapProps) {
  const icon = useMemo(
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

  return (
    <div className={className ?? "h-56 w-full overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)]"}>
      <MapContainer
        center={[coordinates.latitude, coordinates.longitude]}
        zoom={15}
        scrollWheelZoom={false}
        className="h-full w-full"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[coordinates.latitude, coordinates.longitude]} icon={icon}>
          <Popup>{popupLabel}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
