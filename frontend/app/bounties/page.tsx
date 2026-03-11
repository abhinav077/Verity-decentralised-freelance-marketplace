"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getBountyBoard, formatEth, formatDate, timeRemaining,
  shortenAddress, BOUNTY_STATUS, SUBMISSION_STATUS, CONTRACT_ADDRESSES, NATIVE_SYMBOL,
} from "@/lib/contracts";
import { resolveIpfsUrl } from "@/lib/ipfs";
import IpfsFileUpload from "@/components/IpfsFileUpload";
import { ethers } from "ethers";
import Link from "next/link";
import { Input } from "@/components/reactbits/Input";
import { Label } from "@/components/reactbits/Label";
import { Target } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function BountiesPage() {
  const { address, signer, provider } = useWallet();
  const { colors } = useTheme();
  const [bounties, setBounties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const configured = CONTRACT_ADDRESSES.BountyBoard !== "";

  // ── Dynamic contract params
  const [bountyVrtReward, setBountyVrtReward] = useState("5");

  // ── Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [reward, setReward] = useState("");
  const [deadline, setDeadline] = useState("");
  const [maxWinners, setMaxWinners] = useState("1");

  // ── Submit work form
  const [subDesc, setSubDesc] = useState("");
  const [subProof, setSubProof] = useState("");

  const loadBounties = useCallback(async () => {
    if (!configured || !provider) return;
    try {
      const bb = getBountyBoard(provider);
      const count = Number(await bb.bountyCounter());
      const arr: any[] = [];
      for (let i = count; i >= 1; i--) {
        try { arr.push(await bb.getBounty(i)); } catch {}
      }
      setBounties(arr);
      try { setBountyVrtReward(ethers.formatEther(await bb.BOUNTY_VRT_REWARD())); } catch {}
    } catch {} finally { setLoading(false); }
  }, [provider, configured]);

  useEffect(() => { loadBounties(); }, [loadBounties]);

  const loadSubmissions = useCallback(async (bountyId: number) => {
    if (!provider) return;
    try {
      const bb = getBountyBoard(provider);
      setSubmissions(await bb.getBountySubmissions(bountyId));
    } catch { setSubmissions([]); }
  }, [provider]);

  useEffect(() => {
    if (selectedBounty) loadSubmissions(Number(selectedBounty.id));
  }, [selectedBounty, loadSubmissions]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) return;
    setBusy(true);
    try {
      const bb = getBountyBoard(signer);
      const deadlineTs = Math.floor(new Date(deadline).getTime() / 1000);
      const tx = await bb.createBounty(title, description, category, deadlineTs, parseInt(maxWinners) || 1, {
        value: ethers.parseEther(reward),
      });
      await tx.wait();
      setShowCreate(false);
      setTitle(""); setDescription(""); setCategory(""); setReward(""); setDeadline(""); setMaxWinners("1");
      window.dispatchEvent(new Event("dfm:tx"));
      loadBounties();
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  async function handleSubmitWork(bountyId: number) {
    if (!signer) return;
    setBusy(true);
    try {
      const bb = getBountyBoard(signer);
      const tx = await bb.submitWork(bountyId, subDesc, subProof);
      await tx.wait();
      setSubDesc(""); setSubProof("");
      window.dispatchEvent(new Event("dfm:tx"));
      loadSubmissions(bountyId);
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  async function handleApprove(submissionId: number, bountyId: number) {
    if (!signer) return;
    setBusy(true);
    try {
      const tx = await getBountyBoard(signer).approveSubmission(submissionId);
      await tx.wait();
      window.dispatchEvent(new Event("dfm:tx"));
      loadSubmissions(bountyId);
      loadBounties();
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  async function handleReject(submissionId: number, bountyId: number) {
    if (!signer) return;
    setBusy(true);
    try {
      const tx = await getBountyBoard(signer).rejectSubmission(submissionId);
      await tx.wait();
      window.dispatchEvent(new Event("dfm:tx"));
      loadSubmissions(bountyId);
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  async function handleCancel(bountyId: number) {
    if (!signer) return;
    setBusy(true);
    try {
      const tx = await getBountyBoard(signer).cancelBounty(bountyId);
      await tx.wait();
      window.dispatchEvent(new Event("dfm:tx"));
      loadBounties();
      setSelectedBounty(null);
    } catch (err: any) {
      alert(err?.reason || err?.message || "Transaction failed");
    } finally { setBusy(false); }
  }

  if (!configured) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center" style={{ color: colors.muted }}>
        <p className="text-lg font-semibold">BountyBoard contract not configured</p>
        <p className="text-sm mt-2">Deploy contracts and set <code>NEXT_PUBLIC_BOUNTY_BOARD</code> in .env.local</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: colors.pageBg }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black" style={{ color: colors.pageFg }}>Bounty Board</h1>
            <p className="text-sm mt-1" style={{ color: colors.mutedFg }}>
              Open bounties with {NATIVE_SYMBOL} + {bountyVrtReward} VRT rewards — submit work, get paid
            </p>
          </div>
          {address && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold btn-hover"
              style={{ background: colors.primary, color: colors.primaryText }}
            >
              + Post Bounty
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color: colors.muted }}>Loading bounties…</div>
        ) : bounties.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
            <Target size={40} className="mb-3 mx-auto" style={{ color: colors.muted }} />
            <p className="font-semibold text-lg" style={{ color: colors.pageFg }}>No bounties yet</p>
            <p className="text-sm mt-1" style={{ color: colors.muted }}>Be the first to post a bounty!</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bounties.map((b) => {
              const status = Number(b.status);
              return (
                <div
                  key={b.id.toString()}
                  onClick={() => setSelectedBounty(b)}
                  className="rounded-2xl border p-5 cursor-pointer card-hover"
                  style={{ background: colors.cardBg, borderColor: colors.cardBorder }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: status === 0 ? colors.successBg : status === 1 ? colors.infoBg : colors.dangerBg,
                        color: status === 0 ? colors.successText : status === 1 ? colors.infoText : colors.dangerText,
                      }}>
                      {BOUNTY_STATUS[status] || "Unknown"}
                    </span>
                    <span className="text-xs" style={{ color: colors.muted }}>{timeRemaining(b.deadline)}</span>
                  </div>
                  <h3 className="font-bold text-base mb-1 line-clamp-1" style={{ color: colors.pageFg }}>{b.title}</h3>
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: colors.mutedFg }}>{b.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm" style={{ color: colors.primaryFg }}>
                      {formatEth(b.reward)} {NATIVE_SYMBOL}
                    </span>
                    <span className="text-xs" style={{ color: colors.muted }}>
                      {Number(b.approvedCount)}/{Number(b.maxWinners)} winners
                    </span>
                  </div>
                  {b.category && (
                    <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: colors.badgeBg, color: colors.badgeText }}>
                      {b.category}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Bounty Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: colors.cardBg }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4" style={{ color: colors.pageFg }}>Post a Bounty</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label className="mb-1 block text-xs font-medium">Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} required />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">Description</Label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={3}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none focus:ring-2"
                  style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg } as any} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs font-medium">Category</Label>
                  <Input value={category} onChange={e => setCategory(e.target.value)} required />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">Reward ({NATIVE_SYMBOL})</Label>
                  <Input type="number" step="0.001" min="0.001" value={reward} onChange={e => setReward(e.target.value)} required
                    className="font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs font-medium">Deadline</Label>
                  <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} required />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">Max Winners</Label>
                  <Input type="number" min="1" max="100" value={maxWinners} onChange={e => setMaxWinners(e.target.value)} required
                    className="font-mono" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border btn-outline-hover"
                  style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 btn-hover"
                  style={{ background: colors.primary, color: colors.primaryText }}>
                  {busy ? "Posting…" : "Post Bounty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bounty Detail Modal ── */}
      {selectedBounty && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBounty(null)}>
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: colors.cardBg }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.pageFg }}>{selectedBounty.title}</h2>
                <p className="text-xs mt-1" style={{ color: colors.muted }}>
                  Posted by <Link href={`/profile/${selectedBounty.poster}`} className="underline">{shortenAddress(selectedBounty.poster)}</Link>
                  {" · "}{formatDate(selectedBounty.createdAt)} · {timeRemaining(selectedBounty.deadline)}
                </p>
              </div>
              <button onClick={() => setSelectedBounty(null)} className="text-xl" style={{ color: colors.muted }}>&times;</button>
            </div>
            <p className="text-sm mb-4 whitespace-pre-wrap" style={{ color: colors.pageFg }}>{selectedBounty.description}</p>
            <div className="flex gap-4 mb-6">
              <div className="rounded-xl px-4 py-2" style={{ background: colors.primaryLight }}>
                <p className="text-xs" style={{ color: colors.muted }}>Reward</p>
                <p className="font-mono font-bold" style={{ color: colors.primaryFg }}>{formatEth(selectedBounty.reward)} {NATIVE_SYMBOL}</p>
              </div>
              <div className="rounded-xl px-4 py-2" style={{ background: colors.surfaceBg }}>
                <p className="text-xs" style={{ color: colors.muted }}>Winners</p>
                <p className="font-bold" style={{ color: colors.pageFg }}>{Number(selectedBounty.approvedCount)}/{Number(selectedBounty.maxWinners)}</p>
              </div>
              <div className="rounded-xl px-4 py-2" style={{ background: colors.surfaceBg }}>
                <p className="text-xs" style={{ color: colors.muted }}>Status</p>
                <p className="font-bold" style={{ color: colors.pageFg }}>{BOUNTY_STATUS[Number(selectedBounty.status)]}</p>
              </div>
            </div>

            {/* Cancel button for poster */}
            {address?.toLowerCase() === selectedBounty.poster.toLowerCase() && Number(selectedBounty.status) === 0 && (
              <button onClick={() => handleCancel(Number(selectedBounty.id))} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg mb-4"
                style={{ background: colors.dangerBg, color: colors.dangerText }}>
                {busy ? "Cancelling…" : "Cancel Bounty"}
              </button>
            )}

            {/* Submit work form */}
            {address && Number(selectedBounty.status) === 0 && address.toLowerCase() !== selectedBounty.poster.toLowerCase() && (
              <div className="rounded-xl border p-4 mb-4" style={{ borderColor: colors.cardBorder }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: colors.pageFg }}>Submit Your Work</h3>
                <textarea value={subDesc} onChange={e => setSubDesc(e.target.value)} rows={2} placeholder="Describe your submission…"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none mb-2"
                  style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }} />
                <Input value={subProof} onChange={e => setSubProof(e.target.value)} placeholder="IPFS proof hash (optional)"
                  className="mb-2 font-mono" />
                <IpfsFileUpload
                  label="Upload Proof File"
                  compact
                  existingCid={subProof || undefined}
                  onUpload={(cid) => setSubProof(cid)}
                />
                <button onClick={() => handleSubmitWork(Number(selectedBounty.id))} disabled={busy || !subDesc}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 btn-hover"
                  style={{ background: colors.primary, color: colors.primaryText }}>
                  {busy ? "Submitting…" : "Submit Work"}
                </button>
              </div>
            )}

            {/* Submissions list */}
            <h3 className="text-sm font-semibold mb-2" style={{ color: colors.pageFg }}>
              Submissions ({submissions.length})
            </h3>
            {submissions.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: colors.muted }}>No submissions yet</p>
            ) : (
              <div className="space-y-2">
                {submissions.map((s, i) => {
                  const subStatus = Number(s.status);
                  const isPoster = address?.toLowerCase() === selectedBounty.poster.toLowerCase();
                  return (
                    <div key={i} className="rounded-xl border p-3" style={{ borderColor: colors.cardBorder }}>
                      <div className="flex items-center justify-between mb-1">
                        <Link href={`/profile/${s.submitter}`} className="text-xs font-mono underline" style={{ color: colors.primaryFg }}>
                          {shortenAddress(s.submitter)}
                        </Link>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: subStatus === 0 ? colors.warningBg : subStatus === 1 ? colors.successBg : colors.dangerBg,
                            color: subStatus === 0 ? colors.warningText : subStatus === 1 ? colors.successText : colors.dangerText,
                          }}>
                          {SUBMISSION_STATUS[subStatus]}
                        </span>
                      </div>
                      <p className="text-sm mb-1" style={{ color: colors.pageFg }}>{s.description}</p>
                      {s.ipfsProof && (
                        <a href={resolveIpfsUrl(s.ipfsProof)} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono hover:underline" style={{ color: colors.primaryFg }}>
                          Proof: {s.ipfsProof.length > 20 ? s.ipfsProof.slice(0, 10) + "…" + s.ipfsProof.slice(-6) : s.ipfsProof} ↗
                        </a>
                      )}
                      {isPoster && subStatus === 0 && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleApprove(Number(s.id), Number(selectedBounty.id))} disabled={busy}
                            className="text-xs px-3 py-1 rounded-lg font-medium btn-hover"
                            style={{ background: colors.successBg, color: colors.successText }}>
                            Approve
                          </button>
                          <button onClick={() => handleReject(Number(s.id), Number(selectedBounty.id))} disabled={busy}
                            className="text-xs px-3 py-1 rounded-lg font-medium btn-hover"
                            style={{ background: colors.dangerBg, color: colors.dangerText }}>
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
