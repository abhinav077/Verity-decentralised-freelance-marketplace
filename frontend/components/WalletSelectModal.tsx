"use client";
import { useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { X } from "lucide-react";

// Inline SVG icons for MetaMask and WalletConnect to avoid extra dependencies
function MetaMaskIcon() {
  return (
    <svg viewBox="0 0 318.6 318.6" className="w-8 h-8" aria-hidden="true">
      <path fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round" d="M274.1 35.5l-99.5 73.9L193 65.8z" />
      <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="M44.4 35.5l98.7 74.6-17.5-44.3zm193.9 171.3l-26.5 40.6 56.7 15.6 16.3-55.3zm-204.4.9L50.1 263l56.7-15.6-26.5-40.6z" />
      <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="M103.6 138.2l-15.8 23.9 56.3 2.5-2-60.5zm111.3 0l-39-34.8-1.3 61.2 56.2-2.5zM106.8 247.4l33.8-16.5-29.2-22.8zm71.1-16.5l33.9 16.5-4.7-39.3z" />
      <path fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" d="M211.8 247.4l-33.9-16.5 2.7 22.1-.3 9.3zm-105 0l31.5 14.9-.2-9.3 2.5-22.1z" />
      <path fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" d="M138.8 193.5l-28.2-8.3 19.9-9.1zm40.9 0l8.3-17.4 20 9.1z" />
      <path fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round" d="M106.8 247.4l4.8-40.6-31.3.9zM207 206.8l4.8 40.6 26.5-39.7zm23.8-44.7l-56.2 2.5 5.2 28.9 8.3-17.4 20 9.1zm-120.2 23.1l20-9.1 8.2 17.4 5.3-28.9-56.3-2.5z" />
      <path fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round" d="M87.8 162.1l23.6 46-.8-22.9zm120.3 23.1l-1 22.9 23.7-46zm-64-20.6l-5.3 28.9 6.6 34.1 1.5-44.9zm30.5 0l-2.7 18 1.2 45 6.7-34.1z" />
      <path fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" d="M179.8 193.5l-6.7 34.1 4.8 3.3 29.2-22.8 1-22.9zm-69.2-8.3l.8 22.9 29.2 22.8 4.8-3.3-6.6-34.1z" />
      <path fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round" d="M180.3 262.3l.3-9.3-2.5-2.2h-37.7l-2.3 2.2.2 9.3-31.5-14.9 11 9 22.3 15.5h38.3l22.4-15.5 11-9z" />
      <path fill="#161616" stroke="#161616" strokeLinecap="round" strokeLinejoin="round" d="M178.1 230.9l-4.8-3.3h-27.7l-4.8 3.3-2.5 22.1 2.3-2.2h37.7l2.5 2.2z" />
      <path fill="#763D16" stroke="#763D16" strokeLinecap="round" strokeLinejoin="round" d="M278.3 114.2l8.5-40.8-12.7-37.9-96.2 71.4 37 31.3 52.3 15.3 11.6-13.5-5-3.6 8-7.3-6.2-4.8 8-6.1zM31.8 73.4l8.5 40.8-5.4 4 8 6.1-6.1 4.8 8 7.3-5 3.6 11.5 13.5 52.3-15.3 37-31.3-96.2-71.4z" />
      <path fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" d="M267.2 153.5l-52.3-15.3 15.9 23.9-23.7 46 31.2-.4h46.5zm-163.6-15.3l-52.3 15.3-17.4 54.2h46.4l31.1.4-23.6-46zm71 26.4l3.3-57.7 15.2-41.1h-67.5l15 41.1 3.5 57.7 1.2 18.2.1 44.8h27.7l.2-44.8z" />
    </svg>
  );
}

function WalletConnectIcon() {
  return (
    <svg viewBox="0 0 300 185" className="w-8 h-8" fill="none" aria-hidden="true">
      <path d="M61.4 36.3C106.7-7 192.2-7 237.5 36.3l6.3 6.1a6.5 6.5 0 010 9.3l-21.6 21a3.4 3.4 0 01-4.7 0l-8.7-8.4C177.6 33.6 122.4 33.6 101.1 64.3l-9.3 9a3.4 3.4 0 01-4.7 0L65.5 52.3a6.5 6.5 0 010-9.3l-4.1-6.7z" fill="#3B99FC" />
      <path d="M113 84.9a53.5 53.5 0 0174 0l7.9 7.7a3.4 3.4 0 010 4.8L174.3 117a1.7 1.7 0 01-2.4 0l-10.8-10.5a27.3 27.3 0 00-37.8 0l-11.6 11.2a1.7 1.7 0 01-2.4 0L88.7 97.5a3.4 3.4 0 010-4.8L113 84.9z" fill="#3B99FC" />
      <path d="M152.9 127.8a3.4 3.4 0 01-4.8 0l-11-10.6a1.7 1.7 0 00-2.3 0l-11 10.6a3.4 3.4 0 01-4.7 0L105 113.6a3.4 3.4 0 010-4.8l11-10.7a17.2 17.2 0 0123.8 0l11 10.7a3.4 3.4 0 010 4.8l-8 14.2z" fill="#3B99FC" />
    </svg>
  );
}

export default function WalletSelectModal() {
  const { walletModalOpen, closeWalletModal, connectInjected, connectWalletConnect, connecting, error } = useWallet();
  const { colors } = useTheme();

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeWalletModal(); };
    if (walletModalOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [walletModalOpen, closeWalletModal]);

  if (!walletModalOpen) return null;

  const hasInjected = typeof window !== "undefined" && !!window.ethereum;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={closeWalletModal}
      role="dialog"
      aria-modal="true"
      aria-label="Connect wallet"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl p-6"
        style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: colors.pageFg }}>Connect Wallet</h2>
          <button
            onClick={closeWalletModal}
            className="rounded-lg p-1.5 transition-colors hover:opacity-70"
            style={{ color: colors.mutedFg }}
            aria-label="Close"
            disabled={connecting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {/* Browser Wallet (MetaMask / injected) — shown only when extension is available */}
          {hasInjected && (
            <button
              onClick={() => void connectInjected()}
              disabled={connecting}
              className="flex items-center gap-4 w-full rounded-xl px-4 py-4 text-left font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              style={{ background: colors.surfaceBg, border: `1px solid ${colors.cardBorder}`, color: colors.pageFg }}
            >
              <MetaMaskIcon />
              <div>
                <p className="font-semibold" style={{ color: colors.pageFg }}>Browser Wallet</p>
                <p className="text-xs mt-0.5" style={{ color: colors.mutedFg }}>
                  MetaMask or any injected wallet
                </p>
              </div>
            </button>
          )}

          {/* WalletConnect — always available, required on mobile */}
          <button
            onClick={() => void connectWalletConnect()}
            disabled={connecting}
            className="flex items-center gap-4 w-full rounded-xl px-4 py-4 text-left font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            style={{ background: colors.surfaceBg, border: `1px solid ${colors.cardBorder}`, color: colors.pageFg }}
          >
            <WalletConnectIcon />
            <div>
              <p className="font-semibold" style={{ color: colors.pageFg }}>WalletConnect</p>
              <p className="text-xs mt-0.5" style={{ color: colors.mutedFg }}>
                {hasInjected
                  ? "Scan QR or use a mobile wallet"
                  : "Connect with your mobile wallet app"}
              </p>
            </div>
          </button>
        </div>

        {/* Mobile hint when no injected wallet */}
        {!hasInjected && (
          <p className="mt-4 text-xs text-center" style={{ color: colors.mutedFg }}>
            On mobile? Use WalletConnect to connect MetaMask, Trust Wallet, Rainbow, and more.
          </p>
        )}

        {/* Error display */}
        {error && (
          <p className="mt-4 text-xs rounded-lg px-3 py-2" style={{ background: colors.dangerBg, color: colors.dangerText }}>
            {error}
          </p>
        )}

        {/* Loading state */}
        {connecting && (
          <p className="mt-3 text-xs text-center" style={{ color: colors.mutedFg }}>
            Connecting…
          </p>
        )}
      </div>
    </div>
  );
}
