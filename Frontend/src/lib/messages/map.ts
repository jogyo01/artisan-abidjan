import { bookingIdToString } from "@/lib/bookings/artisan";

export type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export function mapMessageRow(row: Record<string, unknown>): ChatMessage | null {
  const id = bookingIdToString(row.id);
  if (!id || typeof row.sender_id !== "string" || typeof row.content !== "string") {
    return null;
  }

  return {
    id,
    sender_id: row.sender_id,
    content: row.content,
    created_at: String(row.created_at ?? ""),
  };
}

export function mergeMessageById(current: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (current.some((message) => message.id === incoming.id)) {
    return current;
  }

  const next = [...current, incoming];
  next.sort((left, right) => left.created_at.localeCompare(right.created_at));
  return next;
}
