export type GeoCoordinates = {
  latitude: number;
  longitude: number;
};

const GEO_TIMEOUT_MS = 15_000;

function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as GeolocationPositionError).code === "number"
  );
}

export function geolocationErrorMessage(error: unknown): string {
  if (isGeolocationPositionError(error)) {
    if (error.code === error.PERMISSION_DENIED) {
      return "Vous avez refusé l'accès à votre position. La recherche classique reste disponible.";
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return "Votre position est actuellement indisponible.";
    }
    if (error.code === error.TIMEOUT) {
      return "La récupération de votre position a pris trop de temps.";
    }
  }

  if (error instanceof Error && error.message === "GEOLOCATION_UNSUPPORTED") {
    return "Votre navigateur ne prend pas en charge la géolocalisation.";
  }

  if (error instanceof Error && error.message === "GEOLOCATION_INVALID") {
    return "La position obtenue n'est pas valide.";
  }

  return "Impossible de récupérer votre position. Veuillez réessayer.";
}

export function isGeolocationPermissionDenied(error: unknown): boolean {
  return isGeolocationPositionError(error) && error.code === error.PERMISSION_DENIED;
}

export function areValidCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function formatCoordinates(coords: GeoCoordinates): string {
  const format = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 5,
    maximumFractionDigits: 6,
  });

  return `${format.format(coords.latitude)}, ${format.format(coords.longitude)}`;
}

export function haversineDistanceKm(from: GeoCoordinates, to: GeoCoordinates): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function formatDistanceFromYou(distanceKm: number): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(distanceKm);

  return `À environ ${formatted} km de vous`;
}

export function getBrowserCoordinates(): Promise<GeoCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNSUPPORTED"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        if (!areValidCoordinates(latitude, longitude)) {
          reject(new Error("GEOLOCATION_INVALID"));
          return;
        }

        resolve({ latitude, longitude });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 0,
      },
    );
  });
}
