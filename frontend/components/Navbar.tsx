"use client";
import { useWallet } from "@/context/WalletContext";
import { useNotifications, NotifType } from "@/context/NotificationsContext";
import { useTheme, THEME_NAMES, THEME_META, ThemeName } from "@/context/ThemeContext";
import { shortenAddress, getVRTToken, getEscrow, chatKey, chatReadKey, NATIVE_SYMBOL } from "@/lib/contracts";
import { useEffect, useCallback, useState, useRef } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from 'next/image';
import GlassSurface from './reactbits/GlassSurface';
import {
  Bell,
  Briefcase,
  Check,
  CircleUserRound,
  Gavel,
  Hammer,
  Landmark,
  ListTodo,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Moon,
  Palette,
  Rocket,
  ScrollText,
  Search,
  Star,
  Stars,
  Sun,
  Sunset,
  Target,
  Trees,
  Waves,
  Flower2,
  type LucideIcon,
} from "lucide-react";

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

const NOTIF_ICONS: Record<NotifType, LucideIcon> = {
  bid: Hammer,
  dispute: Gavel,
  chat: MessageCircle,
  review: Star,
};

const THEME_ICONS: Record<ThemeName, LucideIcon> = {
  light: Sun,
  dark: Moon,
  midnight: Stars,
  ocean: Waves,
  sunset: Sunset,
  forest: Trees,
  rose: Flower2,
  pastel: Palette,
};

