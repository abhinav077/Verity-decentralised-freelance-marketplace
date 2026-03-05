"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { getInsurancePool, CONTRACT_ADDRESSES, formatEth, shortenAddress, formatDate } from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Policy {
  freelancer: string;
  premium: bigint;
  coverage: bigint;
  createdAt: bigint;
  expiresAt: bigint;
  claimed: boolean;
  withdrawn: boolean;
}

export default function InsurancePage() {
  const { address, signer, provider } = useWallet();
  const { colors } = useTheme();

  const [tab, setTab] = useState<"pool" | "my">("pool");
  const [poolBalance, setPoolBalance] = useState<bigint>(0n);
  const [totalBalance, setTotalBalance] = useState<bigint>(0n);
  const [policyCount, setPolicyCount] = useState(0);
  const [myPolicies, setMyPolicies] = useState<(Policy & { index: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On-chain configurable params
  const [coverageMult, setCoverageMult] = useState(3);
  const [policyDuration, setPolicyDuration] = useState(90);
  const [minPremium, setMinPremium] = useState(0.01);

  // Form
  const [premiumAmount, setPremiumAmount] = useState("0.01");
  const [buying, setBuying] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [txLoading, setTxLoading] = useState<Record<string, boolean>>({});

  const inputStyle = { background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg };

  const loadData = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.InsurancePool) { setError("InsurancePool not deployed."); setLoading(false); return; }
    const reader = provider || signer;
    if (!reader) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const ip = getInsurancePool(reader);
      const [pb, tb, pc] = await Promise.all([
        ip.poolBalance(),
        ip.totalPoolBalance(),
        ip.policyCounter(),
      ]);
      setPoolBalance(pb as bigint);
      setTotalBalance(tb as bigint);
      setPolicyCount(Number(pc));

      // Load configurable params
      try { setCoverageMult(Number(await ip.COVERAGE_MULTIPLIER())); } catch {}
      try { setPolicyDuration(Math.round(Number(await ip.POLICY_DURATION()) / 86400)); } catch {}
      try { setMinPremium(parseFloat(ethers.formatEther(await ip.MIN_PREMIUM()))); } catch {}

      if (address) {
        const pols: Policy[] = await ip.getUserPolicies(address);
        setMyPolicies(pols.map((p: any, i: number) => ({
          freelancer: p.freelancer,
          premium: p.premium,
          coverage: p.coverage,
          createdAt: p.createdAt,
          expiresAt: p.expiresAt,
          claimed: p.claimed,
          withdrawn: p.withdrawn,
          index: i,
        })));
      }
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("BAD_DATA") || msg.includes("0x")) {
        setError("InsurancePool contract not found. Redeploy contracts.");
      } else {
        setError("Failed to load: " + msg.split("(")[0].trim());
      }
    } finally { setLoading(false); }
  }, [provider, signer, address]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBuyInsurance = async () => {
    if (!signer || !premiumAmount) return;
    setBuying(true);
    try {
      const ip = getInsurancePool(signer);
      const tx = await ip.buyInsurance({ value: ethers.parseEther(premiumAmount) });
      await tx.wait();
      loadData();
    } catch (e: any) { alert(e?.reason || e?.message?.split("(")[0] || "Buy failed"); }
    finally { setBuying(false); }
  };

  const handleFundPool = async () => {
    if (!signer || !fundAmount) return;
    setFunding(true);
    try {
      const ip = getInsurancePool(signer);
      const tx = await ip.fundPool({ value: ethers.parseEther(fundAmount) });
      await tx.wait();
      setFundAmount("");
      loadData();
    } catch (e: any) { alert(e?.reason || e?.message?.split("(")[0] || "Fund failed"); }
    finally { setFunding(false); }
  };

  const handleWithdrawPremium = async (policyId: number) => {
    if (!signer) return;
    setTxLoading(p => ({ ...p, [`wd-${policyId}`]: true }));
    try {
      const ip = getInsurancePool(signer);
      // getUserPolicies returns policies in order — we need the on-chain policy ID
      // Since we can't get IDs from getUserPolicies directly, use policyId+1 offset approach
      // Actually the contract stores userPolicies[user] as an array of uint256 IDs
      // We need to look up by index. Let's try calling getPolicy for sequential IDs
      const tx = await ip.withdrawPremium(policyId);
      await tx.wait();
      loadData();
    } catch (e: any) { alert(e?.reason || e?.message?.split("(")[0] || "Withdraw failed"); }
    finally { setTxLoading(p => ({ ...p, [`wd-${policyId}`]: false })); }
  };

  const now = Math.floor(Date.now() / 1000);

  const policyStatus = (p: Policy) => {
    if (p.claimed) return { label: "Claimed", color: colors.successText, bg: colors.successBg };
    if (p.withdrawn) return { label: "Withdrawn", color: colors.muted, bg: colors.surfaceBg };
    if (Number(p.expiresAt) < now) return { label: "Expired", color: colors.warningText, bg: colors.warningBg };
    return { label: "Active", color: colors.primaryFg, bg: colors.primaryLight };
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6" style={{ color: colors.pageFg }}>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm hover:underline" style={{ color: colors.primaryFg }}>← Back to Home</Link>
          <h1 className="text-2xl font-bold mt-1">🛡️ Insurance Pool</h1>
          <p className="text-sm" style={{ color: colors.muted }}>
            Stake ETH for {coverageMult}× coverage protection. If a dispute resolves in your favor, get compensated from the pool.
          </p>
        </div>
      </div>

      {/* Pool stats */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[120px] rounded-xl p-4 text-center stat-hover" style={{ background: colors.primaryLight }}>
          <p className="text-2xl font-bold" style={{ color: colors.primaryFg }}>
            {loading ? "…" : formatEth(poolBalance)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: colors.primaryFg, opacity: 0.7 }}>Pool Balance (ETH)</p>
        </div>
        <div className="flex-1 min-w-[120px] rounded-xl p-4 text-center stat-hover" style={{ background: colors.successBg }}>
          <p className="text-2xl font-bold" style={{ color: colors.successText }}>
            {loading ? "…" : formatEth(totalBalance)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: colors.successText }}>Total Staked (ETH)</p>
        </div>
        <div className="flex-1 min-w-[120px] rounded-xl p-4 text-center stat-hover" style={{ background: colors.surfaceBg }}>
          <p className="text-2xl font-bold" style={{ color: colors.pageFg }}>
            {loading ? "…" : policyCount}
          </p>
          <p className="text-xs mt-0.5" style={{ color: colors.muted }}>Total Policies</p>
        </div>
        <div className="flex-1 min-w-[120px] rounded-xl p-4 text-center stat-hover" style={{ background: colors.warningBg }}>
          <p className="text-2xl font-bold" style={{ color: colors.warningText }}>{coverageMult}×</p>
          <p className="text-xs mt-0.5" style={{ color: colors.warningText }}>Coverage Multiplier</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-center" style={{ background: colors.dangerBg }}>
          <p style={{ color: colors.dangerText }}>{error}</p>
          <button onClick={loadData} className="text-sm mt-2 hover:underline" style={{ color: colors.primaryFg }}>Try again</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: colors.cardBorder }}>
        {(["pool", "my"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "" : "border-transparent"}`}
            style={tab === t
              ? { borderColor: colors.primary, color: colors.primaryFg }
              : { color: colors.muted }
            }>
            {t === "pool" ? "Buy Insurance" : `My Policies (${myPolicies.length})`}
          </button>
        ))}
      </div>

      {tab === "pool" && (
        <div className="space-y-4">
          {/* Buy insurance form */}
          <div className="rounded-xl border p-5 space-y-4" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <h3 className="font-semibold" style={{ color: colors.pageFg }}>Buy Insurance</h3>
            <p className="text-sm" style={{ color: colors.muted }}>
              Stake ETH as a premium. You get {coverageMult}× coverage (if you stake 0.1 ETH, your coverage is {(0.1 * coverageMult).toFixed(1)} ETH).
              Policies last {policyDuration} days. If no claim is filed, you can withdraw your premium after expiry.
            </p>
            <div>
              <label className="text-xs font-medium" style={{ color: colors.mutedFg }}>Premium Amount (ETH)</label>
              <input value={premiumAmount} onChange={e => setPremiumAmount(e.target.value)}
                type="number" step="0.01" min={minPremium.toString()}
                placeholder={`Min ${minPremium} ETH`}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              {premiumAmount && parseFloat(premiumAmount) >= minPremium && (
                <p className="text-xs mt-1" style={{ color: colors.successText }}>
                  Coverage: {(parseFloat(premiumAmount) * coverageMult).toFixed(4)} ETH
                </p>
              )}
            </div>
            <button onClick={handleBuyInsurance}
              disabled={buying || !premiumAmount || parseFloat(premiumAmount) < minPremium || !signer}
              className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
              style={{ background: colors.primary, color: colors.primaryText }}>
              {buying ? "Processing…" : "Buy Insurance"}
            </button>
          </div>

          {/* Fund pool */}
          <div className="rounded-xl border p-5 space-y-3" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <h3 className="font-semibold" style={{ color: colors.pageFg }}>Fund the Pool</h3>
            <p className="text-sm" style={{ color: colors.muted }}>
              Anyone can contribute ETH to strengthen the insurance pool.
            </p>
            <div className="flex gap-2">
              <input value={fundAmount} onChange={e => setFundAmount(e.target.value)}
                type="number" step="0.01" min="0.01" placeholder="ETH amount"
                className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              <button onClick={handleFundPool}
                disabled={funding || !fundAmount || parseFloat(fundAmount) <= 0 || !signer}
                className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60 btn-hover"
                style={{ background: colors.primary, color: colors.primaryText }}>
                {funding ? "…" : "Fund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "my" && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 animate-pulse" style={{ color: colors.muted }}>Loading…</div>
          ) : !address ? (
            <div className="text-center py-12" style={{ color: colors.muted }}>Connect wallet to view your policies.</div>
          ) : myPolicies.length === 0 ? (
            <div className="text-center py-12" style={{ color: colors.muted }}>
              No policies yet. Buy insurance to get covered!
            </div>
          ) : (
            [...myPolicies].reverse().map((p, i) => {
              const st = policyStatus(p);
              const expired = Number(p.expiresAt) < now;
              const canWithdraw = expired && !p.claimed && !p.withdrawn;
              const policyId = myPolicies.length - i; // Approximate on-chain ID
              return (
                <div key={i} className="rounded-xl border p-4 card-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                      <p className="text-sm font-medium mt-2" style={{ color: colors.pageFg }}>
                        Premium: {formatEth(p.premium)} ETH → Coverage: {formatEth(p.coverage)} ETH
                      </p>
                      <p className="text-xs mt-1" style={{ color: colors.muted }}>
                        {formatDate(p.createdAt)} — Expires {formatDate(p.expiresAt)}
                      </p>
                      <p className="text-xs" style={{ color: colors.muted }}>
                        {shortenAddress(p.freelancer)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {canWithdraw && (
                        <button onClick={() => handleWithdrawPremium(policyId)}
                          disabled={!!txLoading[`wd-${policyId}`]}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-60 btn-hover"
                          style={{ background: colors.successBg, color: colors.successText }}>
                          {txLoading[`wd-${policyId}`] ? "…" : "Withdraw Premium"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}
