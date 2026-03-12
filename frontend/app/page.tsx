"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { getJobMarket, CONTRACT_ADDRESSES, NATIVE_SYMBOL } from "@/lib/contracts";
import CountUp from "@/components/reactbits/CountUp";
import ButtonCreativeRight from "@/components/reactbits/Button";
import GlassSurface from "@/components/reactbits/GlassSurface";
import { EncryptedText } from "@/components/reactbits/Encrypted-text";
import type { BentoCardData } from "@/components/reactbits/MagicBento";
import {
  BadgeCheck,
  Gavel,
  Lock,
  ScrollText,
  Trophy,
  Vote,
  Wallet,
} from "lucide-react";

/* Heavy canvas / GSAP components – lazy loaded */
const Grainient = dynamic(() => import("@/components/reactbits/FaultyTerminal"), { ssr: false });
const MagicBento = dynamic(() => import("@/components/reactbits/MagicBento"), { ssr: false });
const Shuffle = dynamic(() => import("@/components/reactbits/Shuffle"), { ssr: false });
const PixelCard = dynamic(() => import("@/components/reactbits/Pixelcard"), { ssr: false });

interface Stats { total: number; open: number; inProgress: number; completed: number }

const FEATURES: BentoCardData[] = [
  { icon: <Lock className="w-7 h-7" />, label: "Core", title: "No Middleman", description: "Smart contracts handle payments and escrow automatically. No platform fees, no delays." },
  { icon: <Wallet className="w-7 h-7" />, label: "Security", title: "Escrow Protection", description: "Funds are locked in escrow when a bid is accepted and released only on completion." },
  { icon: <Gavel className="w-7 h-7" />, label: "Disputes", title: "On-chain Disputes", description: "Community voting resolves disputes fairly with token-weighted votes and a 24-hour response window." },
  { icon: <BadgeCheck className="w-7 h-7" />, label: "Trust", title: "Verified Reviews", description: "On-chain reviews tied to real completed jobs — impossible to fake, permanent on the blockchain." },
  { icon: <Trophy className="w-7 h-7" />, label: "Quick Tasks", title: "Bounty Board", description: "Post open bounties for quick tasks. Multiple submissions, approve the best one." },
  { icon: <Vote className="w-7 h-7" />, label: "DAO", title: "Governance", description: "VRT holders propose and vote on platform changes. True decentralized decision-making." },
  { icon: <ScrollText className="w-7 h-7" />, label: "Delegation", title: "Sub-Contracting", description: "Freelancers can delegate parts of jobs to sub-contractors with on-chain accountability." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Post a Job", body: "Describe what you need, set a budget and deadline. The job goes live on-chain immediately." },
  { step: "02", title: "Accept a Bid", body: "Review freelancer bids and profiles, then accept. Payment is locked in escrow." },
  { step: "03", title: "Get Paid", body: "Client approves the work, escrow releases payment directly to the freelancer. No waiting." },
];

/* ── hex → "R, G, B" for MagicBento glowColor ── */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/* ── Animation variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const slideLeft = {
  hidden: { opacity: 0, x: -28 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

function AnimatedSection({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px 0px" });
  return (
    <motion.section ref={ref} initial="hidden" animate={inView ? "show" : "hidden"} variants={stagger} className={className} style={style}>
      {children}
    </motion.section>
  );
}

export default function Home() {
  const { address, connect, provider } = useWallet();
  const { colors, theme } = useTheme();
  const [stats, setStats] = useState<Stats>({ total: 0, open: 0, inProgress: 0, completed: 0 });
  const contractsConfigured = CONTRACT_ADDRESSES.JobMarket !== "";
  const glowRgb = useMemo(() => hexToRgb(colors.primaryFg), [colors.primaryFg]);
  const heroPalette = useMemo(() => {
    switch (theme) {
      case "light":
        return { color1: "#FFFFFF", color2: "#DDE7F2", color3: "#7A8FA6" };
      case "dark":
        return { color1: "#060606", color2: "#27272A", color3: "#6B7280" };
      case "midnight":
        return { color1: "#020617", color2: "#1E293B", color3: "#334155" };
      case "ocean":
        return { color1: "#0A2540", color2: "#164E78", color3: "#00B4D8" };
      case "sunset":
        return { color1: "#FFF1E5", color2: "#F4A261", color3: "#E76F51" };
      case "forest":
        return { color1: "#F1F8F2", color2: "#A5D6A7", color3: "#2E7D32" };
      case "rose":
        return { color1: "#FFF7FA", color2: "#F8BBD0", color3: "#E91E63" };
      case "pastel":
        return { color1: "#FEFCFF", color2: "#DDD6FE", color3: "#A5B4FC" };
      default:
        return { color1: colors.primaryLight, color2: colors.primary, color3: colors.surfaceBg };
    }
  }, [theme, colors.primaryLight, colors.primary, colors.surfaceBg]);
  const grainFx = useMemo(() => {
    if (theme === "light") {
      return { colorBalance: -0.08, blendAngle: 18, blendSoftness: 0.16, contrast: 1.35, saturation: 0.9 };
    }
    if (theme === "dark") {
      return { colorBalance: 0.12, blendAngle: -16, blendSoftness: 0.18, contrast: 1.8, saturation: 0.85 };
    }
    return { colorBalance: 0, blendAngle: 0, blendSoftness: 0.05, contrast: 1.5, saturation: 1 };
  }, [theme]);

  const loadStats = useCallback(async () => {
    if (!contractsConfigured || !provider) return;
    try {
      const jm = getJobMarket(provider);
      const count = Number(await jm.jobCounter());
      let open = 0, inProgress = 0, completed = 0;
      const batch = Math.min(count, 50);
      for (let i = count; i > count - batch && i > 0; i--) {
        try {
          const j = await jm.getJob(i);
          const s = Number(j.status);
          if (s === 0) open++;
          else if (s === 1) inProgress++;
          else if (s === 2) completed++;
        } catch {}
      }
      setStats({ total: count, open, inProgress, completed });
    } catch {}
  }, [provider, contractsConfigured]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadStats(); }, 0);
    return () => clearTimeout(timer);
  }, [loadStats]);

  return (
    <div className="min-h-screen -mt-24">

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${colors.pageBg} 0%, ${colors.cardBg} 100%)`, borderBottom: `1px solid ${colors.cardBorder}` }}
      >
        {/* Grainient background */}
        <div className="absolute inset-0 z-0">
          <Grainient
            color1={heroPalette.color1}
            color2={heroPalette.color2}
            color3={heroPalette.color3}
            timeSpeed={0.25}
            colorBalance={grainFx.colorBalance}
            warpStrength={1}
            warpFrequency={5}
            warpSpeed={2}
            warpAmplitude={50}
            blendAngle={grainFx.blendAngle}
            blendSoftness={grainFx.blendSoftness}
            rotationAmount={500}
            noiseScale={2}
            grainAmount={0.1}
            grainScale={2}
            grainAnimated={false}
            contrast={grainFx.contrast}
            gamma={1}
            saturation={grainFx.saturation}
            centerX={0}
            centerY={0}
            zoom={0.9}
          />
        </div>

        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[160px] pointer-events-none"
          style={{ background: colors.primaryFg, opacity: colors.colorScheme === "dark" ? 0.07 : 0.05 }} />

        {/* pointer-events-none so mouse events pass through to Grainient; interactive children restore pointer-events */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-36 md:pt-44 pb-28 md:pb-36 text-center pointer-events-none">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm mb-6 border"
            style={{ background: colors.surfaceBg, borderColor: colors.cardBorder, color: colors.mutedFg }}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Powered by Ethereum smart contracts
          </motion.div>

          <motion.h1 initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight tracking-tight"
            style={{ color: colors.pageFg, fontFamily: "var(--font-heading)" }}>
            The Future of Freelancing
            <br />
            is{" "}
            <span className="inline-grid align-top" style={{ color: colors.primaryFg }}>
              <span className="invisible col-start-1 row-start-1">Verity</span>
              <span className="col-start-1 row-start-1">
                <EncryptedText
                  text="Verity"
                  className="inline-block"
                  holdDelayMs={2200}
                  revealDelayMs={70}
                  flipDelayMs={70}
                  encryptedClassName="opacity-70"
                  revealedClassName=""
                />
              </span>
            </span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg sm:text-xl max-w-2xl mx-auto mb-10" style={{ color: colors.mutedFg }}>
            Hire talent or find work — no platform fees, no gatekeepers. Payments secured by smart-contract escrow, disputes resolved by community vote.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <GlassSurface
              isDark={colors.colorScheme === "dark"}
              width="auto"
              height="auto"
              borderRadius={24}
              className="pointer-events-auto transition-transform hover:scale-[1.02] active:scale-[0.98]"
              style={{ overflow: 'visible' }}
            >
              <Link href="/jobs"
                className="font-bold px-8 py-1.5 text-base inline-block text-center min-w-[200px]"
                style={{ color: colors.pageFg }}>
                Browse Jobs
              </Link>
            </GlassSurface>
            {address ? (
              <div className="pointer-events-auto">
                <ButtonCreativeRight
                  label="Post a Job"
                  bg={colors.primary}
                  fg={colors.primaryText}
                  hoverBg={colors.primaryHover}
                  hoverFg={colors.primaryText}
                  borderColor="transparent"
                  className="min-w-[200px] rounded-2xl"
                  onClick={() => window.location.href = "/jobs?tab=mine"}
                />
              </div>
            ) : (
              <div className="pointer-events-auto">
                <ButtonCreativeRight
                  label="Connect Wallet"
                  bg={colors.primary}
                  fg={colors.primaryText}
                  hoverBg={colors.primaryHover}
                  hoverFg={colors.primaryText}
                  borderColor="transparent"
                  className="min-w-[200px] rounded-2xl"
                  onClick={connect}
                />
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Live Stats with CountUp ── */}
      {contractsConfigured && (
        <AnimatedSection style={{ background: colors.cardBg, borderBottom: `1px solid ${colors.cardBorder}` }}>
          <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {[
                { label: "Total Jobs", value: stats.total, color: colors.pageFg },
                { label: "Open", value: stats.open, color: colors.primaryFg },
                { label: "In Progress", value: stats.inProgress, color: colors.warningText },
                { label: "Completed", value: stats.completed, color: colors.successText },
              ].map(({ label, value, color }) => (
                <motion.div key={label} variants={fadeUp} style={{ color }}>
                  <CountUp
                    to={value}
                    from={0}
                    duration={2}
                    separator=","
                    className="text-3xl font-black"
                    startWhen={value > 0}
                  />
                  <p className="text-sm mt-1" style={{ color: colors.mutedFg }}>{label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </AnimatedSection>
      )}

      {/* ── How It Works with PixelCard ── */}
      <AnimatedSection className="py-20" style={{ background: colors.surfaceBg }}>
        <div className="max-w-6xl mx-auto px-4">
          <motion.div variants={fadeUp} className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: colors.primaryFg, fontFamily: "var(--font-mono-alt)" }}>Simple Process</p>
            <Shuffle
              text="How It Works"
              tag="h2"
              className="text-3xl sm:text-4xl font-black mb-3"
              style={{ color: colors.pageFg, fontFamily: "var(--font-heading)" }}
              shuffleDirection="up"
              duration={0.4}
              shuffleTimes={2}
              stagger={0.04}
              triggerOnce={true}
              triggerOnHover={true}
              colorFrom={colors.muted}
              colorTo={colors.pageFg}
            />
            <p className="max-w-md mx-auto" style={{ color: colors.mutedFg }}>Three steps from job post to payment — all on-chain.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8 justify-items-center">
            {HOW_IT_WORKS.map(({ step, title, body }) => (
              <motion.div key={step} variants={slideLeft} className="flex justify-center w-full">
                <PixelCard
                  variant="default"
                  colors={`${colors.cardBorder},${colors.primaryLight},${colors.primaryFg}`}
                  gap={6}
                  speed={30}
                  borderColor={colors.cardBorder}
                  className="w-full h-[320px]"
                >
                  <div className="absolute inset-0 p-7 flex flex-col justify-between z-10">
                    <div>
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 font-black text-sm"
                        style={{ background: colors.primaryLight, color: colors.primaryFg }}>{step}</div>
                      <h3 className="font-bold text-lg mb-2" style={{ color: colors.pageFg, fontFamily: "var(--font-heading)" }}>{title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: colors.mutedFg }}>{body}</p>
                    </div>
                  </div>
                </PixelCard>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ── Features / Why Verity? with MagicBento ── */}
      <AnimatedSection className="py-20" style={{ background: colors.cardBg }}>
        <div className="max-w-6xl mx-auto px-4">
          <motion.div variants={fadeUp} className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: colors.primaryFg, fontFamily: "var(--font-mono-alt)" }}>Everything Included</p>
            <Shuffle
              text="Why Verity?"
              tag="h2"
              className="text-3xl sm:text-4xl font-black mb-3"
              style={{ color: colors.pageFg, fontFamily: "var(--font-heading)" }}
              shuffleDirection="right"
              duration={0.35}
              shuffleTimes={2}
              stagger={0.03}
              triggerOnce={true}
              triggerOnHover={true}
              colorFrom={colors.muted}
              colorTo={colors.pageFg}
            />
            <p style={{ color: colors.mutedFg }}>Everything traditional platforms offer — without the trust middleman.</p>
          </motion.div>
          {/* MagicBento feature cards */}
          <motion.div variants={fadeUp}>
            <MagicBento
              items={FEATURES}
              cardBg={colors.surfaceBg}
              cardTextColor={colors.pageFg}
              cardBorderColor={colors.cardBorder}
              glowColor={glowRgb}
              enableStars={true}
              enableSpotlight={true}
              enableBorderGlow={true}
              spotlightRadius={300}
              particleCount={10}
              enableTilt={false}
              clickEffect={true}
              enableMagnetism={true}
            />
          </motion.div>
        </div>
      </AnimatedSection>

      {/* ── Bottom CTA with ProfileCard ── */}
      <AnimatedSection className="py-20" style={{ background: colors.surfaceBg, borderTop: `1px solid ${colors.cardBorder}` }}>
        <div className="max-w-3xl mx-auto px-4 text-center">
          <motion.div variants={fadeUp}>
            <Shuffle
              text="Ready to get started?"
              tag="h2"
              className="text-3xl sm:text-4xl font-black mb-3"
              style={{ color: colors.pageFg, fontFamily: "var(--font-heading)" }}
              shuffleDirection="down"
              duration={0.4}
              shuffleTimes={1}
              stagger={0.03}
              triggerOnce={true}
              triggerOnHover={true}
              colorFrom={colors.muted}
              colorTo={colors.pageFg}
            />
            <p className="mb-9 text-lg" style={{ color: colors.mutedFg }}>Connect your wallet and join the decentralized freelance economy.</p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <GlassSurface
                isDark={colors.colorScheme === "dark"}
                width="auto"
                height="auto"
                borderRadius={24}
                className="transition-transform hover:scale-[1.02] active:scale-[0.98]"
                style={{ overflow: 'visible' }}
              >
                <Link href="/jobs"
                  className="font-bold px-8 py-1.5 text-base inline-block text-center min-w-[200px]"
                  style={{ color: colors.pageFg }}>
                  Find Jobs
                </Link>
              </GlassSurface>
              {address ? (
                <ButtonCreativeRight
                  label="Post a Job"
                  bg={colors.primary}
                  fg={colors.primaryText}
                  hoverBg={colors.primaryHover}
                  hoverFg={colors.primaryText}
                  borderColor="transparent"
                  className="min-w-[200px] rounded-2xl"
                  onClick={() => window.location.href = "/jobs?tab=mine"}
                />
              ) : (
                <ButtonCreativeRight
                  label="Connect Wallet"
                  bg={colors.primary}
                  fg={colors.primaryText}
                  hoverBg={colors.primaryHover}
                  hoverFg={colors.primaryText}
                  borderColor="transparent"
                  className="min-w-[200px] rounded-2xl"
                  onClick={connect}
                />
              )}
            </div>
          </motion.div>
        </div>
      </AnimatedSection>
    </div>
  );
}
