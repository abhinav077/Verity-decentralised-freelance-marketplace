"use client";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { gsap } from "gsap";
import "./MagicBento.css";

/* ── Types ── */
export interface BentoCardData {
  title: string;
  description: string;
  label: string;
  icon?: React.ReactNode;
}

interface MagicBentoProps {
  items: BentoCardData[];
  cardBg?: string;
  cardTextColor?: string;
  cardBorderColor?: string;
  glowColor?: string;            // R, G, B e.g. "132, 0, 255"
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}

/* ── Helpers ── */
const MOBILE_BP = 768;

const createParticle = (x: number, y: number, color: string) => {
  const el = document.createElement("div");
  el.className = "particle";
  el.style.cssText = `position:absolute;width:4px;height:4px;border-radius:50%;background:rgba(${color},1);box-shadow:0 0 6px rgba(${color},0.6);pointer-events:none;z-index:100;left:${x}px;top:${y}px;`;
  return el;
};

const spotVals = (r: number) => ({ proximity: r * 0.5, fadeDistance: r * 0.75 });

const updateGlow = (card: HTMLElement, mx: number, my: number, glow: number, radius: number) => {
  const r = card.getBoundingClientRect();
  card.style.setProperty("--glow-x", `${((mx - r.left) / r.width) * 100}%`);
  card.style.setProperty("--glow-y", `${((my - r.top) / r.height) * 100}%`);
  card.style.setProperty("--glow-intensity", glow.toString());
  card.style.setProperty("--glow-radius", `${radius}px`);
};

/* ── ParticleCard ── */
const ParticleCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  particleCount: number;
  glowColor: string;
  enableTilt: boolean;
  clickEffect: boolean;
  enableMagnetism: boolean;
  disabled: boolean;
}> = ({ children, className = "", style, particleCount, glowColor, enableTilt, clickEffect, enableMagnetism, disabled }) => {
  const ref = useRef<HTMLDivElement>(null);
  const particles = useRef<HTMLDivElement[]>([]);
  const timeouts = useRef<number[]>([]);
  const hovered = useRef(false);
  const memo = useRef<HTMLDivElement[]>([]);
  const init = useRef(false);
  const magAnim = useRef<gsap.core.Tween | null>(null);

  const initP = useCallback(() => {
    if (init.current || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    memo.current = Array.from({ length: particleCount }, () => createParticle(Math.random() * width, Math.random() * height, glowColor));
    init.current = true;
  }, [particleCount, glowColor]);

  const clearP = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    magAnim.current?.kill();
    particles.current.forEach((p) => gsap.to(p, { scale: 0, opacity: 0, duration: 0.3, ease: "back.in(1.7)", onComplete: () => { p.parentNode?.removeChild(p); } }));
    particles.current = [];
  }, []);

  const animP = useCallback(() => {
    if (!ref.current || !hovered.current) return;
    if (!init.current) initP();
    memo.current.forEach((p, i) => {
      const tid = window.setTimeout(() => {
        if (!hovered.current || !ref.current) return;
        const cl = p.cloneNode(true) as HTMLDivElement;
        ref.current!.appendChild(cl);
        particles.current.push(cl);
        gsap.fromTo(cl, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" });
        gsap.to(cl, { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100, rotation: Math.random() * 360, duration: 2 + Math.random() * 2, ease: "none", repeat: -1, yoyo: true });
        gsap.to(cl, { opacity: 0.3, duration: 1.5, ease: "power2.inOut", repeat: -1, yoyo: true });
      }, i * 100);
      timeouts.current.push(tid);
    });
  }, [initP]);

  useEffect(() => {
    if (disabled || !ref.current) return;
    const el = ref.current;
    const enter = () => { hovered.current = true; animP(); if (enableTilt) gsap.to(el, { rotateX: 5, rotateY: 5, duration: 0.3, ease: "power2.out", transformPerspective: 1000 }); };
    const leave = () => { hovered.current = false; clearP(); if (enableTilt) gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.3, ease: "power2.out" }); if (enableMagnetism) gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: "power2.out" }); };
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top, cx = r.width / 2, cy = r.height / 2;
      if (enableTilt) gsap.to(el, { rotateX: ((y - cy) / cy) * -10, rotateY: ((x - cx) / cx) * 10, duration: 0.1, ease: "power2.out", transformPerspective: 1000 });
      if (enableMagnetism) magAnim.current = gsap.to(el, { x: (x - cx) * 0.05, y: (y - cy) * 0.05, duration: 0.3, ease: "power2.out" });
    };
    const click = (e: MouseEvent) => {
      if (!clickEffect) return;
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const md = Math.max(Math.hypot(x, y), Math.hypot(x - r.width, y), Math.hypot(x, y - r.height), Math.hypot(x - r.width, y - r.height));
      const rip = document.createElement("div");
      rip.style.cssText = `position:absolute;width:${md * 2}px;height:${md * 2}px;border-radius:50%;background:radial-gradient(circle,rgba(${glowColor},0.4) 0%,rgba(${glowColor},0.2) 30%,transparent 70%);left:${x - md}px;top:${y - md}px;pointer-events:none;z-index:1000;`;
      el.appendChild(rip);
      gsap.fromTo(rip, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: "power2.out", onComplete: () => rip.remove() });
    };
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    el.addEventListener("mousemove", move);
    el.addEventListener("click", click);
    return () => { hovered.current = false; el.removeEventListener("mouseenter", enter); el.removeEventListener("mouseleave", leave); el.removeEventListener("mousemove", move); el.removeEventListener("click", click); clearP(); };
  }, [animP, clearP, disabled, enableTilt, enableMagnetism, clickEffect, glowColor]);

  return (
    <div ref={ref} className={`${className} particle-container`} style={{ ...style, position: "relative", overflow: "hidden" }}>
      {children}
    </div>
  );
};

