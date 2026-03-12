"use client";
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { getGovernance, CONTRACT_ADDRESSES, formatEth, formatDate, shortenAddress, NATIVE_SYMBOL } from "@/lib/contracts";
import { Input } from "@/components/reactbits/Input";
import { Paperclip, Wallet, Link as LinkIcon, X, Heart } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CrowdfundProject {
  id: bigint; creator: string; title: string; description: string;
  category: string; proofLink: string; goalAmount: bigint; totalRaised: bigint;
  deadline: bigint; status: number; createdAt: bigint; contributorCount: bigint;
  fundsWithdrawn: boolean;
}
interface CrowdfundUpdate {
  description: string; link: string; timestamp: bigint;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Active", 1: "Funded", 2: "Failed", 3: "Cancelled",
};

export default function CrowdfundingPage() {
  const { address, signer, provider } = useWallet();
  const { colors } = useTheme();
  const [projects, setProjects] = useState<CrowdfundProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<bigint | null>(null);
  const [crowdFilter, setCrowdFilter] = useState<"all" | "active" | "funded" | "failed">("all");
  const [updates, setUpdates] = useState<Record<string, CrowdfundUpdate[]>>({});
  const [myContributions, setMyContributions] = useState<Record<string, bigint>>({});
  const [txLoading, setTxLoading] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // On-chain configurable params
  const [minVrtToCrowdfund, setMinVrtToCrowdfund] = useState("5");

  // Create form
  const [form, setForm] = useState({ title: "", description: "", category: "Product", proofLink: "", goalAmount: "", durationDays: "30" });
  // Update form
  const [updateDesc, setUpdateDesc] = useState("");
  const [updateLink, setUpdateLink] = useState("");
  // Contribute amount
  const [contributeAmt, setContributeAmt] = useState("");
  const [withdrawn, setWithdrawn] = useState<Record<string, bigint>>({});

  const configured = CONTRACT_ADDRESSES.Governance !== "";

  const loadProjects = useCallback(async () => {
    if (!configured) { setLoading(false); return; }
    const reader = provider || signer;
    if (!reader) { setLoading(false); return; }
    try {
      const gov = getGovernance(reader);
      // Load min VRT to crowdfund
      try { setMinVrtToCrowdfund(parseFloat(ethers.formatEther(await gov.MIN_VRT_TO_CROWDFUND())).toString()); } catch {}
      const count = Number(await gov.crowdfundCounter());
      const list: CrowdfundProject[] = [];
      for (let i = 1; i <= count; i++) {
        try {
          const p = await gov.getCrowdfundProject(i);
          list.push({
            id: p.id, creator: p.creator, title: p.title, description: p.description,
            category: p.category, proofLink: p.proofLink, goalAmount: p.goalAmount,
            totalRaised: p.totalRaised, deadline: p.deadline, status: Number(p.status),
            createdAt: p.createdAt, contributorCount: p.contributorCount,
            fundsWithdrawn: p.fundsWithdrawn,
          });
        } catch {}
      }
      setProjects(list.reverse());
      // Load withdrawn amounts for each project
      const wMap: Record<string, bigint> = {};
      for (const p of list) {
        try {
          const w = await gov.crowdfundWithdrawn(p.id);
          if (w > 0n) wMap[p.id.toString()] = w;
        } catch {}
      }
      setWithdrawn(wMap);
      // Load user contributions
      if (address) {
        const contribs: Record<string, bigint> = {};
        for (const p of list) {
          try {
            const c = await gov.getContribution(p.id, address);
            if (c > 0n) contribs[p.id.toString()] = c;
          } catch {}
        }
        setMyContributions(contribs);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [provider, signer, configured, address]);

  useEffect(() => { setLoading(true); loadProjects(); }, [loadProjects]);

  const loadUpdates = async (pid: bigint) => {
    const reader = provider || signer;
    if (!reader) return;
    try {
      const gov = getGovernance(reader);
      const ups = await gov.getCrowdfundUpdates(pid);
      setUpdates(prev => ({ ...prev, [pid.toString()]: [...ups] }));
    } catch {}
  };

  const runTx = async (key: string, fn: () => Promise<void>) => {
    if (!signer) return;
    setTxLoading(key); setTxError(null);
    try { await fn(); await loadProjects(); }
    catch (e: any) { setTxError(e?.reason || e?.message?.split("(")[0] || "Transaction failed"); }
    finally { setTxLoading(null); }
  };

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer) return;
    await runTx("create", async () => {
      const gov = getGovernance(signer);
      const tx = await gov.createCrowdfundProject(
        form.title, form.description, form.category, form.proofLink,
        ethers.parseEther(form.goalAmount), parseInt(form.durationDays) * 86400
      );
      await tx.wait();
      setShowCreate(false);
      setForm({ title: "", description: "", category: "Product", proofLink: "", goalAmount: "", durationDays: "30" });
    });
  };

  const contribute = async (pid: bigint) => {
    if (!signer || !contributeAmt) return;
    await runTx(`contribute-${pid}`, async () => {
      const gov = getGovernance(signer);
      const tx = await gov.contributeToProject(pid, { value: ethers.parseEther(contributeAmt) });
      await tx.wait();
      setContributeAmt("");
    });
  };

  const withdrawFunds = async (pid: bigint) => {
    if (!signer) return;
    await runTx(`withdraw-${pid}`, async () => {
      const tx = await getGovernance(signer).withdrawCrowdfundFunds(pid);
      await tx.wait();
    });
  };

  const postUpdate = async (pid: bigint) => {
    if (!signer || !updateDesc) return;
    await runTx(`update-${pid}`, async () => {
      const tx = await getGovernance(signer).postCrowdfundUpdate(pid, updateDesc, updateLink);
      await tx.wait();
      setUpdateDesc(""); setUpdateLink("");
      loadUpdates(pid);
    });
  };

  const cancelProject = async (pid: bigint) => {
    if (!confirm("Cancel this project? Contributors will be able to claim refunds.")) return;
    await runTx(`cancel-${pid}`, async () => {
      const tx = await getGovernance(signer!).cancelCrowdfundProject(pid);
      await tx.wait();
    });
  };

  const refund = async (pid: bigint) => {
    if (!signer) return;
    await runTx(`refund-${pid}`, async () => {
      const tx = await getGovernance(signer).refundContribution(pid);
      await tx.wait();
    });
  };

  const markFailed = async (pid: bigint) => {
    if (!signer) return;
    await runTx(`fail-${pid}`, async () => {
      const tx = await getGovernance(signer).markProjectFailed(pid);
      await tx.wait();
    });
  };

  const inputStyle = { background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg };

  const filteredProjects = projects.filter((p) => {
    if (crowdFilter === "active") return p.status === 0;
    if (crowdFilter === "funded") return p.status === 1;
    if (crowdFilter === "failed") return p.status === 2 || p.status === 3;
    return true;
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-8" style={{ color: colors.pageFg }}>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold" style={{ color: colors.pageFg }}>Community Crowdfunding</h1>
        <p className="mt-2 leading-relaxed" style={{ color: colors.mutedFg }}>Fund community projects with transparent on-chain tracking.<br />Support builders, track progress, earn recognition.</p>
      </div>

      {txError && <div className="text-sm rounded-lg p-3 mb-4" style={{ background: colors.dangerBg, color: colors.dangerText }}>{txError}</div>}

      {address && configured && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-6" style={{ borderBottom: `2px solid ${colors.cardBorder}` }}>
            {(["all", "active", "funded", "failed"] as const).map((f) => (
              <button key={f} onClick={() => setCrowdFilter(f)}
                className="relative pb-2.5 text-sm font-medium transition-colors -mb-[2px]"
                style={crowdFilter === f
                  ? { color: colors.primaryFg, borderBottom: `2px solid ${colors.primaryFg}` }
                  : { color: colors.mutedFg, borderBottom: "2px solid transparent" }}>
                {f === "all" ? "All Projects" : f === "active" ? "Active" : f === "funded" ? "Funded" : "Failed"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium btn-hover"
            style={{ background: colors.primary, color: colors.primaryText }}>
            + New Project
          </button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && signer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: colors.cardBg }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 rounded-t-2xl" style={{ background: colors.primary }}>
              <div className="flex items-center gap-2.5 text-white">
                <Heart size={18} />
                <h2 className="text-lg font-bold">Launch a Crowdfund Project</h2>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={createProject} className="p-6 space-y-4 overflow-y-auto">
              <p className="text-xs" style={{ color: colors.mutedFg }}>You need ≥{minVrtToCrowdfund} VRT to create a project.</p>
              <Input placeholder="Project title" required
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <textarea rows={3} placeholder="Describe the project…" required
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="border rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}
                  value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {["Product", "Tool", "Research", "Community", "Education", "Other"].map(c => <option key={c}>{c}</option>)}
                </select>
                <Input placeholder="Proof/docs link (optional)"
                  value={form.proofLink} onChange={e => setForm(f => ({ ...f, proofLink: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" step="0.01" min="0.01" placeholder={`Goal (${NATIVE_SYMBOL})`} required
                  value={form.goalAmount} onChange={e => setForm(f => ({ ...f, goalAmount: e.target.value }))} />
                <Input type="number" min="1" max="365" placeholder="Duration (days)"
                  value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))} />
              </div>
              <button type="submit" disabled={!!txLoading}
                className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                style={{ background: colors.primary, color: colors.primaryText }}>
                {txLoading === "create" ? "Creating…" : "Launch Project"}
              </button>
            </form>
          </div>
        </div>
      )}

      {!address && <p className="text-center py-20" style={{ color: colors.mutedFg }}>Connect your wallet to see crowdfunding projects.</p>}

      {loading && address && (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="rounded-xl h-40 animate-pulse" style={{ background: colors.inputBg }} />)}
        </div>
      )}

      {!loading && address && filteredProjects.length === 0 && (
        <div className="text-center py-20" style={{ color: colors.mutedFg }}>
          <p className="text-lg">{crowdFilter === "all" ? "No crowdfunding projects yet. Be the first to create one!" : `No ${crowdFilter} projects.`}</p>
        </div>
      )}

      {!loading && address && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProjects.map((p) => {
            const pid = p.id.toString();
            const isCreator = address?.toLowerCase() === p.creator.toLowerCase();
            const pctFunded = p.goalAmount > 0n ? Number((p.totalRaised * 100n) / p.goalAmount) : 0;
            const isActive = p.status === 0;
            const isFunded = p.status === 1;
            const isFailed = p.status === 2;
            const isCancelled = p.status === 3;
            const deadlineReached = Math.floor(Date.now() / 1000) >= Number(p.deadline);
            const expanded = expandedId === p.id;
            const myContrib = myContributions[pid] || 0n;
            const canRefund = (isFailed || isCancelled) && myContrib > 0n;

            return (
              <div key={pid} className="border rounded-xl p-5 card-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: colors.primaryLight, color: colors.primaryFg }}>{p.category}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{
                        background: isActive ? colors.successBg : isFunded ? colors.infoBg : colors.inputBg,
                        color: isActive ? colors.successText : isFunded ? colors.infoText : colors.mutedFg,
                      }}>{STATUS_LABELS[p.status]}</span>
                    </div>
                    <h3 className="text-lg font-bold mt-1" style={{ color: colors.pageFg }}>{p.title}</h3>
                    <p className="text-xs mt-0.5" style={{ color: colors.mutedFg }}>
                      by {isCreator ? "You" : shortenAddress(p.creator)} · {Number(p.contributorCount)} contributors · Deadline: {formatDate(p.deadline)}
                    </p>
                  </div>
                  <button onClick={() => { setExpandedId(expanded ? null : p.id); if (!expanded) loadUpdates(p.id); }}
                    className="text-xs px-2 py-1 rounded-lg border shrink-0"
                    style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>
                    {expanded ? "Collapse" : "Details"}
                  </button>
                </div>

                <p className="text-sm mb-3 leading-relaxed" style={{ color: colors.pageFg }}>{p.description}</p>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1" style={{ color: colors.mutedFg }}>
                    <span>{formatEth(p.totalRaised)} / {formatEth(p.goalAmount)} {NATIVE_SYMBOL}</span>
                    <span>{Math.min(pctFunded, 100)}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: colors.inputBg }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pctFunded, 100)}%`, background: pctFunded >= 100 ? colors.successText : colors.primary }} />
                  </div>
                </div>

                {/* Proof link */}
                {p.proofLink && (
                  <p className="text-xs mb-3">
                    <a href={p.proofLink} target="_blank" rel="noopener noreferrer"
                      style={{ color: colors.primaryFg }} className="hover:underline">
                      <Paperclip size={12} className="inline mr-1" />Project documentation / proof
                    </a>
                  </p>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {isActive && !isCreator && (
                    <div className="flex gap-2 flex-1">
                      <Input type="number" step="0.01" min="0.01" placeholder={NATIVE_SYMBOL}
                        className="h-9 px-2 py-1.5 text-sm"
                        containerClassName="w-24"
                        value={expandedId === p.id ? contributeAmt : ""}
                        onChange={e => { setExpandedId(p.id); setContributeAmt(e.target.value); }} />
                      <button onClick={() => contribute(p.id)}
                        disabled={!!txLoading || !contributeAmt}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 btn-hover"
                        style={{ background: colors.primary, color: colors.primaryText }}>
                        {txLoading === `contribute-${pid}` ? "…" : "Contribute"}
                      </button>
                    </div>
                  )}
                  {isCreator && (isActive || isFunded) && (p.totalRaised - (withdrawn[pid] || 0n)) > 0n && (
                    <button onClick={() => withdrawFunds(p.id)}
                      disabled={!!txLoading}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 btn-hover flex items-center gap-1.5"
                      style={{ background: colors.successText, color: "#fff" }}>
                      <Wallet size={14} />
                      {txLoading === `withdraw-${pid}` ? "…" : `Withdraw ${formatEth(p.totalRaised - (withdrawn[pid] || 0n))} ${NATIVE_SYMBOL}`}
                    </button>
                  )}
                  {isCreator && isActive && (
                    <button onClick={() => cancelProject(p.id)}
                      disabled={!!txLoading}
                      className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-60 btn-outline-hover"
                      style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                      Cancel Project
                    </button>
                  )}
                  {isActive && deadlineReached && (
                    <button onClick={() => markFailed(p.id)}
                      disabled={!!txLoading}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.dangerBg, color: colors.dangerText }}>
                      {txLoading === `fail-${pid}` ? "…" : "Mark as Failed"}
                    </button>
                  )}
                  {canRefund && (
                    <button onClick={() => refund(p.id)}
                      disabled={!!txLoading}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.warningText, color: "#fff" }}>
                      {txLoading === `refund-${pid}` ? "…" : `Refund (${formatEth(myContrib)} ${NATIVE_SYMBOL})`}
                    </button>
                  )}
                </div>

                {/* My contribution */}
                {myContrib > 0n && isActive && (
                  <p className="text-xs mt-2" style={{ color: colors.successText }}>
                    You&apos;ve contributed {formatEth(myContrib)} {NATIVE_SYMBOL}
                  </p>
                )}

                {/* Expanded: updates */}
                {expanded && (
                  <div className="mt-4 pt-4 space-y-3" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                    <h4 className="text-sm font-semibold" style={{ color: colors.mutedFg }}>Updates</h4>
                    {(updates[pid] || []).length === 0 ? (
                      <p className="text-xs" style={{ color: colors.mutedFg }}>No updates yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {(updates[pid] || []).map((u, i) => (
                          <div key={i} className="rounded-lg p-3 border" style={{ borderColor: colors.cardBorder }}>
                            <p className="text-sm" style={{ color: colors.pageFg }}>{u.description}</p>
                            {u.link && (
                              <a href={u.link} target="_blank" rel="noopener noreferrer"
                                className="text-xs hover:underline mt-1 block" style={{ color: colors.primaryFg }}>
                                <LinkIcon size={12} className="inline mr-1" />{u.link}
                              </a>
                            )}
                            <p className="text-[10px] mt-1" style={{ color: colors.mutedFg }}>{formatDate(u.timestamp)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Creator can post updates */}
                    {isCreator && (isActive || isFunded) && (
                      <div className="space-y-2 pt-2" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                        <textarea rows={2} placeholder="Write an update…"
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                          value={updateDesc} onChange={e => setUpdateDesc(e.target.value)} />
                        <Input placeholder="Proof link (optional)"
                          className="h-9 px-2 py-1.5 text-sm"
                          value={updateLink} onChange={e => setUpdateLink(e.target.value)} />
                        <button onClick={() => postUpdate(p.id)}
                          disabled={!!txLoading || !updateDesc}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 btn-hover"
                          style={{ background: colors.primary, color: colors.primaryText }}>
                          {txLoading === `update-${pid}` ? "Posting…" : "Post Update"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
