"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getReputationLoans, getVRTToken, getProvider, formatEth, formatVrt,
  formatDate, timeRemaining, CONTRACT_ADDRESSES, NATIVE_SYMBOL,
} from "@/lib/contracts";
import { ethers } from "ethers";
import { Input } from "@/components/reactbits/Input";
import { Label } from "@/components/reactbits/Label";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function LoansPage() {
  const { address, provider } = useWallet();
  const { colors } = useTheme();
  const [loans, setLoans] = useState<any[]>([]);
  const [activeLoan, setActiveLoan] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [defaulted, setDefaulted] = useState(false);
  const [vrtBal, setVrtBal] = useState<bigint>(0n);
  const [maxLoan, setMaxLoan] = useState<bigint>(0n);
  const [loanDuration, setLoanDuration] = useState<bigint>(0n);
  const [collateralPer10, setCollateralPer10] = useState<bigint>(0n);
  const configured = CONTRACT_ADDRESSES.ReputationLoans !== "";

  // Form
  const [loanAmount, setLoanAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");

  const load = useCallback(async () => {
    if (!configured || !provider || !address) return;
    try {
      const rl = getReputationLoans(provider);
      try { setLoans(await rl.getUserLoans(address)); } catch { setLoans([]); }
      try { setActiveLoan(await rl.getActiveLoan(address)); } catch { setActiveLoan(null); }
      try { setDefaulted(await rl.hasDefaulted(address)); } catch {}
      try { setVrtBal(await getVRTToken(provider).balanceOf(address)); } catch {}
      try { setMaxLoan(await rl.MAX_LOAN_AMOUNT()); } catch {}
      try { setLoanDuration(await rl.LOAN_DURATION()); } catch {}
      try { setCollateralPer10(await rl.COLLATERAL_PER_10_VRT()); } catch {}
    } catch {} finally { setLoading(false); }
  }, [provider, configured, address]);

  useEffect(() => { load(); }, [load]);

  const collateralFor = (amount: number) => {
    if (collateralPer10 > 0n) {
      // Use on-chain value: collateralPer10 wei per 10 VRT
      const units = Math.ceil(amount / 10);
      return parseFloat(ethers.formatEther(collateralPer10)) * units;
    }
    // Fallback: 0.005 ${NATIVE_SYMBOL} per 10 VRT
    return (Math.ceil(amount / 10) * 0.005);
  };

  const maxLoanDisplay = maxLoan > 0n ? formatVrt(maxLoan) : "50";
  const durationDays = loanDuration > 0n ? Math.round(Number(loanDuration) / 86400) : 30;

  async function handleTakeLoan(e: React.FormEvent) {
    e.preventDefault();
    if (!loanAmount) return;
    setBusy(true);
    try {
      const signer = await (await getProvider()).getSigner();
      const rl = getReputationLoans(signer);
      const amount = ethers.parseEther(loanAmount);
      const collateral = collateralFor(Number(loanAmount));
      const tx = await rl.takeLoan(amount, { value: ethers.parseEther(collateral.toString()) });
      await tx.wait();
      setLoanAmount("");
      window.dispatchEvent(new Event("dfm:tx"));
      load();
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  async function handleRepay(e: React.FormEvent) {
    e.preventDefault();
    if (!repayAmount) return;
    setBusy(true);
    try {
      const signer = await (await getProvider()).getSigner();
      const rl = getReputationLoans(signer);
      const tx = await rl.repayLoan(ethers.parseEther(repayAmount));
      await tx.wait();
      setRepayAmount("");
      window.dispatchEvent(new Event("dfm:tx"));
      load();
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  if (!configured) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center" style={{ color: colors.muted }}>
        <p className="text-lg font-semibold">ReputationLoans contract not configured</p>
        <p className="text-sm mt-2">Deploy contracts and set <code>NEXT_PUBLIC_REPUTATION_LOANS</code> in .env.local</p>
      </div>
    );
  }

  const hasActive = activeLoan && Number(activeLoan.amount) > 0 && !activeLoan.settled && !activeLoan.defaulted;

  return (
    <div className="min-h-screen" style={{ background: colors.pageBg }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <h1 className="text-3xl font-black mb-1" style={{ color: colors.pageFg }}>VRT Reputation Loans</h1>
        <p className="text-sm mb-6" style={{ color: colors.mutedFg }}>
          Borrow VRT tokens backed by {NATIVE_SYMBOL} collateral — build reputation faster
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border p-4 stat-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-xs" style={{ color: colors.muted }}>Your VRT</p>
            <p className="text-xl font-bold font-mono" style={{ color: colors.primaryFg }}>{formatVrt(vrtBal)}</p>
          </div>
          <div className="rounded-xl border p-4 stat-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-xs" style={{ color: colors.muted }}>Max Loan</p>
            <p className="text-xl font-bold" style={{ color: colors.pageFg }}>{maxLoanDisplay} VRT</p>
          </div>
          <div className="rounded-xl border p-4 stat-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-xs" style={{ color: colors.muted }}>Duration</p>
            <p className="text-xl font-bold" style={{ color: colors.pageFg }}>{durationDays} days</p>
          </div>
          <div className="rounded-xl border p-4 stat-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-xs" style={{ color: colors.muted }}>Status</p>
            <p className="text-xl font-bold" style={{ color: defaulted ? colors.dangerText : colors.successText }}>
              {defaulted ? "Defaulted" : "Good Standing"}
            </p>
          </div>
        </div>

        {defaulted && (
          <div className="rounded-xl p-4 mb-6" style={{ background: colors.dangerBg }}>
            <p className="text-sm font-semibold" style={{ color: colors.dangerText }}>
              Your account has been flagged for loan default. You cannot take new loans.
            </p>
          </div>
        )}

        {/* Take Loan Form */}
        {address && !hasActive && !defaulted && (
          <div className="rounded-2xl border p-5 mb-8" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <h2 className="text-lg font-bold mb-3" style={{ color: colors.pageFg }}>Take a Loan</h2>
            <p className="text-sm mb-4" style={{ color: colors.mutedFg }}>
              Borrow up to {maxLoanDisplay} VRT for {durationDays} days. Collateral: {collateralPer10 > 0n ? parseFloat(ethers.formatEther(collateralPer10)).toFixed(4) : "0.005"} {NATIVE_SYMBOL} per 10 VRT. Repay in full to get collateral back.
            </p>
            <form onSubmit={handleTakeLoan} className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <Label className="mb-1 block text-xs font-medium">Amount (VRT)</Label>
                <Input type="number" step="1" min="1" max={maxLoanDisplay} value={loanAmount} onChange={e => setLoanAmount(e.target.value)} required
                  className="font-mono"
                  placeholder="10" />
              </div>
              {loanAmount && Number(loanAmount) > 0 && (
                <div className="text-center px-3">
                  <p className="text-xs" style={{ color: colors.muted }}>Collateral Required</p>
                  <p className="font-mono font-bold text-sm" style={{ color: colors.warningText }}>
                    {collateralFor(Number(loanAmount)).toFixed(4)} {NATIVE_SYMBOL}
                  </p>
                </div>
              )}
              <button type="submit" disabled={busy}
                className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 btn-hover"
                style={{ background: colors.primary, color: colors.primaryText }}>
                {busy ? "Processing…" : "Borrow VRT"}
              </button>
            </form>
          </div>
        )}

        {/* Active Loan + Repay */}
        {hasActive && (
          <div className="rounded-2xl border p-5 mb-8" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <h2 className="text-lg font-bold mb-3" style={{ color: colors.pageFg }}>Active Loan</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div>
                <p className="text-xs" style={{ color: colors.muted }}>Borrowed</p>
                <p className="font-mono font-bold" style={{ color: colors.primaryFg }}>
                  {formatVrt(activeLoan.amount)} VRT
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: colors.muted }}>Repaid</p>
                <p className="font-mono font-bold" style={{ color: colors.successText }}>
                  {formatVrt(activeLoan.repaid)} VRT
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: colors.muted }}>Collateral</p>
                <p className="font-mono font-bold" style={{ color: colors.warningText }}>
                  {formatEth(activeLoan.collateral)} {NATIVE_SYMBOL}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: colors.muted }}>Expires</p>
                <p className="font-bold" style={{ color: colors.pageFg }}>
                  {timeRemaining(activeLoan.expiresAt)}
                </p>
              </div>
            </div>
            {/* Repay */}
            <form onSubmit={handleRepay} className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="mb-1 block text-xs font-medium">Repay Amount (VRT)</Label>
                <Input type="number" step="0.01" min="0.01" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} required
                  className="font-mono" />
              </div>
              <button type="submit" disabled={busy}
                className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 btn-hover"
                style={{ background: colors.successBg, color: colors.successText }}>
                {busy ? "Repaying…" : "Repay"}
              </button>
            </form>
          </div>
        )}

        {/* Loan History */}
        <h2 className="text-lg font-bold mb-3" style={{ color: colors.pageFg }}>Loan History</h2>
        {!address ? (
          <p className="text-sm py-8 text-center" style={{ color: colors.muted }}>Connect wallet to view loans</p>
        ) : loading ? (
          <p className="text-sm py-8 text-center" style={{ color: colors.muted }}>Loading…</p>
        ) : loans.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-4xl mb-3">🏦</p>
            <p className="font-semibold" style={{ color: colors.pageFg }}>No loans yet</p>
            <p className="text-sm mt-1" style={{ color: colors.muted }}>Borrow VRT to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {loans.map((l, i) => (
              <div key={i} className="rounded-xl border p-3 flex items-center justify-between card-hover"
                style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: l.defaulted ? colors.dangerBg : l.settled ? colors.successBg : colors.infoBg,
                        color: l.defaulted ? colors.dangerText : l.settled ? colors.successText : colors.infoText,
                      }}>
                      {l.defaulted ? "Defaulted" : l.settled ? "Settled" : "Active"}
                    </span>
                    <span className="text-xs font-mono" style={{ color: colors.muted }}>#{l.id?.toString()}</span>
                  </div>
                  <p className="text-sm" style={{ color: colors.pageFg }}>
                    <span className="font-mono font-bold">{formatVrt(l.amount)}</span> VRT · Repaid: <span className="font-mono">{formatVrt(l.repaid)}</span>
                  </p>
                  <p className="text-xs" style={{ color: colors.muted }}>{formatDate(l.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: colors.muted }}>Collateral</p>
                  <p className="font-mono text-sm font-bold" style={{ color: colors.warningText }}>{formatEth(l.collateral)} {NATIVE_SYMBOL}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
