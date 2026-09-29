import { bookingIdToString } from "@/lib/bookings/artisan";

export type ArtisanCategory = {
  id: string;
  name: string;
};

export function categoryIdToString(value: unknown): string | null {
  return bookingIdToString(value);
}

export function toCategoryWriteValue(id: string): string | number {
  if (/^\d+$/.test(id)) {
    return Number(id);
  }
  return id;
}

export function mapCategoryRow(row: unknown): ArtisanCategory | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;
  const id = categoryIdToString(record.id);
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!id || name === "") {
    return null;
  }

  return { id, name };
}
