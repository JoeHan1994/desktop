"use client";

import React, { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  opacityDelta: number;
}

interface SparklesCoreProps {
  id?: string;
  background?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  particleDensity?: number;
  className?: string;
  particleColor?: string;
}

export function SparklesCore({
  id,
  background = "transparent",
  minSize = 0.4,
  maxSize = 1,
  speed = 1,
  particleDensity = 100,
  className,
  particleColor = "#FFFFFF",
}: SparklesCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const dimsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function createParticle(w: number, h: number): Particle {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * speed * 0.4,
        vy: (Math.random() - 0.5) * speed * 0.4,
        size: minSize + Math.random() * (maxSize - minSize),
        opacity: Math.random(),
        opacityDelta:
          (Math.random() * 0.015 + 0.004) * speed * (Math.random() < 0.5 ? 1 : -1),
      };
    }

    function resize() {
      const w = canvas!.offsetWidth || canvas!.parentElement?.offsetWidth || window.innerWidth;
      const h = canvas!.offsetHeight || canvas!.parentElement?.offsetHeight || window.innerHeight;
      dimsRef.current = { width: w, height: h };
      canvas!.width = w;
      canvas!.height = h;
      const count = Math.max(10, Math.floor((w * h * particleDensity) / 100000));
      particlesRef.current = Array.from({ length: count }, () => createParticle(w, h));
    }

    function draw() {
      const { width, height } = dimsRef.current;
      if (!ctx || !canvas || width === 0 || height === 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      if (background !== "transparent") {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
      }

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.opacity += p.opacityDelta;

        if (p.opacity <= 0) {
          p.opacity = 0;
          p.opacityDelta = Math.abs(p.opacityDelta);
        } else if (p.opacity >= 1) {
          p.opacity = 1;
          p.opacityDelta = -Math.abs(p.opacityDelta);
        }

        if (p.x < -p.size) p.x = width + p.size;
        else if (p.x > width + p.size) p.x = -p.size;
        if (p.y < -p.size) p.y = height + p.size;
        else if (p.y > height + p.size) p.y = -p.size;

        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = particleColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [background, minSize, maxSize, speed, particleDensity, particleColor]);

  return (
    <canvas
      id={id}
      ref={canvasRef}
      className={className}
      style={{ display: "block" }}
    />
  );
}
