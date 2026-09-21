"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BookingParticipants = {
  id: string;
  client_id: string;
  artisan_id: string;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

const inputClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  }).format(date);
}

function messageErrorFromSupabase(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("row-level security") || normalized.includes("permission")) {
    return "Vous n'avez pas l'autorisation d'envoyer ce message.";
  }
  if (normalized.includes("jwt") || normalized.includes("not authenticated")) {
    return "Votre session a expiré. Veuillez vous reconnecter.";
  }

  return "Impossible d'envoyer le message. Veuillez réessayer.";
}

export default function BookingMessagesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bookingId = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingParticipants | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [notAllowed, setNotAllowed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadMessages = useCallback(
    async (currentBookingId: string) => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at")
        .eq("booking_id", currentBookingId)
        .order("created_at", { ascending: true });

      if (error) {
        return { messages: [] as ChatMessage[], error: true };
      }

      return {
        error: false,
        messages: (data ?? []).flatMap((row) => {
          if (typeof row.id !== "string" || typeof row.sender_id !== "string") {
            return [];
          }
          if (typeof row.content !== "string") {
            return [];
          }

          return [
            {
              id: row.id,
              sender_id: row.sender_id,
              content: row.content,
              created_at: String(row.created_at ?? ""),
            } satisfies ChatMessage,
          ];
        }),
      };
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      if (!bookingId) {
        await Promise.resolve();
        if (!cancelled) {
          setNotAllowed(true);
          setIsLoading(false);
        }
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (userError || !user) {
        router.replace("/auth");
        return;
      }

      const { data: bookingRow, error: bookingError } = await supabase
        .from("bookings")
        .select("id, client_id, artisan_id")
        .eq("id", bookingId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (bookingError) {
        setErrorMessage("Impossible de charger la conversation.");
        setIsLoading(false);
        return;
      }

      if (
        !bookingRow ||
        typeof bookingRow.id !== "string" ||
        typeof bookingRow.client_id !== "string" ||
        typeof bookingRow.artisan_id !== "string" ||
        (bookingRow.client_id !== user.id && bookingRow.artisan_id !== user.id)
      ) {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      const result = await loadMessages(bookingRow.id);
      if (cancelled) {
        return;
      }

      if (result.error) {
        setErrorMessage("Impossible de charger les messages.");
      }

      setUserId(user.id);
      setBooking({
        id: bookingRow.id,
        client_id: bookingRow.client_id,
        artisan_id: bookingRow.artisan_id,
      });
      setMessages(result.messages);
      setIsLoading(false);
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [bookingId, loadMessages, router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const trimmedContent = content.trim();
    if (trimmedContent === "") {
      setErrorMessage("Veuillez écrire un message.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    if (!booking || (booking.client_id !== user.id && booking.artisan_id !== user.id)) {
      setErrorMessage("Vous n'êtes pas autorisé à écrire dans cette conversation.");
      return;
    }

    const receiverId = booking.client_id === user.id ? booking.artisan_id : booking.client_id;

    setIsSending(true);

    try {
      const { error } = await supabase.from("messages").insert({
        booking_id: booking.id,
        sender_id: user.id,
        receiver_id: receiverId,
        content: trimmedContent,
      });

      if (error) {
        setErrorMessage(messageErrorFromSupabase(error.message));
        return;
      }

      setContent("");
      const result = await loadMessages(booking.id);
      if (result.error) {
        setErrorMessage("Le message a été envoyé, mais la conversation n'a pas pu être actualisée.");
      } else {
        setMessages(result.messages);
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSending(false);
    }
  }

  const backHref =
    userId && booking && userId === booking.artisan_id ? "/artisan/bookings" : "/bookings";

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement de la conversation…</p>
      </div>
    );
  }

  if (notAllowed || !booking || !userId) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Conversation introuvable
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Cette réservation n&apos;existe pas ou vous n&apos;y avez pas accès.
          </p>
          <Link
            href="/bookings"
            className="mt-6 inline-flex rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Retour au suivi
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Messages
          </h1>
          <Link
            href={backHref}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Retour au suivi
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Conversation liée à votre demande d&apos;intervention.
        </p>

        {errorMessage ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <section className="mt-6 flex min-h-72 flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Aucun message pour le moment.
            </p>
          ) : (
            messages.map((message) => {
              const isSent = message.sender_id === userId;
              return (
                <article
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    isSent
                      ? "self-end bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                      : "self-start border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p
                    className={`mt-1 text-xs ${
                      isSent ? "text-zinc-300 dark:text-zinc-500" : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {isSent ? "Envoyé" : "Reçu"} · {formatDateTime(message.created_at)}
                  </p>
                </article>
              );
            })
          )}
        </section>

        <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Votre message
            <textarea
              name="content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className={`${inputClassName} min-h-24`}
              placeholder="Écrire un message"
            />
          </label>
          <button
            type="submit"
            disabled={isSending}
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isSending ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      </main>
    </div>
  );
}
