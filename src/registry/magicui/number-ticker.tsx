"use client";

import { cn } from "@/v2/lib/cn";
import { useEffect, useRef } from "react";

interface NumberTickerProps {
  value: number;
  start?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  decimalPlaces?: number;
  className?: string;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function NumberTicker({
  value,
  start = 0,
  direction = "up",
  delay = 0,
  duration = 2,
  decimalPlaces = 0,
  className,
}: NumberTickerProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    const from = direction === "down" ? value : start;
    const to = direction === "down" ? start : value;

    let startTime: number | null = null;
    const durationMs = duration * 1000;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();

        const delayTimeout = setTimeout(() => {
          const tick = (now: number) => {
            if (startTime === null) startTime = now;
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
            const eased = easeOutExpo(progress);
            const current = from + (to - from) * eased;
            el.textContent = current.toFixed(decimalPlaces);
            if (progress < 1) {
              rafRef.current = requestAnimationFrame(tick);
            }
          };
          rafRef.current = requestAnimationFrame(tick);
        }, delay * 1000);

        return () => clearTimeout(delayTimeout);
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, start, direction, delay, duration, decimalPlaces]);

  return (
    <span
      ref={spanRef}
      className={cn("v2-number-ticker", className)}
    >
      {start.toFixed(decimalPlaces)}
    </span>
  );
}
