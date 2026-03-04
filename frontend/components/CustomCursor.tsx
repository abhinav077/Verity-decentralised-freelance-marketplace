"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

export default function CustomCursor() {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [hovering, setHovering] = useState(false);

  const rawX = useMotionValue(-100);
  const rawY = useMotionValue(-100);

  // Outer ring — slow spring
  const outerX = useSpring(rawX, { stiffness: 100, damping: 20, mass: 0.5 });
  const outerY = useSpring(rawY, { stiffness: 100, damping: 20, mass: 0.5 });

  // Dot — tight spring
  const dotX = useSpring(rawX, { stiffness: 400, damping: 28 });
  const dotY = useSpring(rawY, { stiffness: 400, damping: 28 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      rawX.set(e.clientX);
      rawY.set(e.clientY);
      if (!visible) setVisible(true);
    };
    const down = () => setClicking(true);
    const up = () => setClicking(false);
    const enter = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      setHovering(
        !!(el.closest("a") || el.closest("button") || el.closest("[data-cursor-hover]"))
      );
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    window.addEventListener("mouseover", enter);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("mouseover", enter);
    };
  }, [rawX, rawY, visible]);

  // Only show on non-touch devices
  const isTouchRef = useRef(false);
  useEffect(() => {
    isTouchRef.current = window.matchMedia("(pointer: coarse)").matches;
  }, []);
  if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) return null;

  const accent = colors.pageFg;

  return (
    <>
      {/* Outer ring */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-full"
        style={{
          x: outerX,
          y: outerY,
          translateX: "-50%",
          translateY: "-50%",
          width: hovering ? 44 : 32,
          height: hovering ? 44 : 32,
          border: `1.5px solid ${accent}`,
          opacity: visible ? (hovering ? 0.6 : 0.35) : 0,
          transition: "width 0.2s ease, height 0.2s ease, opacity 0.3s ease",
          mixBlendMode: colors.colorScheme === "dark" ? "difference" : "normal",
        }}
      />
      {/* Center dot */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-full"
        style={{
          x: dotX,
          y: dotY,
          translateX: "-50%",
          translateY: "-50%",
          width: clicking ? 6 : 7,
          height: clicking ? 6 : 7,
          background: accent,
          opacity: visible ? 0.9 : 0,
          transition: "width 0.1s ease, height 0.1s ease, opacity 0.3s ease",
        }}
      />
    </>
  );
}
