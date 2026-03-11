"use client";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useTheme } from "@/context/ThemeContext";
import { Heart } from "lucide-react";

const Grainient = dynamic(() => import("./reactbits/GradientFooter"), { ssr: false });

const NAV_GROUPS = [
  {
    title: "Marketplace",
    links: [
      { href: "/jobs", label: "Find Jobs" },
      { href: "/bounties", label: "Bounties" },
      { href: "/sub-contracts", label: "Sub-Contracts" },
    ],
  },
  {
    title: "Platform",
    links: [
      { href: "/disputes", label: "Disputes" },
      { href: "/governance", label: "Governance" },
      { href: "/crowdfunding", label: "Crowdfunding" },
    ],
  },
];

export default function Footer() {
  const { colors } = useTheme();
  const dk = colors.colorScheme === "dark";

  return (
    <footer className="border-t mt-auto relative overflow-hidden" style={{ borderColor: colors.navBorder }}>
      {/* Grainient background */}
      <div className="absolute inset-0 z-0 opacity-40">
        <Grainient
          color1={colors.primary}
          color2={colors.primaryFg}
          color3={colors.pageBg}
          timeSpeed={0.3}
          grainAmount={0.04}
          contrast={1.1}
          className="w-full h-full"
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand card - compact, matching other column widths */}
          <div className="col-span-2 md:col-span-1">
            <div
              className="rounded-2xl p-4 border transition-transform hover:scale-[1.02]"
              style={{
                background: dk
                  ? `linear-gradient(145deg, ${colors.cardBg}, ${colors.surfaceBg})`
                  : `linear-gradient(145deg, ${colors.cardBg}, ${colors.surfaceBg})`,
                borderColor: colors.cardBorder,
                boxShadow: dk
                  ? `0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px ${colors.cardBorder}`
                  : `0 4px 24px rgba(0,0,0,0.06), 0 0 0 1px ${colors.cardBorder}`,
              }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <Image src="/logo.svg" alt="Verity" width={32} height={32} className="w-8 h-8 shrink-0" />
                <span
                  className="font-black text-lg leading-none tracking-tight"
                  style={{ color: colors.primaryFg, fontFamily: "var(--font-heading)" }}
                >
                  Verity
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: colors.mutedFg }}>
                Decentralised freelance marketplace powered by Ethereum smart contracts.
              </p>
            </div>
          </div>

          {/* Nav groups */}
          {NAV_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: colors.muted, fontFamily: "var(--font-mono-alt)" }}>
                {g.title}
              </p>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm transition-colors hover:underline underline-offset-2"
                      style={{ color: colors.mutedFg }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-6 border-t text-xs"
          style={{ borderColor: colors.divider, color: colors.muted }}
        >
          <p>&copy; {new Date().getFullYear()} Verity. Open-source, on-chain, unstoppable.</p>
          <p>Built with <Heart size={14} className="inline text-red-500" /> on Ethereum</p>
        </div>
      </div>
    </footer>
  );
}
