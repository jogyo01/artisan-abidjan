import type { ReactNode } from "react";
import { PageTransition } from "@/components/motion";

export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
