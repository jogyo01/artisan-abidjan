"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { mapMessageRow, mergeMessageById, type ChatMessage } from "@/lib/messages/map";
import { m } from "motion/react";
import { EmptyState, MotionAlert, PageSkeleton, SlideUp } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";

type BookingConversation = {
  id: string;
  client_id: string;
  artisan_id: string;
};

const inputClassName = "aa-input";

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
  const [booking, setBooking] = useState<BookingConversation | null>(null);
  const [otherName, setOtherName] = useState("Participant");
  const [serviceName, setServiceName] = useState("Service");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);
  const [notAllowed, setNotAllowed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const listEndRef = useRef<HTMLDivElement | null>(null);

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
          const mapped = mapMessageRow(row as Record<string, unknown>);
          return mapped ? [mapped] : [];
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
        .select("id, client_id, artisan_id, service_id")
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

      const parsedBookingId = bookingIdToString(bookingRow?.id);
      if (
        !bookingRow ||
        !parsedBookingId ||
        typeof bookingRow.client_id !== "string" ||
        typeof bookingRow.artisan_id !== "string" ||
        (bookingRow.client_id !== user.id && bookingRow.artisan_id !== user.id)
      ) {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      const otherId = bookingRow.client_id === user.id ? bookingRow.artisan_id : bookingRow.client_id;
      const isArtisanViewer = bookingRow.artisan_id === user.id;
      const serviceId = bookingIdToString(bookingRow.service_id);

      const numericBookingId = Number(parsedBookingId);
      const [result, artisanResult, clientNameResult, serviceResult] = await Promise.all([
        loadMessages(parsedBookingId),
        isArtisanViewer
          ? Promise.resolve({ data: null })
          : supabase.from("artisans").select("business_name").eq("id", otherId).maybeSingle(),
        isArtisanViewer && Number.isSafeInteger(numericBookingId)
          ? supabase.rpc("booking_client_display_name", { p_booking_id: numericBookingId })
          : Promise.resolve({ data: null }),
        serviceId
          ? supabase.from("services").select("name").eq("id", serviceId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) {
        return;
      }

      if (result.error) {
        setErrorMessage("Impossible de charger les messages.");
      }

      let resolvedOtherName = "Participant";
      if (isArtisanViewer) {
        const fullName = clientNameResult.data;
        resolvedOtherName =
          typeof fullName === "string" && fullName.trim() !== "" ? fullName : "Client";
      } else {
        const businessName =
          artisanResult.data && "business_name" in artisanResult.data
            ? artisanResult.data.business_name
            : null;
        resolvedOtherName =
          typeof businessName === "string" && businessName.trim() !== "" ? businessName : "Artisan";
      }

      const serviceLabel =
        serviceResult.data && "name" in serviceResult.data ? serviceResult.data.name : null;

      setUserId(user.id);
      setBooking({
        id: parsedBookingId,
        client_id: bookingRow.client_id,
        artisan_id: bookingRow.artisan_id,
      });
      setOtherName(resolvedOtherName);
      setServiceName(
        typeof serviceLabel === "string" && serviceLabel.trim() !== "" ? serviceLabel : "Service",
      );
      setMessages(result.messages);
      setIsLoading(false);
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [bookingId, loadMessages, router, supabase]);

  useEffect(() => {
    if (!booking || !userId) {
      return;
    }

    const channel = supabase
      .channel(`messages:booking:${booking.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `booking_id=eq.${booking.id}`,
        },
        (payload) => {
          const mapped = mapMessageRow((payload.new ?? {}) as Record<string, unknown>);
          if (!mapped) {
            return;
          }
          setMessages((current) => mergeMessageById(current, mapped));
        },
      )
      .subscribe((status) => {
        setIsRealtime(status === "SUBSCRIBED");
      });

    return () => {
      setIsRealtime(false);
      void supabase.removeChannel(channel);
    };
  }, [booking, supabase, userId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
      const { data, error } = await supabase
        .from("messages")
        .insert({
          booking_id: booking.id,
          sender_id: user.id,
          receiver_id: receiverId,
          content: trimmedContent,
        })
        .select("id, sender_id, content, created_at")
        .maybeSingle();

      if (error) {
        setErrorMessage(messageErrorFromSupabase(error.message));
        return;
      }

      setContent("");

      const mapped = data ? mapMessageRow(data as Record<string, unknown>) : null;
      if (mapped) {
        setMessages((current) => mergeMessageById(current, mapped));
        return;
      }

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
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement de la conversation…" />
      </div>
    );
  }

  if (notAllowed || !booking || !userId) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">
            Conversation introuvable
          </h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Cette demande n&apos;existe pas ou vous n&apos;y avez pas accès.
          </p>
          <Link
            href="/bookings"
            className="aa-btn aa-btn-ghost mt-6"
          >
            Retour au suivi
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="flex w-full max-w-2xl flex-col aa-card p-4 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
              Conversation
            </h1>
            <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
              {otherName} · {serviceName} · demande {booking.id}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--aa-ink-soft)]">
              {isRealtime
                ? "Messages en temps réel"
                : "Mode classique : les messages s'affichent à l'envoi."}
            </p>
          </div>
          <Link
            href={backHref}
            className="aa-btn aa-btn-ghost"
          >
            Retour au suivi
          </Link>
        </div>

        {errorMessage ? <MotionAlert tone="error" message={errorMessage} className="mt-4" /> : null}

        <section className="mt-6 flex min-h-80 flex-1 flex-col gap-3 overflow-y-auto aa-inset">
          {messages.length === 0 ? (
            <EmptyState title="Aucun message pour le moment">
              <p className="text-sm">Écrivez le premier message ci-dessous.</p>
            </EmptyState>
          ) : (
            messages.map((message, index) => {
              const isSent = message.sender_id === userId;
              const recent = index >= messages.length - 6;
              const previous = index > 0 ? messages[index - 1] : null;
              const grouped = previous?.sender_id === message.sender_id;
              return (
                <m.article
                  key={message.id}
                  initial={recent ? { opacity: 0, y: grouped ? 4 : 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    grouped ? "mt-1" : ""
                  } ${
                    isSent
                      ? "self-end bg-[var(--aa-terracotta)] text-white"
                      : "self-start border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] bg-[var(--aa-card)] text-[var(--aa-ink)]"
                  }`}
                >
                  {grouped ? null : (
                    <p className="text-xs font-medium opacity-70">{isSent ? "Vous" : otherName}</p>
                  )}
                  <p className={grouped ? "whitespace-pre-wrap" : "mt-1 whitespace-pre-wrap"}>{message.content}</p>
                  <p
                    className={`mt-1 text-xs ${
                      isSent ? "text-white/80" : "text-[var(--aa-ink-soft)]"
                    }`}
                  >
                    {formatDateTime(message.created_at)}
                  </p>
                </m.article>
              );
            })
          )}
          <div ref={listEndRef} />
        </section>

        <SlideUp>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Votre message
            <textarea
              name="content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className={`${inputClassName} min-h-20`}
              placeholder="Écrire un message"
              disabled={isSending}
            />
          </label>
          <button
            type="submit"
            disabled={isSending || content.trim() === ""}
            className={`aa-btn aa-btn-primary min-h-11 disabled:cursor-not-allowed disabled:opacity-60 sm:mb-0.5 ${
              isSending ? "aa-btn-loading" : ""
            }`}
          >
            {isSending ? "Envoi…" : "Envoyer"}
          </button>
        </form>
        </SlideUp>
      </main>
    </div>
  );
}
