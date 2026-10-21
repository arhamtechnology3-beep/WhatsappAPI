"use client";

import { usePathname } from "next/navigation";
import { resolvePage } from "@/lib/nav/workspace-nav";

/**
 * One sentence under the header so a page explains itself before the
 * user has to guess which button matters. Hidden on the dashboard
 * (that page is the map) and on the flow canvas (it needs the height).
 */
export function PageGuide() {
  const pathname = usePathname();
  const page = resolvePage(pathname);

  if (page.hideGuide || !page.howTo) return null;

  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-border bg-muted/40 px-4 py-2 lg:px-6">
      <p className="text-sm leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">{page.label}. </span>
        {page.howTo}
      </p>
    </div>
  );
}
