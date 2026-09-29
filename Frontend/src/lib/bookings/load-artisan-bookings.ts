import type { createClient } from "@/lib/supabase/client";
import { bookingIdToString, isBookingStatus, type BookingStatus } from "@/lib/bookings/artisan";
import { isPriceType, latestUsableQuote, mapQuote, type PriceType, type QuoteView } from "@/lib/payments/types";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export type ArtisanBooking = {
  id: string;
  client_name: string;
  service_name: string;
  service_id: string | null;
  price_type: PriceType | null;
  description: string;
  address: string;
  scheduled_at: string;
  status: BookingStatus;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  quote: QuoteView | null;
};

function parseCoord(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayNameFromProfile(fullName: unknown): string | null {
  if (typeof fullName !== "string") {
    return null;
  }
  const trimmed = fullName.trim();
  return trimmed === "" ? null : trimmed;
}

export async function loadArtisanBookings(
  supabase: BrowserSupabaseClient,
  artisanId: string,
): Promise<{ bookings: ArtisanBooking[]; error: boolean }> {
  const { data: bookingRows, error: bookingsError } = await supabase
    .from("bookings")
    .select(
      "id, client_id, artisan_id, service_id, status, address, description, scheduled_at, created_at, latitude, longitude",
    )
    .eq("artisan_id", artisanId)
    .order("created_at", { ascending: false });

  if (bookingsError) {
    return { bookings: [], error: true };
  }

  const ownRows = (bookingRows ?? []).filter((row) => row.artisan_id === artisanId);

  const clientIds = [
    ...new Set(ownRows.flatMap((row) => (typeof row.client_id === "string" ? [row.client_id] : []))),
  ];
  const serviceIds = [
    ...new Set(
      ownRows.flatMap((row) => {
        const id = bookingIdToString(row.service_id);
        return id ? [id] : [];
      }),
    ),
  ];
  const bookingIds = ownRows.flatMap((row) => {
    const id = bookingIdToString(row.id);
    return id ? [id] : [];
  });

  const clientNames = new Map<string, string>();
  const serviceNames = new Map<string, string>();
  const servicePriceTypes = new Map<string, PriceType>();
  const paymentByBookingId = new Map<string, { amount: number; currency: string }>();
  const quoteByBookingId = new Map<string, QuoteView>();

  if (clientIds.length > 0) {
    const { data: nameRows } = await supabase.rpc("artisan_client_display_names");

    for (const row of nameRows ?? []) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const record = row as { client_id?: unknown; full_name?: unknown };
      const profileId =
        typeof record.client_id === "string" ? record.client_id : bookingIdToString(record.client_id);
      const name = displayNameFromProfile(record.full_name);
      if (profileId && name && clientIds.includes(profileId)) {
        clientNames.set(profileId, name);
      }
    }
  }

  if (serviceIds.length > 0) {
    const { data: serviceRows } = await supabase
      .from("services")
      .select("id, name, price_type")
      .in("id", serviceIds);

    for (const row of serviceRows ?? []) {
      const id = bookingIdToString(row.id);
      if (id && typeof row.name === "string") {
        serviceNames.set(id, row.name);
      }
      if (id && typeof row.price_type === "string" && isPriceType(row.price_type)) {
        servicePriceTypes.set(id, row.price_type);
      }
    }
  }

  if (bookingIds.length > 0) {
    const { data: quoteRows } = await supabase
      .from("booking_quotes")
      .select("id, booking_id, amount, currency, status, description, created_at")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false });

    const grouped = new Map<string, QuoteView[]>();
    for (const row of quoteRows ?? []) {
      const mapped = mapQuote(row as Record<string, unknown>);
      if (!mapped) {
        continue;
      }
      const current = grouped.get(mapped.booking_id) ?? [];
      current.push(mapped);
      grouped.set(mapped.booking_id, current);
    }
    for (const [id, quotes] of grouped) {
      const usable = latestUsableQuote(quotes);
      if (usable) {
        quoteByBookingId.set(id, usable);
      }
    }

    const { data: paymentRows } = await supabase
      .from("payments")
      .select("booking_id, amount, currency, status")
      .in("booking_id", bookingIds)
      .in("status", ["PENDING", "PAID"]);

    for (const paymentRow of paymentRows ?? []) {
      const id = bookingIdToString(paymentRow.booking_id);
      if (!id) {
        continue;
      }
      const amount =
        typeof paymentRow.amount === "number" ? paymentRow.amount : Number(paymentRow.amount);
      if (!Number.isFinite(amount)) {
        continue;
      }
      paymentByBookingId.set(id, {
        amount,
        currency: typeof paymentRow.currency === "string" ? paymentRow.currency : "XOF",
      });
    }
  }

  return {
    error: false,
    bookings: ownRows.flatMap((row) => {
      const id = bookingIdToString(row.id);
      if (!id || typeof row.status !== "string" || !isBookingStatus(row.status)) {
        return [];
      }

      const serviceId = bookingIdToString(row.service_id);
      const payment = paymentByBookingId.get(id);

      return [
        {
          id,
          client_name:
            typeof row.client_id === "string" ? (clientNames.get(row.client_id) ?? "Client") : "Client",
          service_name: serviceId ? (serviceNames.get(serviceId) ?? "Service") : "Service",
          service_id: serviceId,
          price_type: serviceId ? (servicePriceTypes.get(serviceId) ?? null) : null,
          description: typeof row.description === "string" ? row.description : "",
          address: typeof row.address === "string" ? row.address : "",
          scheduled_at: String(row.scheduled_at ?? ""),
          status: row.status,
          created_at: String(row.created_at ?? ""),
          latitude: parseCoord(row.latitude),
          longitude: parseCoord(row.longitude),
          paymentAmount: payment?.amount ?? null,
          paymentCurrency: payment?.currency ?? null,
          quote: quoteByBookingId.get(id) ?? null,
        } satisfies ArtisanBooking,
      ];
    }),
  };
}
