"use client";

import { cn } from "@/v2/lib/cn";
import React, { useEffect, useRef } from "react";

type AnimationType = "fadeIn" | "slideUp" | "slideDown" | "scaleUp" | "blurIn";
type ByType = "word" | "character" | "text" | "line";

interface TextAnimateProps {
  children: string;
  animation?: AnimationType;
  by?: ByType;
  className?: string;
  delay?: number;
  duration?: number;
  once?: boolean;
}

const animationClassMap: Record<AnimationType, string> = {
  fadeIn: "v2-text-anim--fade-in",
  slideUp: "v2-text-anim--slide-up",
  slideDown: "v2-text-anim--slide-down",
  scaleUp: "v2-text-anim--scale-up",
  blurIn: "v2-text-anim--blur-in",
};

function splitText(text: string, by: ByType): string[] {
  switch (by) {
    case "character":
      return text.split("");
    case "word":
      return text.split(/(\s+)/);
    case "line":
      return text.split("\n");
    case "text":
    default:
      return [text];
  }
}

export function TextAnimate({
  children,
  animation = "fadeIn",
  by = "word",
  className,
  delay = 0,
  duration = 0.5,
  once = true,
}: TextAnimateProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const animClass = animationClassMap[animation];
  const parts = splitText(children, by);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const spans = el.querySelectorAll<HTMLSpanElement>(".v2-text-anim__part");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            spans.forEach((span, i) => {
              span.style.animationDelay = `${delay + i * 0.06}s`;
              span.classList.add("v2-text-anim__part--visible");
            });
            if (once) observer.disconnect();
          } else if (!once) {
            spans.forEach((span) => {
              span.classList.remove("v2-text-anim__part--visible");
            });
          }
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, once]);

  return (
    <span
      ref={containerRef}
      className={cn("v2-text-anim", animClass, className)}
    >
      {parts.map((part, i) => (
        <span key={i} className="v2-text-anim__part" style={{ animationDuration: `${duration}s` }}>
          {part}
        </span>
      ))}
    </span>
  );
}
