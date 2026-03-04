"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getSubContracting, getJobMarket, getProvider, formatEth, formatDate,
  shortenAddress, SUB_CONTRACT_STATUS, CONTRACT_ADDRESSES,
} from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

function SubContractsInner() {
  const { address, signer, provider } = useWallet();
  const { colors } = useTheme();
  const searchParams = useSearchParams();
  const configured = CONTRACT_ADDRESSES.SubContracting !== "";

  const [tab, setTab] = useState<"open" | "mine">("open");
  const [openSubs, setOpenSubs] = useState<any[]>([]);
  const [mySubs, setMySubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [applications, setApplications] = useState<Record<string, string[]>>({});

  // Create form
  const [parentJob, setParentJob] = useState(searchParams.get("jobId") || "");
  const [desc, setDesc] = useState("");
  const [payment, setPayment] = useState("");
  const [subAddr, setSubAddr] = useState(""); // optional — empty = open listing

  // Job title cache for display
  const [jobTitles, setJobTitles] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!configured || !provider) return;
    setLoading(true);
    try {
      const sc = getSubContracting(provider);
      const [open, mine] = await Promise.all([
        sc.getOpenSubContracts(),
        address ? sc.getUserSubContracts(address) : [],
      ]);
      setOpenSubs([...open]);
      setMySubs([...mine]);

      // Load applications for open subs where user is primary
      if (address) {
        const appMap: Record<string, string[]> = {};
        for (const s of open) {
          if (s.primaryFreelancer.toLowerCase() === address.toLowerCase()) {
            const apps = await sc.getApplications(s.id);
            appMap[s.id.toString()] = [...apps];
          }
        }
        // Also check my subs that are open
        for (const s of mine) {
          if (Number(s.status) === 0 && s.primaryFreelancer.toLowerCase() === address.toLowerCase()) {
            const apps = await sc.getApplications(s.id);
            appMap[s.id.toString()] = [...apps];
          }
        }
        setApplications(appMap);
      }

      // Load job titles for display
      const jm = getJobMarket(provider);
      const allSubs = [...open, ...mine];
      const jobIds = [...new Set(allSubs.map((s: any) => s.parentJobId.toString()))];
      const titles: Record<string, string> = {};
      for (const jid of jobIds) {
        try {
          const j: any = await jm.getJob(jid);
          titles[jid] = j.title || `Job #${jid}`;
        } catch { titles[jid] = `Job #${jid}`; }
      }
      setJobTitles(titles);
    } catch { setOpenSubs([]); setMySubs([]); }
    finally { setLoading(false); }
  }, [provider, configured, address]);

  useEffect(() => { load(); }, [load]);

  // Auto open create form if jobId param is present
  useEffect(() => {
    if (searchParams.get("jobId") && address) setShowCreate(true);
  }, [searchParams, address]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); window.dispatchEvent(new Event("dfm:tx")); load(); }
    catch (err: any) { alert(err?.reason || err?.message || "Transaction failed"); }
    finally { setBusy(null); }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    run("creating", async () => {
      const sc = getSubContracting(signer!);
      const sub = subAddr.trim() || ethers.ZeroAddress;
      const tx = await sc.createSubContract(Number(parentJob), sub, desc, {
        value: ethers.parseEther(payment),
      });
      await tx.wait();
      setShowCreate(false); setParentJob(""); setSubAddr(""); setDesc(""); setPayment("");
    });
  };

  const handleApply = (scId: bigint) => run(`apply-${scId}`, async () => {
    const tx = await getSubContracting(signer!).applyForSubContract(scId);
    await tx.wait();
  });

  const handleAssign = (scId: bigint, sub: string) => {
    if (!confirm(`Assign ${shortenAddress(sub)} as the sub-contractor?`)) return;
    run(`assign-${scId}`, async () => {
      const tx = await getSubContracting(signer!).assignSubContractor(scId, sub);
      await tx.wait();
    });
  };

  const handleAction = (scId: bigint, action: string) => run(`${action}-${scId}`, async () => {
    const sc = getSubContracting(signer!);
    const tx = await (sc as any)[action](scId);
    await tx.wait();
  });

  const inputStyle = { background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg };

  if (!configured) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center" style={{ color: colors.muted }}>
        <p className="text-lg font-semibold">SubContracting contract not configured</p>
      </div>
    );
  }

  const renderCard = (s: any, showActions: boolean) => {
    const status = Number(s.status);
    const isPrimary = address?.toLowerCase() === s.primaryFreelancer.toLowerCase();
    const isSub = address?.toLowerCase() === s.subContractor?.toLowerCase();
    const isOpen = status === 0;
    const scKey = s.id.toString();
    const apps = applications[scKey] || [];
    const alreadyApplied = apps.some((a: string) => a.toLowerCase() === address?.toLowerCase());

    return (
      <div key={scKey} className="rounded-2xl border p-5 card-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: isOpen ? colors.primaryLight : status === 3 ? colors.successBg : status === 4 ? colors.dangerBg : colors.infoBg,
                  color: isOpen ? colors.primaryFg : status === 3 ? colors.successText : status === 4 ? colors.dangerText : colors.infoText,
                }}>
                {SUB_CONTRACT_STATUS[status] || "Unknown"}
              </span>
              <span className="text-xs" style={{ color: colors.muted }}>
                {jobTitles[s.parentJobId.toString()] || `Job #${s.parentJobId.toString()}`}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: colors.pageFg }}>{s.description}</p>
            <p className="text-xs mt-2" style={{ color: colors.muted }}>
              Posted by{" "}
              <Link href={`/profile/${s.primaryFreelancer}`} style={{ color: colors.primaryFg }} className="hover:underline">
                {isPrimary ? "You" : shortenAddress(s.primaryFreelancer)}
              </Link>
              {s.subContractor && s.subContractor !== ethers.ZeroAddress && (
                <> → Assigned to{" "}
                  <Link href={`/profile/${s.subContractor}`} style={{ color: colors.primaryFg }} className="hover:underline">
                    {isSub ? "You" : shortenAddress(s.subContractor)}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="font-mono font-bold" style={{ color: colors.primaryFg }}>{formatEth(s.payment)} ETH</p>
            <p className="text-xs" style={{ color: colors.muted }}>{formatDate(s.createdAt)}</p>
          </div>
        </div>

        {showActions && (
          <div className="space-y-2 pt-3" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
            {/* Open listing — non-owner can apply */}
            {isOpen && !isPrimary && address && (
              alreadyApplied ? (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: colors.successBg, color: colors.successText }}>
                  ✓ You have applied
                </p>
              ) : (
                <button onClick={() => handleApply(s.id)} disabled={!!busy}
                  className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-hover"
                  style={{ background: colors.primary, color: colors.primaryText }}>
                  {busy === `apply-${s.id}` ? "Applying…" : "🙋 Apply for this Sub-Contract"}
                </button>
              )
            )}

            {/* Open listing — owner sees applicants & can assign */}
            {isOpen && isPrimary && apps.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: colors.mutedFg }}>
                  Applicants ({apps.length})
                </p>
                <div className="space-y-1.5">
                  {apps.map((applicant: string) => (
                    <div key={applicant} className="flex items-center justify-between rounded-lg px-3 py-2 border"
                      style={{ borderColor: colors.cardBorder }}>
                      <Link href={`/profile/${applicant}`} className="text-xs font-mono hover:underline" style={{ color: colors.primaryFg }}>
                        {shortenAddress(applicant)}
                      </Link>
                      <button onClick={() => handleAssign(s.id, applicant)} disabled={!!busy}
                        className="text-xs px-3 py-1 rounded-lg font-medium disabled:opacity-50 btn-hover"
                        style={{ background: colors.successBg, color: colors.successText }}>
                        {busy === `assign-${s.id}` ? "…" : "Assign"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isOpen && isPrimary && apps.length === 0 && (
              <p className="text-xs" style={{ color: colors.muted }}>No applicants yet — waiting for freelancers to apply</p>
            )}

            {/* Active — sub can submit work */}
            {status === 1 && isSub && (
              <button onClick={() => handleAction(s.id, "submitWork")} disabled={!!busy}
                className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-hover"
                style={{ background: colors.primary, color: colors.primaryText }}>
                {busy === `submitWork-${s.id}` ? "Submitting…" : "📦 Submit Work"}
              </button>
            )}

            {/* Submitted — primary can approve */}
            {status === 2 && isPrimary && (
              <button onClick={() => handleAction(s.id, "approveWork")} disabled={!!busy}
                className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-hover"
                style={{ background: colors.successText, color: "#fff" }}>
                {busy === `approveWork-${s.id}` ? "Approving…" : "✓ Approve & Release Payment"}
              </button>
            )}

            {/* Primary can cancel open or active */}
            {isPrimary && (status === 0 || status === 1) && (
              <button onClick={() => { if (!confirm("Cancel and refund?")) return; handleAction(s.id, "cancelSubContract"); }}
                disabled={!!busy}
                className="w-full border rounded-lg py-2 text-xs disabled:opacity-50 btn-outline-hover"
                style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                {busy === `cancelSubContract-${s.id}` ? "Cancelling…" : "Cancel Sub-Contract"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: colors.pageBg }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black" style={{ color: colors.pageFg }}>Sub-Contracts</h1>
            <p className="text-sm mt-1" style={{ color: colors.mutedFg }}>
              Post work listings or apply to help other freelancers
            </p>
          </div>
          {address && (
            <button onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold btn-hover"
              style={{ background: colors.primary, color: colors.primaryText }}>
              + Post Sub-Contract
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 rounded-xl p-1" style={{ background: colors.inputBg }}>
          {(["open", "mine"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === t
                ? { background: colors.cardBg, color: colors.pageFg, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                : { color: colors.mutedFg }}>
              {t === "open" ? `Open Listings (${openSubs.length})` : `My Sub-Contracts (${mySubs.length})`}
            </button>
          ))}
        </div>

        {!address ? (
          <p className="text-sm py-12 text-center" style={{ color: colors.muted }}>Connect wallet to view sub-contracts</p>
        ) : loading ? (
          <p className="text-sm py-12 text-center animate-pulse" style={{ color: colors.muted }}>Loading…</p>
        ) : (
          <>
            {tab === "open" && (
              openSubs.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                  <p className="text-4xl mb-3">🔗</p>
                  <p className="font-semibold" style={{ color: colors.pageFg }}>No open sub-contract listings</p>
                  <p className="text-sm mt-1" style={{ color: colors.muted }}>Post one to delegate work to other freelancers</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {openSubs.map(s => renderCard(s, true))}
                </div>
              )
            )}
            {tab === "mine" && (
              mySubs.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                  <p className="text-4xl mb-3">📋</p>
                  <p className="font-semibold" style={{ color: colors.pageFg }}>No sub-contracts yet</p>
                  <p className="text-sm mt-1" style={{ color: colors.muted }}>Create or apply for one to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mySubs.map(s => renderCard(s, true))}
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl p-6" style={{ background: colors.cardBg }} onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-1" style={{ color: colors.pageFg }}>Post a Sub-Contract</h2>
            <p className="text-xs mb-4" style={{ color: colors.muted }}>
              Leave &quot;Sub-Contractor Address&quot; empty to create an open listing that anyone can apply to.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.mutedFg }}>Parent Job ID</label>
                <input type="number" min="1" value={parentJob} onChange={e => setParentJob(e.target.value)} required
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none font-mono"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.mutedFg }}>
                  Sub-Contractor Address <span className="font-normal text-xs">(optional — leave empty for open listing)</span>
                </label>
                <input value={subAddr} onChange={e => setSubAddr(e.target.value)} placeholder="0x… or leave empty"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none font-mono"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.mutedFg }}>Work Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} required rows={3}
                  placeholder="Describe the work you want completed…"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.mutedFg }}>Payment (ETH)</label>
                <input type="number" step="0.001" min="0.001" value={payment} onChange={e => setPayment(e.target.value)} required
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none font-mono"
                  style={inputStyle} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border btn-outline-hover"
                  style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                <button type="submit" disabled={!!busy}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 btn-hover"
                  style={{ background: colors.primary, color: colors.primaryText }}>
                  {busy === "creating" ? "Creating…" : subAddr.trim() ? "Create (Direct)" : "Post Open Listing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubContractsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh] animate-pulse">Loading…</div>}>
      <SubContractsInner />
    </Suspense>
  );
}
