"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getGovernance, getVRTToken, getProvider, formatEth, formatVrt,
  formatDate, timeRemaining, shortenAddress, CONTRACT_ADDRESSES,
} from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PROPOSAL_STATUS: Record<number, string> = {
  0: "Active", 1: "Passed", 2: "Rejected", 3: "Executed", 4: "Cancelled",
};

export default function GovernancePage() {
  const { address, provider } = useWallet();
  const { colors } = useTheme();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [treasuryBal, setTreasuryBal] = useState<bigint>(0n);
  const [vrtBalance, setVrtBalance] = useState<bigint>(0n);
  const configured = CONTRACT_ADDRESSES.Governance !== "";

  // Form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    if (!configured || !provider) return;
    try {
      const gov = getGovernance(provider);
      const count = Number(await gov.proposalCounter());
      const arr: any[] = [];
      for (let i = count; i >= 1; i--) {
        try { arr.push(await gov.getProposal(i)); } catch {}
      }
      setProposals(arr);
      try { setTreasuryBal(await gov.treasuryBalance()); } catch {}
      if (address) {
        try { setVrtBalance(await getVRTToken(provider).balanceOf(address)); } catch {}
      }
    } catch {} finally { setLoading(false); }
  }, [provider, configured, address]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const signer = await (await getProvider()).getSigner();
      const gov = getGovernance(signer);
      const tx = await gov.createProposal(title, description, ethers.ZeroAddress, "0x");
      await tx.wait();
      setShowCreate(false); setTitle(""); setDescription("");
      window.dispatchEvent(new Event("dfm:tx"));
      load();
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  async function handleVote(pid: number, support: boolean) {
    setBusy(true);
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getGovernance(signer).voteOnProposal(pid, support);
      await tx.wait();
      window.dispatchEvent(new Event("dfm:tx"));
      load();
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  async function handleFinalize(pid: number) {
    setBusy(true);
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getGovernance(signer).finalizeProposal(pid);
      await tx.wait();
      window.dispatchEvent(new Event("dfm:tx"));
      load();
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  if (!configured) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center" style={{ color: colors.muted }}>
        <p className="text-lg font-semibold">Governance contract not configured</p>
        <p className="text-sm mt-2">Deploy contracts and set <code>NEXT_PUBLIC_GOVERNANCE</code> in .env.local</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: colors.pageBg }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black" style={{ color: colors.pageFg }}>Governance</h1>
            <p className="text-sm mt-1" style={{ color: colors.mutedFg }}>
              VRT-weighted proposals — vote on platform decisions
            </p>
          </div>
          {address && (
            <button onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold btn-hover"
              style={{ background: colors.primary, color: colors.primaryText }}>
              + New Proposal
            </button>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border p-4 stat-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-xs" style={{ color: colors.muted }}>Treasury</p>
            <p className="text-xl font-bold font-mono" style={{ color: colors.primaryFg }}>{formatEth(treasuryBal)} ETH</p>
          </div>
          <div className="rounded-xl border p-4 stat-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-xs" style={{ color: colors.muted }}>Your VRT</p>
            <p className="text-xl font-bold font-mono" style={{ color: colors.primaryFg }}>{formatVrt(vrtBalance)}</p>
          </div>
          <div className="rounded-xl border p-4 stat-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-xs" style={{ color: colors.muted }}>Total Proposals</p>
            <p className="text-xl font-bold" style={{ color: colors.pageFg }}>{proposals.length}</p>
          </div>
        </div>

        {/* Proposals list */}
        {loading ? (
          <div className="text-center py-16" style={{ color: colors.muted }}>Loading proposals…</div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <p className="text-4xl mb-3">🏛️</p>
            <p className="font-semibold text-lg" style={{ color: colors.pageFg }}>No proposals yet</p>
            <p className="text-sm mt-1" style={{ color: colors.muted }}>Create the first governance proposal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => {
              const status = Number(p.status);
              const forV = Number(ethers.formatEther(p.forVotes));
              const againstV = Number(ethers.formatEther(p.againstVotes));
              const total = forV + againstV;
              const pct = total > 0 ? Math.round((forV / total) * 100) : 0;
              const expired = Number(p.deadline) * 1000 < Date.now();
              return (
                <div key={p.id.toString()}
                  className="rounded-2xl border p-5 card-hover"
                  style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: status === 0 ? colors.infoBg : status === 1 ? colors.successBg : status === 3 ? colors.successBg : colors.dangerBg,
                            color: status === 0 ? colors.infoText : status === 1 ? colors.successText : status === 3 ? colors.successText : colors.dangerText,
                          }}>
                          {PROPOSAL_STATUS[status] || "Unknown"}
                        </span>
                        <span className="text-xs" style={{ color: colors.muted }}>#{p.id.toString()}</span>
                      </div>
                      <h3 className="font-bold text-base" style={{ color: colors.pageFg }}>{p.title}</h3>
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: colors.mutedFg }}>{p.description}</p>
                    </div>
                    <span className="text-xs shrink-0 ml-4" style={{ color: colors.muted }}>
                      {expired ? "Ended" : timeRemaining(p.deadline)}
                    </span>
                  </div>

                  {/* Vote bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: colors.successText }}>For: {forV.toFixed(1)} VRT ({pct}%)</span>
                      <span style={{ color: colors.dangerText }}>Against: {againstV.toFixed(1)} VRT ({100 - pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: colors.surfaceBg }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors.successText }} />
                    </div>
                  </div>

                  {/* Actions */}
                  {status === 0 && address && !expired && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleVote(Number(p.id), true)} disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 btn-hover"
                        style={{ background: colors.successBg, color: colors.successText }}>
                        Vote For
                      </button>
                      <button onClick={() => handleVote(Number(p.id), false)} disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 btn-hover"
                        style={{ background: colors.dangerBg, color: colors.dangerText }}>
                        Vote Against
                      </button>
                    </div>
                  )}
                  {status === 0 && expired && (
                    <button onClick={() => handleFinalize(Number(p.id))} disabled={busy}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium mt-3 disabled:opacity-50 btn-hover"
                      style={{ background: colors.warningBg, color: colors.warningText }}>
                      Finalize
                    </button>
                  )}
                  <p className="text-xs mt-2" style={{ color: colors.muted }}>
                    Proposed by <Link href={`/profile/${p.proposer}`} className="underline">{shortenAddress(p.proposer)}</Link>
                    {" · "}{formatDate(p.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl p-6" style={{ background: colors.cardBg }} onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4" style={{ color: colors.pageFg }}>New Proposal</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.mutedFg }}>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} required
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.mutedFg }}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={4}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
                  style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border btn-outline-hover"
                  style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                <button type="submit" disabled={busy}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 btn-hover"
                  style={{ background: colors.primary, color: colors.primaryText }}>
                  {busy ? "Creating…" : "Create Proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
