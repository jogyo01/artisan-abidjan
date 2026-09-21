-- Artisan-Abidjan : artisans vérifiés dans un rayon (Haversine, sans PostGIS).
-- À exécuter dans l'éditeur SQL Supabase.
-- Ne retourne jamais un artisan non vérifié, même en SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.find_nearby_artisans(
  p_latitude numeric,
  p_longitude numeric,
  p_radius_km numeric DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  business_name text,
  description text,
  address text,
  city text,
  phone text,
  is_verified boolean,
  is_available boolean,
  latitude numeric,
  longitude numeric,
  distance_km numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_radius_km numeric;
  v_lat_delta numeric;
  v_lng_delta numeric;
BEGIN
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude < -90 OR p_latitude > 90
     OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'Coordonnées invalides';
  END IF;

  v_radius_km := COALESCE(p_radius_km, 10);

  IF v_radius_km <= 0 OR v_radius_km > 100 THEN
    RAISE EXCEPTION 'Rayon invalide';
  END IF;

  -- Préfiltre approximatif pour s'appuyer sur l'index (latitude, longitude).
  v_lat_delta := v_radius_km / 111.0;
  v_lng_delta := v_radius_km / (111.0 * GREATEST(COS(RADIANS(p_latitude::double precision)), 0.01));

  RETURN QUERY
  SELECT
    a.id,
    a.business_name::text,
    a.description::text,
    a.address::text,
    a.city::text,
    a.phone::text,
    a.is_verified,
    a.is_available,
    a.latitude,
    a.longitude,
    ROUND(
      (
        6371.0 * ACOS(
          LEAST(
            1.0,
            GREATEST(
              -1.0,
              COS(RADIANS(p_latitude::double precision))
                * COS(RADIANS(a.latitude::double precision))
                * COS(
                  RADIANS(a.longitude::double precision)
                  - RADIANS(p_longitude::double precision)
                )
              + SIN(RADIANS(p_latitude::double precision))
                * SIN(RADIANS(a.latitude::double precision))
            )
          )
        )
      )::numeric,
      3
    ) AS distance_km
  FROM public.artisans AS a
  WHERE a.is_verified IS TRUE
    AND a.latitude IS NOT NULL
    AND a.longitude IS NOT NULL
    AND a.latitude BETWEEN p_latitude - v_lat_delta AND p_latitude + v_lat_delta
    AND a.longitude BETWEEN p_longitude - v_lng_delta AND p_longitude + v_lng_delta
    AND (
      6371.0 * ACOS(
        LEAST(
          1.0,
          GREATEST(
            -1.0,
            COS(RADIANS(p_latitude::double precision))
              * COS(RADIANS(a.latitude::double precision))
              * COS(
                RADIANS(a.longitude::double precision)
                - RADIANS(p_longitude::double precision)
              )
            + SIN(RADIANS(p_latitude::double precision))
              * SIN(RADIANS(a.latitude::double precision))
          )
        )
      )
    ) <= v_radius_km::double precision
  ORDER BY distance_km ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.find_nearby_artisans(numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_nearby_artisans(numeric, numeric, numeric) TO anon, authenticated;

COMMENT ON FUNCTION public.find_nearby_artisans(numeric, numeric, numeric) IS
  'Artisans vérifiés géolocalisés dans un rayon (km), distance Haversine. Jamais d''artisan non vérifié.';