/* ── GlobalSpotlight ── */
const GlobalSpotlight: React.FC<{ gridRef: React.RefObject<HTMLDivElement | null>; disabled: boolean; radius: number; glowColor: string }> = ({ gridRef, disabled, radius, glowColor }) => {
  useEffect(() => {
    if (disabled || !gridRef?.current) return;
    const spot = document.createElement("div");
    spot.className = "global-spotlight";
    spot.style.cssText = `position:absolute;width:800px;height:800px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(${glowColor},0.15) 0%,rgba(${glowColor},0.08) 15%,rgba(${glowColor},0.04) 25%,rgba(${glowColor},0.02) 40%,rgba(${glowColor},0.01) 65%,transparent 70%);z-index:0;opacity:0;transform:translate(-50%,-50%);mix-blend-mode:screen;`;
    const container = gridRef.current;
    container.style.position = 'relative';
    container.appendChild(spot);

    const move = (e: MouseEvent) => {
      if (!gridRef.current) return;
      const section = gridRef.current.closest(".bento-section");
      const sRect = section?.getBoundingClientRect();
      const inside = sRect && e.clientX >= sRect.left && e.clientX <= sRect.right && e.clientY >= sRect.top && e.clientY <= sRect.bottom;
      const cards = gridRef.current.querySelectorAll<HTMLElement>(".bento-card");
      if (!inside) {
        gsap.to(spot, { opacity: 0, duration: 0.3, ease: "power2.out" });
        cards.forEach((c) => c.style.setProperty("--glow-intensity", "0"));
        return;
      }
      const { proximity, fadeDistance } = spotVals(radius);
      let minD = Infinity;
      cards.forEach((c) => {
        const cr = c.getBoundingClientRect();
        const d = Math.max(0, Math.hypot(e.clientX - (cr.left + cr.width / 2), e.clientY - (cr.top + cr.height / 2)) - Math.max(cr.width, cr.height) / 2);
        minD = Math.min(minD, d);
        const g = d <= proximity ? 1 : d <= fadeDistance ? (fadeDistance - d) / (fadeDistance - proximity) : 0;
        updateGlow(c, e.clientX, e.clientY, g, radius);
      });
      // Position relative to the container
      const cRect = container.getBoundingClientRect();
      gsap.to(spot, { left: e.clientX - cRect.left, top: e.clientY - cRect.top, duration: 0.1, ease: "power2.out" });
      const op = minD <= proximity ? 0.8 : minD <= fadeDistance ? ((fadeDistance - minD) / (fadeDistance - proximity)) * 0.8 : 0;
      gsap.to(spot, { opacity: op, duration: op > 0 ? 0.2 : 0.5, ease: "power2.out" });
    };
    const leave = () => {
      gridRef.current?.querySelectorAll<HTMLElement>(".bento-card").forEach((c) => c.style.setProperty("--glow-intensity", "0"));
      gsap.to(spot, { opacity: 0, duration: 0.3, ease: "power2.out" });
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseleave", leave);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseleave", leave); spot.parentNode?.removeChild(spot); };
  }, [gridRef, disabled, radius, glowColor]);
  return null;
};

/* ── MagicBento ── */
const MagicBento: React.FC<MagicBentoProps> = ({
  items,
  cardBg = "#060010",
  cardTextColor = "#ffffff",
  cardBorderColor = "#392e4e",
  glowColor = "132, 0, 255",
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  spotlightRadius = 300,
  particleCount = 12,
  enableTilt = false,
  clickEffect = true,
  enableMagnetism = true,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { const c = () => setIsMobile(window.innerWidth <= MOBILE_BP); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);
  const disabled = isMobile;

  return (
    <>
      {enableSpotlight && <GlobalSpotlight gridRef={gridRef} disabled={disabled} radius={spotlightRadius} glowColor={glowColor} />}
      <div className="bento-grid bento-section" ref={gridRef}>
        {items.map((card, i) => {
          const cls = `bento-card ${enableBorderGlow ? "bento-card--glow bento-card--text-autohide" : "bento-card--text-autohide"}`;
          const st: React.CSSProperties = { backgroundColor: cardBg, color: cardTextColor, borderColor: cardBorderColor, "--glow-color": glowColor } as React.CSSProperties;
          const inner = (
            <>
              <div className="bento-card__header">
                <div className="bento-card__label">{card.label}</div>
                {card.icon && <div>{card.icon}</div>}
              </div>
              <div className="bento-card__content">
                <h2 className="bento-card__title">{card.title}</h2>
                <p className="bento-card__description">{card.description}</p>
              </div>
            </>
          );
          if (enableStars) {
            return (
              <ParticleCard key={i} className={cls} style={st} particleCount={particleCount} glowColor={glowColor} enableTilt={enableTilt} clickEffect={clickEffect} enableMagnetism={enableMagnetism} disabled={disabled}>
                {inner}
              </ParticleCard>
            );
          }
          return <div key={i} className={cls} style={st}>{inner}</div>;
        })}
      </div>
    </>
  );
};

export default MagicBento;
