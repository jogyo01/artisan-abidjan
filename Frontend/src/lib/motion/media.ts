/**
 * Catalogue visuel unique.
 * Pour activer le hero vidéo : placer un fichier réel dans `public/videos/`
 * (ex. `hero-artisan.mp4`, courte, compressée, sans watermark) puis renseigner
 * `HERO_MEDIA.videoSrc`. Ne jamais pointer vers un fichier inexistant.
 */
export const HERO_MEDIA = {
  imageSrc: "/images/a-propos/hero-abidjan.jpg",
  imageAlt: "Artisan devant son atelier, palmiers et skyline d’Abidjan en arrière-plan",
  videoSrc: undefined as string | undefined,
};

export const CITY_MEDIA = {
  lagune: {
    src: "/images/a-propos/abidjan-lagune.jpg",
    alt: "Lagune Ébrié, ponts et skyline d’Abidjan au soleil couchant",
  },
  workshop: {
    src: "/images/a-propos/mission-savoir-faire.jpg",
    alt: "Client et artisan en discussion dans un atelier de menuiserie",
  },
} as const;

export const TRADE_MEDIA = [
  {
    name: "Mécanicien",
    image: "/images/a-propos/metier-mecanicien.jpg",
    alt: "Mécanicien au travail sous le capot, dans une cour d’atelier",
    span: "lg:col-span-2",
  },
  {
    name: "Électricien",
    image: "/images/a-propos/metier-electricien.jpg",
    alt: "Électricien en intervention sur une installation",
    span: "",
  },
  {
    name: "Plombier",
    image: "/images/a-propos/metier-plombier.jpg",
    alt: "Plombier en réparation, geste de terrain",
    span: "",
  },
  {
    name: "Couturier",
    image: "/images/a-propos/metier-couturier.jpg",
    alt: "Couturier à la machine, tissus wax dans l’atelier",
    span: "lg:col-span-2",
  },
  {
    name: "Cordonnier",
    image: "/images/a-propos/metier-cordonnier.jpg",
    alt: "Cordonnier au établi, réparation de chaussures",
    span: "",
  },
  {
    name: "Menuisier",
    image: "/images/a-propos/metier-menuisier.jpg",
    alt: "Menuisier rabotant une pièce de bois dans son atelier",
    span: "lg:row-span-2",
  },
  {
    name: "Peintre",
    image: "/images/a-propos/metier-peintre.jpg",
    alt: "Peintre en bâtiment au travail",
    span: "",
  },
  {
    name: "Climatisation",
    image: "/images/a-propos/metier-climatisation.jpg",
    alt: "Technicien climatisation en intervention",
    span: "lg:col-span-2",
  },
] as const;

export type TradeMedia = (typeof TRADE_MEDIA)[number];

export const STORY_BEATS = [
  { label: "Un artisan", image: HERO_MEDIA.imageSrc, alt: HERO_MEDIA.imageAlt },
  { label: "Son savoir-faire", image: "/images/a-propos/metier-menuisier.jpg", alt: "Savoir-faire de menuiserie" },
  { label: "Sa localisation", image: CITY_MEDIA.lagune.src, alt: CITY_MEDIA.lagune.alt },
  { label: "Un client", image: CITY_MEDIA.workshop.src, alt: CITY_MEDIA.workshop.alt },
  { label: "Une demande", image: "/images/a-propos/metier-electricien.jpg", alt: "Demande d’intervention chez un professionnel" },
  { label: "Une intervention", image: "/images/a-propos/metier-mecanicien.jpg", alt: "Intervention en cours dans l’atelier" },
  { label: "Un travail terminé", image: "/images/a-propos/metier-couturier.jpg", alt: "Pièce achevée dans l’atelier" },
  { label: "Un avis", image: CITY_MEDIA.workshop.src, alt: "Échange après la prestation" },
] as const;

export const STEP_MEDIA = [
  {
    n: "01",
    title: "Trouvez un artisan",
    text: "Parcourez les profils vérifiés près de chez vous, selon le métier et le quartier.",
    image: CITY_MEDIA.lagune.src,
    imageAlt: CITY_MEDIA.lagune.alt,
  },
  {
    n: "02",
    title: "Envoyez une demande",
    text: "Décrivez le lieu, le besoin et le moment. L’artisan reçoit le contexte utile.",
    image: CITY_MEDIA.workshop.src,
    imageAlt: CITY_MEDIA.workshop.alt,
  },
  {
    n: "03",
    title: "Recevez l’intervention",
    text: "Échangez, suivez l’avancement, et laissez le professionnel faire le travail.",
    image: "/images/a-propos/metier-mecanicien.jpg",
    imageAlt: "Artisan en intervention concrète",
  },
  {
    n: "04",
    title: "Évaluez le travail",
    text: "Après la prestation, laissez un avis : la confiance se construit sur des faits.",
    image: "/images/a-propos/metier-couturier.jpg",
    imageAlt: "Finition soignée dans un atelier de couture",
  },
] as const;

const TRADE_NEEDLES: { needle: string; name: TradeMedia["name"] }[] = [
  { needle: "electric", name: "Électricien" },
  { needle: "plomb", name: "Plombier" },
  { needle: "menuis", name: "Menuisier" },
  { needle: "coutur", name: "Couturier" },
  { needle: "mecan", name: "Mécanicien" },
  { needle: "peint", name: "Peintre" },
  { needle: "cordonn", name: "Cordonnier" },
  { needle: "climat", name: "Climatisation" },
];

function foldTradeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function tradeMediaByName(name: string): TradeMedia | undefined {
  const folded = foldTradeKey(name);
  if (!folded) {
    return undefined;
  }

  const exact = TRADE_MEDIA.find((trade) => foldTradeKey(trade.name) === folded);
  if (exact) {
    return exact;
  }

  const contains = TRADE_MEDIA.find((trade) => {
    const key = foldTradeKey(trade.name);
    return folded.includes(key) || key.includes(folded);
  });
  if (contains) {
    return contains;
  }

  const alias = TRADE_NEEDLES.find((entry) => folded.includes(entry.needle));
  return alias ? TRADE_MEDIA.find((trade) => trade.name === alias.name) : undefined;
}

export function tradeImageByName(name: string): string | undefined {
  return tradeMediaByName(name)?.image;
}

export function coverImageForTrades(names: string[]): string {
  for (const name of names) {
    const image = tradeImageByName(name);
    if (image) {
      return image;
    }
  }
  return CITY_MEDIA.workshop.src;
}

export function tradeGalleryForNames(names: string[]): { name: string; image: string; alt: string }[] {
  const seen = new Set<string>();
  const items: { name: string; image: string; alt: string }[] = [];

  for (const name of names) {
    const media = tradeMediaByName(name);
    if (!media || seen.has(media.image)) {
      continue;
    }
    seen.add(media.image);
    items.push({ name: media.name, image: media.image, alt: media.alt });
  }

  if (!seen.has(CITY_MEDIA.workshop.src)) {
    items.push({
      name: "Atelier",
      image: CITY_MEDIA.workshop.src,
      alt: CITY_MEDIA.workshop.alt,
    });
  }

  return items.slice(0, 4);
}
