import type { Metadata } from "next";
import { PublicLanding } from "@/components/public/PublicLanding";

export const metadata: Metadata = {
  title: "À propos — Artisan-Abidjan",
  description:
    "Artisan-Abidjan met en relation des particuliers et des artisans qualifiés près de chez vous à Abidjan.",
};

export default function AboutPage() {
  return <PublicLanding />;
}
