"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { ArtisanPageHeader } from "@/components/artisan/ArtisanPageHeader";
import {
  AnimatedList,
  AnimatedListItem,
  AnimatedModal,
  MotionAlert,
  PageSkeleton,
} from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import { motionDuration, motionEase, slideUp } from "@/lib/motion/tokens";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { loadArtisanSession } from "@/lib/artisan/session";
import { tradeMediaByName } from "@/lib/motion/media";
import {
  categoryIdToString,
  mapCategoryRow,
  toCategoryWriteValue,
  type ArtisanCategory,
} from "@/lib/artisan/categories";
import {
  formatServicePrice,
  isPriceType,
  PRICE_TYPE_LABELS,
  type PriceType,
} from "@/lib/artisan/service-price";

type Service = {
  id: string;
  artisan_id: string;
  name: string;
  description: string | null;
  price: number | null;
  price_type: PriceType;
  created_at: string;
  category_id: string | null;
};

type Editor =
  | { kind: "create"; categoryId: string }
  | { kind: "edit"; serviceId: string }
  | null;

const inputClassName = "aa-input";
const SERVICES_VISUAL = tradeMediaByName("Menuisier");

function parsePriceInput(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }
  return parsed;
}

export default function ArtisanServicesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [artisanId, setArtisanId] = useState("");
  const [trades, setTrades] = useState<ArtisanCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [pendingDelete, setPendingDelete] = useState<Service | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<PriceType>("FIXED");
  const [formCategoryId, setFormCategoryId] = useState("");

  const ownedTradeIds = useMemo(() => new Set(trades.map((trade) => trade.id)), [trades]);

  const mapServiceRows = useCallback((rows: Record<string, unknown>[]): Service[] => {
    return rows.flatMap((row) => {
      const id = bookingIdToString(row.id);
      const artisanRowId =
        typeof row.artisan_id === "string" ? row.artisan_id : bookingIdToString(row.artisan_id);
      if (!id || !artisanRowId) {
        return [];
      }
      const priceTypeValue = String(row.price_type);
      if (typeof row.name !== "string" || !isPriceType(priceTypeValue)) {
        return [];
      }

      return [
        {
          id,
          artisan_id: artisanRowId,
          name: row.name,
          description: typeof row.description === "string" ? row.description : null,
          price: typeof row.price === "number" ? row.price : null,
          price_type: priceTypeValue,
          created_at: String(row.created_at),
          category_id: categoryIdToString(row.category_id),
        } satisfies Service,
      ];
    });
  }, []);

  const loadServices = useCallback(
    async (currentArtisanId: string) => {
      const { data, error } = await supabase
        .from("services")
        .select("id, artisan_id, name, description, price, price_type, created_at, category_id")
        .eq("artisan_id", currentArtisanId)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage("Impossible de charger les services.");
        return;
      }

      setServices(mapServiceRows((data ?? []) as Record<string, unknown>[]));
    },
    [mapServiceRows, supabase],
  );

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      const session = await loadArtisanSession(supabase);

      if (!isMounted) {
        return;
      }

      if (session.kind === "unauthenticated") {
        router.replace("/auth");
        return;
      }
      if (session.kind === "forbidden") {
        router.replace("/");
        return;
      }
      if (session.kind === "needs_onboarding") {
        router.replace("/artisan/onboarding");
        return;
      }

      const [{ data: linkRows, error: linkError }, { data: categoryRows, error: categoryError }] =
        await Promise.all([
          supabase.from("artisan_categories").select("category_id").eq("artisan_id", session.userId),
          supabase.from("categories").select("id, name").order("name"),
        ]);

      if (linkError || categoryError) {
        if (isMounted) {
          setErrorMessage("Impossible de charger vos métiers.");
          setIsLoading(false);
        }
        return;
      }

      const catalog = (categoryRows ?? []).flatMap((row) => {
        const mapped = mapCategoryRow(row);
        return mapped ? [mapped] : [];
      });
      const linkedIds = new Set(
        (linkRows ?? []).flatMap((row) => {
          const id = categoryIdToString(row.category_id);
          return id ? [id] : [];
        }),
      );

      if (isMounted) {
        setArtisanId(session.userId);
        setTrades(catalog.filter((category) => linkedIds.has(category.id)));
      }

      await loadServices(session.userId);
      if (isMounted) {
        setIsLoading(false);
      }
    }

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [loadServices, router, supabase]);

  function resetForm() {
    setName("");
    setDescription("");
    setPrice("");
    setPriceType("FIXED");
    setFormCategoryId("");
  }

  function openCreate(categoryId: string) {
    if (!ownedTradeIds.has(categoryId)) {
      setErrorMessage("Ce métier n'appartient pas à votre profil.");
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    resetForm();
    setFormCategoryId(categoryId);
    setEditor({ kind: "create", categoryId });
  }

  function openEdit(service: Service) {
    setErrorMessage("");
    setSuccessMessage("");
    setName(service.name);
    setDescription(service.description ?? "");
    setPriceType(service.price_type);
    setPrice(service.price_type === "ON_QUOTE" || service.price === null ? "" : String(service.price));
    setFormCategoryId(service.category_id && ownedTradeIds.has(service.category_id) ? service.category_id : "");
    setEditor({ kind: "edit", serviceId: service.id });
  }

  function closeEditor() {
    resetForm();
    setEditor(null);
  }

  function resolvePrice(nextType: PriceType, rawPrice: string): { ok: true; value: number | null } | { ok: false } {
    if (nextType === "ON_QUOTE") {
      return { ok: true, value: null };
    }
    const parsed = parsePriceInput(rawPrice);
    if (parsed === null || Number.isNaN(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!artisanId || !editor) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setErrorMessage("Veuillez renseigner le nom du service.");
      return;
    }

    const selectedCategoryId = editor.kind === "create" ? editor.categoryId : formCategoryId;
    if (!selectedCategoryId || !ownedTradeIds.has(selectedCategoryId)) {
      setErrorMessage("Sélectionnez un métier que vous possédez.");
      return;
    }

    const priced = resolvePrice(priceType, price);
    if (!priced.ok) {
      setErrorMessage("Veuillez renseigner un prix en XOF.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        artisan_id: artisanId,
        name: trimmedName,
        description: trimmedDescription === "" ? null : trimmedDescription,
        price: priced.value,
        price_type: priceType,
        category_id: toCategoryWriteValue(selectedCategoryId),
      };

      const result =
        editor.kind === "create"
          ? await supabase.from("services").insert(payload)
          : await supabase
              .from("services")
              .update({
                name: payload.name,
                description: payload.description,
                price: payload.price,
                price_type: payload.price_type,
                category_id: payload.category_id,
              })
              .eq("id", editor.serviceId)
              .eq("artisan_id", artisanId);

      if (result.error) {
        if (result.error.message.toLowerCase().includes("category_id must belong")) {
          setErrorMessage("Ce métier n'est plus associé à votre profil. Ajoutez-le d'abord dans Profil.");
          return;
        }
        setErrorMessage(
          editor.kind === "create"
            ? "Impossible d'ajouter le service. Veuillez réessayer."
            : "Impossible d'enregistrer les modifications.",
        );
        return;
      }

      closeEditor();
      setSuccessMessage(editor.kind === "create" ? "Service ajouté." : "Service modifié.");
      await loadServices(artisanId);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(service: Service) {
    setPendingDelete(null);
    setErrorMessage("");
    setSuccessMessage("");

    if (!artisanId) {
      return;
    }

    setDeletingId(service.id);

    try {
      const { error } = await supabase
        .from("services")
        .delete()
        .eq("id", service.id)
        .eq("artisan_id", artisanId);

      if (error) {
        setErrorMessage(
          "Impossible de supprimer ce service. S'il est lié à une demande, il doit rester dans l'historique.",
        );
        return;
      }

      if (editor?.kind === "edit" && editor.serviceId === service.id) {
        closeEditor();
      }
      setSuccessMessage("Service supprimé.");
      await loadServices(artisanId);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des services…" />
      </div>
    );
  }

  const priceRequired = priceType !== "ON_QUOTE";
  const uncategorized = services.filter(
    (service) => !service.category_id || !ownedTradeIds.has(service.category_id),
  );

  function renderForm() {
    if (!editor) {
      return null;
    }

    const isEdit = editor.kind === "edit";

    return (
      <m.form
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--aa-sand)_35%,transparent)] p-4"
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={slideUp}
        transition={{ duration: motionDuration.base, ease: motionEase }}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
          Métier
          <select
            value={editor.kind === "create" ? editor.categoryId : formCategoryId}
            onChange={(event) => {
              const nextId = event.target.value;
              if (editor.kind === "create") {
                if (ownedTradeIds.has(nextId)) {
                  setEditor({ kind: "create", categoryId: nextId });
                  setFormCategoryId(nextId);
                }
                return;
              }
              setFormCategoryId(nextId);
            }}
            className={inputClassName}
          >
            {isEdit ? <option value="">Choisir un métier</option> : null}
            {trades.map((trade) => (
              <option key={trade.id} value={trade.id}>
                {trade.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
          Nom du service
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClassName}
            placeholder="Ex. Vidange"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
          Description <span className="font-normal text-[var(--aa-ink-soft)]">(facultative)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`${inputClassName} min-h-20`}
            placeholder="Décrivez la prestation"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
          Type de prix
          <select
            value={priceType}
            onChange={(event) => {
              const nextType = event.target.value;
              if (isPriceType(nextType)) {
                setPriceType(nextType);
                if (nextType === "ON_QUOTE") {
                  setPrice("");
                }
              }
            }}
            className={inputClassName}
          >
            <option value="FIXED">{PRICE_TYPE_LABELS.FIXED}</option>
            <option value="STARTING_FROM">{PRICE_TYPE_LABELS.STARTING_FROM}</option>
            <option value="ON_QUOTE">{PRICE_TYPE_LABELS.ON_QUOTE}</option>
          </select>
        </label>
        {priceRequired ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Prix (XOF, obligatoire)
            <input
              type="text"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={inputClassName}
              placeholder="Ex. 15000"
            />
          </label>
        ) : (
          <p className="text-sm text-[var(--aa-ink-soft)]">Sur devis : aucun prix n&apos;est enregistré.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={isSaving} className="aa-btn aa-btn-primary">
            {isSaving ? "Enregistrement…" : isEdit ? "Enregistrer les modifications" : "Enregistrer le service"}
          </button>
          <button type="button" className="aa-btn aa-btn-ghost" onClick={closeEditor}>
            Annuler
          </button>
        </div>
      </m.form>
    );
  }

  function renderServiceList(items: Service[]) {
    if (items.length === 0) {
      return <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">Aucun service dans cette section.</p>;
    }

    return (
      <AnimatedList className="mt-3 flex flex-col gap-2">
        {items.map((service, index) => {
          const isEditing = editor?.kind === "edit" && editor.serviceId === service.id;
          return (
            <AnimatedListItem
              key={service.id}
              index={index}
              className="rounded-xl border border-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] bg-[var(--aa-card)] p-4 aa-card-hover"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-[var(--aa-ink)]">{service.name}</p>
                  {service.description ? (
                    <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">{service.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-[var(--aa-ink-soft)]">
                    {PRICE_TYPE_LABELS[service.price_type]}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--aa-ink)]">{formatServicePrice(service)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="aa-btn aa-btn-ghost"
                    onClick={() => openEdit(service)}
                    disabled={isSaving}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDelete(service);
                    }}
                    disabled={deletingId === service.id}
                    className="rounded-full border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                  >
                    {deletingId === service.id ? "Suppression…" : "Supprimer"}
                  </button>
                </div>
              </div>
              <AnimatePresence>{isEditing ? renderForm() : null}</AnimatePresence>
            </AnimatedListItem>
          );
        })}
      </AnimatedList>
    );
  }

  return (
    <div className="aa-page" data-page="artisan-services">
      <div className="w-full max-w-2xl">
        <ArtisanPageHeader
          kicker="Prestations"
          title="Mes services"
          subtitle="Catalogue de vos prestations et tarifs, regroupés par métier. L'identité de l'atelier se gère dans Mon profil."
          imageSrc={SERVICES_VISUAL?.image ?? "/images/a-propos/metier-menuisier.jpg"}
          imageAlt={SERVICES_VISUAL?.alt ?? "Atelier et prestations artisanales"}
        />

        <main className="flex flex-col gap-4">
          <div className="flex flex-wrap justify-between gap-2">
            <Link href="/artisan/profile" className="aa-btn aa-btn-ghost">
              Mon profil
            </Link>
            <Link href="/artisan" className="aa-btn aa-btn-ghost">
              Tableau de bord
            </Link>
          </div>

          {trades.length === 0 ? (
            <section className="aa-card p-6">
              <p className="text-sm text-[var(--aa-ink-soft)]">
                Ajoutez d&apos;abord un métier dans votre{" "}
                <Link href="/artisan/profile#metiers" className="font-medium text-[var(--aa-terracotta)]">
                  profil professionnel
                </Link>
                , puis revenez ici pour publier des prestations.
              </p>
            </section>
          ) : null}

          {errorMessage ? <MotionAlert tone="error" message={errorMessage} /> : null}
          {successMessage ? <MotionAlert tone="success" message={successMessage} /> : null}

          {trades.map((trade, index) => {
            const items = services.filter((service) => service.category_id === trade.id);
            const createOpen = editor?.kind === "create" && editor.categoryId === trade.id;

            return (
              <m.section
                key={trade.id}
                className="aa-card p-5 sm:p-6"
                initial="hidden"
                animate="visible"
                variants={slideUp}
                transition={{
                  duration: motionDuration.base,
                  ease: motionEase,
                  delay: Math.min(index, 8) * 0.04,
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--aa-terracotta)]">
                      Métier
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--aa-ink)]">{trade.name}</h2>
                  </div>
                  <button
                    type="button"
                    className="aa-btn aa-btn-primary"
                    onClick={() => openCreate(trade.id)}
                  >
                    + Ajouter un service
                  </button>
                </div>
                <AnimatePresence>{createOpen ? renderForm() : null}</AnimatePresence>
                {renderServiceList(items)}
              </m.section>
            );
          })}

          {uncategorized.length > 0 ? (
            <m.section
              className="aa-card p-5 sm:p-6"
              initial="hidden"
              animate="visible"
              variants={slideUp}
              transition={{ duration: motionDuration.base, ease: motionEase }}
            >
              <h2 className="text-lg font-semibold text-[var(--aa-ink)]">À classer</h2>
              <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
                Prestations sans métier actuel. Modifiez-les pour les rattacher à un métier.
              </p>
              {renderServiceList(uncategorized)}
            </m.section>
          ) : null}
        </main>
      </div>

      <AnimatedModal
        open={pendingDelete !== null}
        title="Supprimer ce service ?"
        onClose={() => setPendingDelete(null)}
      >
        <p className="text-sm leading-6 text-[var(--aa-ink-soft)]">
          {pendingDelete
            ? `Supprimer définitivement le service « ${pendingDelete.name} » ? Cette action ne peut pas être annulée.`
            : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="aa-btn aa-btn-primary"
            onClick={() => {
              if (pendingDelete) {
                void handleDelete(pendingDelete);
              }
            }}
          >
            Confirmer la suppression
          </button>
          <button type="button" className="aa-btn aa-btn-ghost" onClick={() => setPendingDelete(null)}>
            Annuler
          </button>
        </div>
      </AnimatedModal>
    </div>
  );
}
