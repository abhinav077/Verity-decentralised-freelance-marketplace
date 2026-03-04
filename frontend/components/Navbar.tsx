"use client";
import { useWallet } from "@/context/WalletContext";
import { useNotifications, NotifType } from "@/context/NotificationsContext";
import { useTheme, THEME_NAMES, THEME_META } from "@/context/ThemeContext";
import { shortenAddress, getVRTToken, chatKey, chatReadKey } from "@/lib/contracts";
import { useEffect, useCallback, useState, useRef } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from 'next/image';
import GlassSurface from './reactbits/GlassSurface';

function WalletAvatar({ address, size = 26 }: { address: string; size?: number }) {
  const color = "#" + address.slice(2, 8);
  return (
    <div
      style={{ width: size, height: size, background: color, borderRadius: "50%", flexShrink: 0 }}
      className="flex items-center justify-center"
    >
      <span style={{ fontSize: size * 0.38, color: "white", fontWeight: 700, lineHeight: 1 }}>
        {address.slice(2, 4).toUpperCase()}
      </span>
    </div>
  );
}

const NOTIF_ICONS: Record<NotifType, string> = {
  bid: "🔨",
  dispute: "⚖️",
  chat: "💬",
  review: "⭐",
};

export default function Navbar() {
  const { address, provider, chainId, connect, disconnect, connecting } = useWallet();
  const { notifications, totalCount, dismiss, refresh } = useNotifications();
  const { theme, colors, setTheme } = useTheme();
  const router = useRouter();
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [dfmBalance, setDfmBalance] = useState<string | null>(null);
  const pathname = usePathname();
  const [findWorkOpen, setFindWorkOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const findWorkRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const closeAll = useCallback(() => {
    setFindWorkOpen(false); setOtherOpen(false); setProfileOpen(false);
    setBellOpen(false); setThemeOpen(false); setMobileOpen(false);
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!address || !provider) { setEthBalance(null); setDfmBalance(null); return; }
    provider.getBalance(address).then((b: bigint) =>
      setEthBalance(parseFloat(ethers.formatEther(b)).toFixed(3))
    ).catch(() => setEthBalance(null));
    getVRTToken(provider).balanceOf(address).then((b: bigint) =>
      setDfmBalance(parseFloat(ethers.formatEther(b)).toFixed(1))
    ).catch(() => setDfmBalance(null));
  }, [address, provider]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);
  useEffect(() => {
    if (!provider) return;
    provider.on("block", fetchBalances);
    return () => { provider.off("block", fetchBalances); };
  }, [provider, fetchBalances]);
  useEffect(() => {
    window.addEventListener("dfm:tx", fetchBalances);
    return () => window.removeEventListener("dfm:tx", fetchBalances);
  }, [fetchBalances]);

  // Close all dropdowns on route change
  useEffect(() => { closeAll(); }, [pathname, closeAll]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!findWorkOpen && !otherOpen && !profileOpen && !bellOpen && !themeOpen && !mobileOpen) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (findWorkRef.current && !findWorkRef.current.contains(t)) setFindWorkOpen(false);
      if (otherRef.current && !otherRef.current.contains(t)) setOtherOpen(false);
      if (profileRef.current && !profileRef.current.contains(t)) setProfileOpen(false);
      if (bellRef.current && !bellRef.current.contains(t)) setBellOpen(false);
      if (themeRef.current && !themeRef.current.contains(t)) setThemeOpen(false);
      if (mobileRef.current && !mobileRef.current.contains(t)) setMobileOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [findWorkOpen, otherOpen, profileOpen, bellOpen, themeOpen, mobileOpen]);

  const wrongNetwork = chainId !== null && chainId !== 31337 && chainId !== 11155111;
  const dk = colors.colorScheme === "dark";

  /* Shared island height for visual consistency */
  const islandStyle: React.CSSProperties = { overflow: 'visible', minHeight: 44 };

  /* liquid glass island style */
  const liquidGlass: React.CSSProperties = {
    backdropFilter: "blur(24px) saturate(1.8) brightness(1.05)",
    WebkitBackdropFilter: "blur(24px) saturate(1.8) brightness(1.05)",
    background: dk
      ? "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%)"
      : "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.72) 100%)",
    border: `1px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)"}`,
    borderRadius: 18,
    boxShadow: dk
      ? "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.03)"
      : "0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(255,255,255,0.4)",
  };

  /* dropdown panel style – stronger glass for readability */
  const dropdown: React.CSSProperties = {
    backdropFilter: "blur(40px) saturate(2.2) brightness(1.1)",
    WebkitBackdropFilter: "blur(40px) saturate(2.2) brightness(1.1)",
    background: dk
      ? "linear-gradient(160deg, rgba(20,20,28,0.92) 0%, rgba(14,14,20,0.88) 100%)"
      : "linear-gradient(160deg, rgba(255,255,255,0.95) 0%, rgba(248,248,252,0.92) 100%)",
    border: `1px solid ${dk ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
    borderRadius: 16,
    boxShadow: dk
      ? "0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)"
      : "0 12px 40px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.95)",
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 pointer-events-none" style={{ fontFamily: "var(--font-mono-alt), var(--font-geist-mono), monospace" }}>
      <div className="max-w-7xl mx-auto px-4 pt-3 flex items-center justify-between gap-2.5">

        {/* Logo island */}
        <GlassSurface
          width="auto"
          height="auto"
          borderRadius={18}
          className="shrink-0 pointer-events-auto transition-transform hover:scale-[1.03] active:scale-[0.98]"
          style={islandStyle}
        >
          <Link href="/" className="flex items-center gap-2.5 px-4 py-2">
            <Image src="/logo.svg" alt="Verity" width={32} height={32} className="w-8 h-8" />
            <span className="hidden sm:block font-black text-base leading-none tracking-tight" style={{ color: colors.pageFg }}>VERITY</span>
          </Link>
        </GlassSurface>

        {/* Center nav island */}
        <div className="hidden md:flex items-center pointer-events-auto">
        <GlassSurface
          width="auto"
          height="auto"
          borderRadius={18}
          style={islandStyle}
        >
        <div className="flex items-center gap-0.5 px-1.5 py-1.5">
          {/* Find Work dropdown */}
          <div className="relative" ref={findWorkRef}>
            <button onClick={() => { const v = !findWorkOpen; closeAll(); if (v) setFindWorkOpen(true); }}
              className="flex items-center gap-1 px-4 py-2 text-sm font-extrabold rounded-lg transition-colors tracking-wide uppercase"
              style={{ color: findWorkOpen ? colors.primaryFg : colors.navText, background: findWorkOpen ? colors.primaryLight : "transparent" }}>
              Find Work
              <svg className={`w-3 h-3 transition-transform ${findWorkOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {findWorkOpen && (
              <div className="absolute left-0 top-full mt-2 w-52 py-1.5 z-50" style={dropdown}>
                {[{ href: "/jobs", label: "Jobs", icon: "🔍" }, { href: "/sub-contracts", label: "Sub-Contracts", icon: "📜" }, { href: "/bounties", label: "Bounties", icon: "🎯" }].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setFindWorkOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <span className="w-5 text-center">{item.icon}</span>{item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Disputes */}
          <Link href="/disputes"
            className="px-4 py-2 text-sm font-extrabold rounded-lg transition-colors tracking-wide uppercase"
            style={{ color: pathname.startsWith("/disputes") ? colors.primaryFg : colors.navText,
                     background: pathname.startsWith("/disputes") ? colors.primaryLight : "transparent" }}>
            Disputes
          </Link>

          {/* Other dropdown */}
          <div className="relative" ref={otherRef}>
            <button onClick={() => { const v = !otherOpen; closeAll(); if (v) setOtherOpen(true); }}
              className="flex items-center gap-1 px-4 py-2 text-sm font-extrabold rounded-lg transition-colors tracking-wide uppercase"
              style={{ color: otherOpen ? colors.primaryFg : colors.navText, background: otherOpen ? colors.primaryLight : "transparent" }}>
              Other
              <svg className={`w-3 h-3 transition-transform ${otherOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {otherOpen && (
              <div className="absolute left-0 top-full mt-2 w-52 py-1.5 z-50" style={dropdown}>
                {[{ href: "/governance", label: "Governance", icon: "🏛️" }, { href: "/crowdfunding", label: "Crowdfunding", icon: "🚀" }, { href: "/insurance", label: "Insurance", icon: "🛡️" }, { href: "/loans", label: "VRT Loans", icon: "🏦" }].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setOtherOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <span className="w-5 text-center">{item.icon}</span>{item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        </GlassSurface>
        </div>

        {/* Right side – separate islands */}
        <div className="flex items-center gap-2 pointer-events-auto">

          {/* Post a Job island */}
          {address && (
            <GlassSurface
              width="auto"
              height="auto"
              borderRadius={18}
              className="hidden sm:block shrink-0 pointer-events-auto transition-transform hover:scale-[1.03] active:scale-[0.98]"
              style={islandStyle}
            >
              <button
                onClick={() => router.push("/jobs?create=true")}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-extrabold tracking-wide uppercase transition-colors whitespace-nowrap"
                style={{ color: colors.primaryFg }}
              >
                + Post a Job
              </button>
            </GlassSurface>
          )}

          {wrongNetwork && (
            <span className="text-xs px-2.5 py-1 rounded-full font-medium hidden sm:block"
              style={{ background: colors.dangerBg, color: colors.dangerText }}>
              Wrong Network
            </span>
          )}

          {/* Theme + Bell island */}
          <GlassSurface
            width="auto"
            height="auto"
            borderRadius={18}
            style={islandStyle}
          >
          <div className="flex items-center gap-0.5 px-1.5 py-1.5">
            {/* Theme picker */}
            <div className="relative" ref={themeRef}>
              <button
                onClick={() => { const v = !themeOpen; closeAll(); if (v) setThemeOpen(true); }}
                className="p-2 rounded-xl transition-colors"
                style={{ color: themeOpen ? colors.primaryFg : colors.muted, background: themeOpen ? colors.primaryLight : "transparent" }}
                aria-label="Change theme"
              >
                <span className="text-base">{THEME_META[theme].emoji}</span>
              </button>
              {themeOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden py-2 z-50" style={dropdown}>
                  <div className="px-4 py-2 border-b mb-1" style={{ borderColor: colors.divider }}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.muted }}>Theme</p>
                  </div>
                  {THEME_NAMES.map(t => (
                    <button key={t}
                      onClick={() => { setTheme(t); setThemeOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors"
                      style={{
                        color: theme === t ? colors.primaryFg : colors.navText,
                        background: theme === t ? colors.primaryLight : "transparent",
                        fontWeight: theme === t ? 600 : 400,
                      }}
                    >
                      <span>{THEME_META[t].emoji}</span>
                      {THEME_META[t].label}
                      {theme === t && <span className="ml-auto text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bell icon */}
            {address && (
              <div className="relative" ref={bellRef}>
                <button
                  onClick={() => { const v = !bellOpen; closeAll(); if (v) setBellOpen(true); }}
                  className="relative p-2 rounded-xl transition-colors"
                  style={{ color: bellOpen ? colors.primaryFg : colors.muted, background: bellOpen ? colors.primaryLight : "transparent" }}
                  aria-label="Notifications"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {totalCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px] font-bold rounded-full flex items-center justify-center px-1"
                      style={{ background: colors.dangerText, color: "#fff" }}>
                      {totalCount > 9 ? "9+" : totalCount}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden z-50" style={dropdown}>
                    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: colors.divider }}>
                      <p className="text-sm font-semibold" style={{ color: colors.pageFg }}>Notifications</p>
                      {totalCount > 0 && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: colors.dangerBg, color: colors.dangerText }}>
                          {totalCount} new
                        </span>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm" style={{ color: colors.muted }}>
                        You&apos;re all caught up!
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y" style={{ borderColor: colors.divider }}>
                        {notifications.map((n) => (
                          <div key={n.id} className="flex items-start gap-1 transition-colors">
                            <button
                              onClick={() => {
                                if (n.type === "chat" && address) {
                                  try {
                                    const msgs: unknown[] = JSON.parse(
                                      localStorage.getItem(chatKey(n.jobId)) || "[]"
                                    );
                                    localStorage.setItem(
                                      chatReadKey(n.jobId, address),
                                      String(msgs.length)
                                    );
                                  } catch { /* ignore */ }
                                  refresh();
                                } else if (n.type === "dispute") {
                                  // no-op
                                } else {
                                  dismiss(n.id);
                                }
                                setBellOpen(false);
                                router.push(n.link);
                              }}
                              className="flex-1 text-left px-4 py-3 flex items-start gap-3"
                            >
                              <span className="text-lg shrink-0 mt-0.5">{NOTIF_ICONS[n.type]}</span>
                              <p className="text-xs leading-relaxed" style={{ color: colors.pageFg }}>{n.message}</p>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                              className="shrink-0 p-2 mt-1 transition-colors"
                              style={{ color: colors.muted }}
                              aria-label="Dismiss notification"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          </GlassSurface>

          {/* Profile / Connect island */}
          {address ? (
            <div className="relative" ref={profileRef}>
            <GlassSurface
              width="auto"
              height="auto"
              borderRadius={18}
              style={islandStyle}
            >
              <div className="px-2 py-1.5">
              <button onClick={() => { const v = !profileOpen; closeAll(); if (v) setProfileOpen(true); }}
                className="flex items-center gap-2 px-2 py-1 rounded-xl transition-colors"
                style={{ color: colors.navText, background: profileOpen ? colors.primaryLight : "transparent" }}>
                <WalletAvatar address={address} size={22} />
                <span className="text-sm font-extrabold font-mono hidden sm:block whitespace-nowrap">{shortenAddress(address)}</span>
                <svg className={`w-3 h-3 transition-transform ${profileOpen ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              </div>
            </GlassSurface>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 py-1.5 z-50" style={dropdown}>
                  {[
                    { href: `/profile/${address}`, label: "My Profile", icon: "👤" },
                    { href: "/jobs?tab=mine", label: "My Jobs", icon: "📋" },
                    { href: "/jobs?tab=working", label: "My Work", icon: "💼" },
                    { href: "/disputes", label: "My Disputes", icon: "⚖️" },
                  ].map(item => (
                    <Link key={item.label} href={item.href} onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                      style={{ background: pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href.split("?")[0])) ? colors.primaryLight : "transparent",
                               color: pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href.split("?")[0])) ? colors.primaryFg : colors.navText }}>
                      <span className="w-5 text-center">{item.icon}</span>{item.label}
                    </Link>
                  ))}
                  {(dfmBalance !== null || ethBalance !== null) && (
                    <>
                      <div className="my-1.5 mx-3 border-t" style={{ borderColor: colors.divider }} />
                      <div className="mx-3 px-3 py-2 rounded-lg flex items-center justify-between" style={{ background: colors.badgeBg }}>
                        {dfmBalance !== null && <span className="text-xs font-mono font-bold" style={{ color: colors.badgeText }}>{dfmBalance} VRT</span>}
                        {ethBalance !== null && <span className="text-xs font-mono" style={{ color: colors.mutedFg }}>{ethBalance} ETH</span>}
                      </div>
                    </>
                  )}
                  <div className="my-1.5 mx-3 border-t" style={{ borderColor: colors.divider }} />
                  <button onClick={() => { disconnect(); setProfileOpen(false); }}
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ color: colors.dangerText }}>
                    <span className="w-5 text-center">🚪</span>Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={connect} disabled={connecting}
              className="text-sm font-semibold px-5 py-2.5 transition-all disabled:opacity-60 hover:scale-[1.03] active:scale-[0.98]"
              style={{ ...liquidGlass, background: colors.primary, color: colors.primaryText, border: "none" }}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}

          {/* Mobile hamburger (md:hidden) */}
          <div className="relative md:hidden" ref={mobileRef}>
            <GlassSurface
              width="auto"
              height="auto"
              borderRadius={18}
              style={islandStyle}
            >
            <button onClick={() => { const v = !mobileOpen; closeAll(); if (v) setMobileOpen(true); }}
              className="p-2 rounded-xl transition-colors"
              style={{ color: mobileOpen ? colors.primaryFg : colors.muted }}
              aria-label="Menu">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
            </GlassSurface>
            {mobileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 py-1.5 z-50" style={dropdown}>
                {[{ href: "/jobs", label: "Jobs", icon: "🔍" }, { href: "/sub-contracts", label: "Sub-Contracts", icon: "📜" },
                  { href: "/bounties", label: "Bounties", icon: "🎯" }, { href: "/disputes", label: "Disputes", icon: "⚖️" }].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <span className="w-5 text-center">{item.icon}</span>{item.label}
                  </Link>
                ))}
                <div className="my-1 mx-2 border-t" style={{ borderColor: colors.divider }} />
                {[{ href: "/governance", label: "Governance", icon: "🏛️" }, { href: "/crowdfunding", label: "Crowdfunding", icon: "🚀" },
                  { href: "/insurance", label: "Insurance", icon: "🛡️" }, { href: "/loans", label: "VRT Loans", icon: "🏦" }].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <span className="w-5 text-center">{item.icon}</span>{item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
