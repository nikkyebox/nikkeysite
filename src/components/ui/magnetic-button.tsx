import React, { useRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface MagneticButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  strength?: number;
}

/**
 * Botão que "puxa" levemente na direção do cursor ao passar perto (efeito magnético).
 * Desativado sob prefers-reduced-motion via useReducedMotion do framer-motion.
 */
export const MagneticButton = React.forwardRef<HTMLButtonElement, MagneticButtonProps>(
  ({ className, children, strength = 0.35, ...props }, forwardedRef) => {
    const ref = useRef<HTMLButtonElement>(null);
    const [offset, setOffset] = React.useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * strength;
      const y = (e.clientY - rect.top - rect.height / 2) * strength;
      setOffset({ x, y });
    };

    const handleMouseLeave = () => setOffset({ x: 0, y: 0 });

    return (
      <motion.button
        ref={(node) => {
          (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        animate={{ x: offset.x, y: offset.y }}
        transition={{ type: "spring", stiffness: 200, damping: 15, mass: 0.4 }}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full px-6 py-3 font-display font-medium tracking-tight transition-colors",
          className
        )}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

MagneticButton.displayName = "MagneticButton";
