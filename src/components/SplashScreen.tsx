"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SparklesCore } from "@/components/ui/sparkles";

/**
 * 全屏启动动画
 * 时间线：
 *   0ms      — 从黑色渐入 (0.7s)
 *   3200ms   — 开始退出：内容先上移淡出 (0.5s)，背景继续缓慢溶解 (1.6s)
 *   4800ms   — 组件完全卸载
 */
export function SplashScreen() {
  const [exiting, setExiting] = useState(false);
  const [gone, setGone]       = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 3200);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const t2 = setTimeout(() => setGone(true), 1700);
    return () => clearTimeout(t2);
  }, [exiting]);

  if (gone) return null;

  return (
    /* ── 整体遮罩：直接显示，退场缓慢溶解 ── */
    <motion.div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden bg-black"
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={
        exiting
          ? { duration: 1.6, ease: [0.4, 0, 0.2, 1] }
          : { duration: 0 }
      }
    >
      {/* ── 全屏稀疏粒子 ── */}
      <div className="absolute inset-0 w-full h-full">
        <SparklesCore
          id="splash-bg-sparkles"
          background="transparent"
          minSize={0.6}
          maxSize={1.4}
          particleDensity={80}
          className="w-full h-full"
          particleColor="#FFFFFF"
          speed={1}
        />
      </div>

      {/* ── 内容区：先于背景消失 ── */}
      <motion.div
        className="relative z-20 flex flex-col items-center"
        animate={exiting ? { opacity: 0, y: -24 } : { opacity: 1, y: 0 }}
        transition={
          exiting
            ? { duration: 0.45, ease: [0.4, 0, 1, 1] }
            : { duration: 0 }
        }
      >
        {/* ── 3D 悬浮标题 ── */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ perspective: "800px" }}
        >
          <h1
            className="text-5xl md:text-7xl lg:text-8xl font-bold text-center tracking-tight select-none"
            style={{
              transform: "perspective(800px) rotateX(8deg) translateZ(10px)",
              color: "#ffffff",
            }}
          >
            Vector Vision
          </h1>
        </motion.div>

        {/* ── 光晕底托 ── */}
        <div className="relative w-[30rem] h-28 -mt-2">
          <div className="absolute inset-x-16 top-0 h-[2px] w-3/4 bg-gradient-to-r from-transparent via-indigo-500 to-transparent blur-sm" />
          <div className="absolute inset-x-16 top-0 h-px   w-3/4 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
          <div className="absolute inset-x-44 top-0 h-[5px] w-1/4 bg-gradient-to-r from-transparent via-sky-400  to-transparent blur-sm" />
          <div className="absolute inset-x-44 top-0 h-px   w-1/4 bg-gradient-to-r from-transparent via-sky-400  to-transparent" />

          <SparklesCore
            background="transparent"
            minSize={0.4}
            maxSize={1}
            particleDensity={1200}
            className="w-full h-full"
            particleColor="#FFFFFF"
          />

          <div className="absolute inset-0 w-full h-full bg-black [mask-image:radial-gradient(350px_180px_at_top,transparent_20%,white)]" />
        </div>

        {/* ── 副标题（字母逐个淡入）── */}
        <motion.p
          className="mt-2 text-xs tracking-[0.45em] text-indigo-300/60 uppercase select-none"
          animate={exiting ? { opacity: 0 } : { opacity: 1 }}
          transition={exiting ? { duration: 0.3 } : { duration: 0 }}
        >
          3D Vector Database Visualization
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
