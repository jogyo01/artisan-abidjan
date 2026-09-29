export type PriceType = "FIXED" | "STARTING_FROM" | "ON_QUOTE";

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  FIXED: "Prix fixe",
  STARTING_FROM: "À partir de",
  ON_QUOTE: "Sur devis",
};

export function isPriceType(value: string): value is PriceType {
  return value === "FIXED" || value === "STARTING_FROM" || value === "ON_QUOTE";
}

export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} XOF`;
}

export function formatServicePrice(service: {
  price: number | null;
  price_type: PriceType;
}): string {
  if (service.price_type === "ON_QUOTE") {
    if (service.price === null) {
      return "Sur devis";
    }
    return `Sur devis (${formatFcfa(service.price)})`;
  }

  if (service.price === null) {
    return PRICE_TYPE_LABELS[service.price_type];
  }

  if (service.price_type === "STARTING_FROM") {
    return `À partir de ${formatFcfa(service.price)}`;
  }

  return `Prix : ${formatFcfa(service.price)}`;
}
