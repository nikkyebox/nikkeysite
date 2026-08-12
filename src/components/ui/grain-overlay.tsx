import React from "react";
import { cn } from "@/lib/utils";

/**
 * Overlay de grão de filme sutil, para sobrepor fundos escuros e evitar o
 * "flat" de gradientes puros. Puramente decorativo — aria-hidden, sem custo
 * de rede (SVG inline via CSS, não imagem).
 */
export const GrainOverlay: React.FC<{ className?: string; opacity?: number }> = ({
  className,
  opacity = 0.05,
}) => (
  <div
    aria-hidden
    className={cn("pointer-events-none absolute inset-0 z-[1] animate-grain motion-reduce:animate-none", className)}
    style={{
      opacity,
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      backgroundSize: "120px 120px",
    }}
  />
);