export default function Navbar() {
  const { address, provider, chainId, connect, disconnect, connecting, switchToExpectedChain } = useWallet();
  const { notifications, totalCount, dismiss, refresh } = useNotifications();
  const { theme, colors, setTheme } = useTheme();
  const dk = colors.colorScheme === "dark";
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
  const [isAdmin, setIsAdmin] = useState(false);
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
      setEthBalance(parseFloat(ethers.formatEther(b)).toFixed(4))
    ).catch(() => setEthBalance(null));
    getVRTToken(provider).balanceOf(address).then((b: bigint) =>
      setDfmBalance(parseFloat(ethers.formatEther(b)).toFixed(1))
    ).catch(() => setDfmBalance(null));
  }, [address, provider]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);
  useEffect(() => {
    if (!provider) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchBalances, 10_000);
    };
    provider.on("block", debouncedFetch);
    return () => { provider.off("block", debouncedFetch); if (timer) clearTimeout(timer); };
  }, [provider, fetchBalances]);
  useEffect(() => {
    window.addEventListener("dfm:tx", fetchBalances);
    return () => window.removeEventListener("dfm:tx", fetchBalances);
  }, [fetchBalances]);

  // Check admin status
  useEffect(() => {
    if (!provider || !address) { setIsAdmin(false); return; }
    (async () => {
      try {
        const escrow = getEscrow(provider);
        const adminRole = await escrow.ADMIN_ROLE();
        setIsAdmin(await escrow.hasRole(adminRole, address));
      } catch {
        setIsAdmin(address.toLowerCase() === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
      }
    })();
  }, [provider, address]);

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

  const expectedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "31337");
  const wrongNetwork = chainId !== null && chainId !== expectedChainId;

  /* Shared island height for visual consistency */
  const islandStyle: React.CSSProperties = { overflow: 'visible', minHeight: 44 };

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
  const iconNeutral = dk ? "#E2E8F0" : "#334155";
  const iconSubtle = dk ? "#94A3B8" : "#475569";
  const notifIconColor = (type: NotifType) => {
    if (type === "bid") return colors.infoText;
    if (type === "dispute") return colors.warningText;
    if (type === "review") return colors.successText;
    return colors.primaryFg;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 pointer-events-none" style={{ fontFamily: "var(--font-mono-alt), var(--font-geist-mono), monospace" }}>
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 pt-3 flex items-center justify-between gap-2 sm:gap-2.5">

        {/* Logo island */}
        <GlassSurface
          isDark={dk}
          width="auto"
          height="auto"
          borderRadius={18}
          className="shrink-0 pointer-events-auto transition-transform hover:scale-[1.03] active:scale-[0.98]"
          style={islandStyle}
        >
          <Link href="/" className="flex items-center gap-2 px-3 sm:px-4 py-2">
            <Image src="/logo.svg" alt="Verity" width={32} height={32} className="w-8 h-8" />
            <span className="hidden md:block font-black text-base leading-none tracking-tight" style={{ color: colors.pageFg }}>VERITY</span>
          </Link>
        </GlassSurface>

        {/* Center nav island */}
        <div className="hidden md:flex items-center pointer-events-auto">
        <GlassSurface
          isDark={dk}
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
                {[{ href: "/jobs", label: "Jobs", icon: Search }, { href: "/sub-contracts", label: "Sub-Contracts", icon: ScrollText }, { href: "/bounties", label: "Bounties", icon: Target }].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setFindWorkOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <item.icon className="w-4 h-4" />{item.label}
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
                {[{ href: "/governance", label: "Governance", icon: Landmark }, { href: "/crowdfunding", label: "Crowdfunding", icon: Rocket }, ...(isAdmin ? [{ href: "/admin", label: "Admin Panel", icon: LockKeyhole }] : [])].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setOtherOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <item.icon className="w-4 h-4" />{item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        </GlassSurface>
        </div>

        {/* Right side – separate islands */}
        <div className="flex min-w-0 items-center gap-2 pointer-events-auto">

          {/* Post a Job island */}
          {address && (
            <GlassSurface
              isDark={dk}
              width="auto"
              height="auto"
              borderRadius={18}
              className="hidden lg:block shrink-0 pointer-events-auto transition-transform hover:scale-[1.03] active:scale-[0.98]"
              style={islandStyle}
            >
              <div className="px-1.5 py-1.5">
                <button
                  onClick={() => router.push("/jobs?create=true")}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-extrabold tracking-wide uppercase transition-colors whitespace-nowrap"
                  style={{ color: colors.primaryFg }}
                >
                  + Post a Job
                </button>
              </div>
            </GlassSurface>
          )}

          {wrongNetwork && (
            <button
              onClick={switchToExpectedChain}
              className="text-xs px-2.5 py-1 rounded-full font-medium hidden md:block cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: colors.dangerBg, color: colors.dangerText }}
              title="Click to switch network"
            >
              Wrong Network — Switch
            </button>
          )}

          {/* Theme + Bell island */}
          <GlassSurface
            isDark={dk}
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
                style={{ color: themeOpen ? colors.primaryFg : iconNeutral, background: themeOpen ? colors.primaryLight : "transparent" }}
                aria-label="Change theme"
              >
                {(() => {
                  const ThemeIcon = THEME_ICONS[theme];
                  return <ThemeIcon className="w-4 h-4" />;
                })()}
              </button>
              {themeOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden py-2 z-50" style={dropdown}>
                  <div className="px-4 py-2 border-b mb-1" style={{ borderColor: colors.divider }}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.mutedFg }}>Theme</p>
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
                      {(() => {
                        const ThemeIcon = THEME_ICONS[t];
                        return <ThemeIcon className="w-4 h-4" />;
                      })()}
                      {THEME_META[t].label}
                      {theme === t && <Check className="ml-auto w-3.5 h-3.5" />}
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
                  style={{ color: bellOpen ? colors.primaryFg : iconNeutral, background: bellOpen ? colors.primaryLight : "transparent" }}
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
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
                      <div className="px-4 py-8 text-center text-sm" style={{ color: colors.mutedFg }}>
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
                              {(() => {
                                const NotifIcon = NOTIF_ICONS[n.type];
                                return <NotifIcon className="w-4 h-4 shrink-0 mt-1" style={{ color: notifIconColor(n.type) }} />;
                              })()}
                              <p className="text-xs leading-relaxed" style={{ color: colors.pageFg }}>{n.message}</p>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                              className="shrink-0 p-2 mt-1 transition-colors"
                              style={{ color: colors.mutedFg }}
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
              isDark={dk}
              width="auto"
              height="auto"
              borderRadius={18}
              style={islandStyle}
            >
              <div className="px-1.5 py-1.5">
              <button onClick={() => { const v = !profileOpen; closeAll(); if (v) setProfileOpen(true); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors"
                style={{ color: colors.navText, background: profileOpen ? colors.primaryLight : "transparent" }}>
                <WalletAvatar address={address} size={22} />
                <span className="text-sm font-extrabold font-mono hidden lg:block whitespace-nowrap">{shortenAddress(address)}</span>
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
                    { href: `/profile/${address}`, label: "My Profile", icon: CircleUserRound },
                    { href: "/jobs?tab=mine", label: "My Jobs", icon: ListTodo },
                    { href: "/jobs?tab=working", label: "My Work", icon: Briefcase },
                    { href: "/disputes", label: "My Disputes", icon: Gavel },
                  ].map(item => (
                    <Link key={item.label} href={item.href} onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                      style={{ background: pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href.split("?")[0])) ? colors.primaryLight : "transparent",
                               color: pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href.split("?")[0])) ? colors.primaryFg : colors.navText }}>
                      <item.icon className="w-4 h-4" />{item.label}
                    </Link>
                  ))}
                  {(dfmBalance !== null || ethBalance !== null) && (
                    <>
                      <div className="my-1.5 mx-3 border-t" style={{ borderColor: colors.divider }} />
                      <div className="mx-3 px-3 py-2 rounded-lg flex items-center justify-between" style={{ background: colors.badgeBg }}>
                        {dfmBalance !== null && <span className="text-xs font-mono font-bold" style={{ color: colors.badgeText }}>{dfmBalance} VRT</span>}
                        {ethBalance !== null && <span className="text-xs font-mono" style={{ color: colors.mutedFg }}>{ethBalance} {NATIVE_SYMBOL}</span>}
                      </div>
                    </>
                  )}
                  <div className="my-1.5 mx-3 border-t" style={{ borderColor: colors.divider }} />
                  <button onClick={() => { disconnect(); setProfileOpen(false); }}
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ color: colors.dangerText }}>
                    <LogOut className="w-4 h-4" />Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <GlassSurface
              isDark={dk}
              width="auto"
              height="auto"
              borderRadius={18}
              className="shrink-0 pointer-events-auto transition-transform hover:scale-[1.03] active:scale-[0.98]"
              style={islandStyle}
            >
              <div className="px-1.5 py-1.5">
                <button onClick={connect} disabled={connecting}
                  className="text-xs sm:text-sm font-extrabold tracking-wide uppercase px-3 sm:px-4 py-1.5 transition-all disabled:opacity-60 whitespace-nowrap"
                  style={{ color: colors.primaryFg }}>
                  <span className="sm:hidden">{connecting ? "Connecting…" : "Connect"}</span>
                  <span className="hidden sm:inline">{connecting ? "Connecting…" : "Connect Wallet"}</span>
                </button>
              </div>
            </GlassSurface>
          )}

          {/* Mobile hamburger (md:hidden) */}
          <div className="relative md:hidden" ref={mobileRef}>
            <GlassSurface
              isDark={dk}
              width="auto"
              height="auto"
              borderRadius={18}
              style={islandStyle}
            >
            <button onClick={() => { const v = !mobileOpen; closeAll(); if (v) setMobileOpen(true); }}
              className="p-2 rounded-xl transition-colors"
              style={{ color: mobileOpen ? colors.primaryFg : iconSubtle }}
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
                {wrongNetwork && (
                  <>
                    <button
                      onClick={() => { void switchToExpectedChain(); setMobileOpen(false); }}
                      className="w-[calc(100%-0.5rem)] mx-1 mb-1 flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg transition-colors"
                      style={{ background: colors.dangerBg, color: colors.dangerText }}
                    >
                      Wrong Network - Switch
                    </button>
                    <div className="my-1 mx-2 border-t" style={{ borderColor: colors.divider }} />
                  </>
                )}
                {[{ href: "/jobs", label: "Jobs", icon: Search }, { href: "/sub-contracts", label: "Sub-Contracts", icon: ScrollText },
                  { href: "/bounties", label: "Bounties", icon: Target }, { href: "/disputes", label: "Disputes", icon: Gavel }].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <item.icon className="w-4 h-4" />{item.label}
                  </Link>
                ))}
                <div className="my-1 mx-2 border-t" style={{ borderColor: colors.divider }} />
                {[{ href: "/governance", label: "Governance", icon: Landmark }, { href: "/crowdfunding", label: "Crowdfunding", icon: Rocket },
                  ...(isAdmin ? [{ href: "/admin", label: "Admin Panel", icon: LockKeyhole }] : [])].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-1 transition-colors"
                    style={{ background: pathname.startsWith(item.href) ? colors.primaryLight : "transparent", color: pathname.startsWith(item.href) ? colors.primaryFg : colors.navText }}>
                    <item.icon className="w-4 h-4" />{item.label}
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
