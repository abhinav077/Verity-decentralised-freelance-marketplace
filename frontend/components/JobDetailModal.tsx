"use client";
import { useState, useEffect, useCallback } from "react";
import { ethers, JsonRpcSigner } from "ethers";
import { getJobMarket, getDisputeResolution, getUserProfile, formatEth, formatDate, shortenAddress, JOB_STATUS, chatKey, chatReadKey, timeRemaining, NATIVE_SYMBOL } from "@/lib/contracts";
import { useTheme } from "@/context/ThemeContext";
import Link from "next/link";
import ReviewModal from "@/components/ReviewModal";
import TaskBoard from "@/components/TaskBoard";
import { Input } from "@/components/reactbits/Input";
import { Label } from "@/components/reactbits/Label";
import { Star, ClipboardList, Package, Heart, MessageCircle, Video, Handshake, Users, Lock, AlertTriangle, PenLine, Pencil, Clock } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Job {
  id: bigint; client: string; title: string; description: string; category: string;
  budget: bigint; deadline: bigint; status: number; selectedFreelancer: string;
  acceptedBidId: bigint; createdAt: bigint; deliveredAt: bigint;
  milestoneCount: bigint; sealedBidding: boolean; expectedDays: bigint;
}
interface Bid {
  id: bigint; jobId: bigint; freelancer: string; amount: bigint;
  completionDays: bigint; proposal: string; timestamp: bigint; isActive: boolean;
}
interface Settlement {
  jobId: bigint; proposer: string; percentComplete: bigint;
  freelancerPercent: bigint; active: boolean;
}

interface Props {
  job: Job;
  signer: JsonRpcSigner | null;
  currentAddress: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

export default function JobDetailModal({ job, signer, currentAddress, onClose, onRefresh }: Props) {
  const { colors } = useTheme();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [bidDays, setBidDays] = useState("");
  const [bidProposal, setBidProposal] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [showBidForm, setShowBidForm] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [txLoading, setTxLoading] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showTaskBoard, setShowTaskBoard] = useState(false);

  // Dispute state
  const [activeDisputeId, setActiveDisputeId] = useState<bigint | null>(null);
  const [disputeInitiator, setDisputeInitiator] = useState<string | null>(null);
  const [disputeResponseSubmitted, setDisputeResponseSubmitted] = useState(false);
  const [disputeCreatedAt, setDisputeCreatedAt] = useState<bigint | null>(null);
  const [responseText, setResponseText] = useState("");
  const [showResponseForm, setShowResponseForm] = useState(false);

  // Settlement state
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [settlePct, setSettlePct] = useState("50");
  const [settleFreelancerPct, setSettleFreelancerPct] = useState("50");

  // Milestone state
  const [milestones, setMilestones] = useState<{title: string; amount: bigint; status: number}[]>([]);

  // Tip state
  const [showTipForm, setShowTipForm] = useState(false);
  const [tipAmount, setTipAmount] = useState("");

  // On-chain configurable params
  const [autoReleasePeriod, setAutoReleasePeriod] = useState<number | null>(null);
  const [responsePeriodDays, setResponsePeriodDays] = useState<number | null>(null);

  const isClient = currentAddress?.toLowerCase() === job.client.toLowerCase();
  const isFreelancer = currentAddress?.toLowerCase() === job.selectedFreelancer.toLowerCase();
  const hasAlreadyBid = bids.some(b => b.freelancer.toLowerCase() === currentAddress?.toLowerCase());

  // Escape key handler (only if review modal not showing)
  useEffect(() => {
    if (showReview) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showReview, onClose]);

  const [liveStatus, setLiveStatus] = useState(job.status);
  const [blockTimestamp, setBlockTimestamp] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => { setLiveStatus(job.status); }, [job.status]);
  useEffect(() => {
    if (!signer) return;
    getJobMarket(signer).getJob(job.id)
      .then((j: any) => setLiveStatus(Number(j.status)))
      .catch(() => {});
    // Load configurable params
    getJobMarket(signer).AUTO_RELEASE_PERIOD()
      .then((v: bigint) => setAutoReleasePeriod(Number(v)))
      .catch(() => {});
    getDisputeResolution(signer).RESPONSE_PERIOD()
      .then((v: bigint) => setResponsePeriodDays(Number(v) / 86400))
      .catch(() => {});
    // Fetch on-chain block timestamp for L6
    signer.provider?.getBlock("latest")
      .then((b) => { if (b) setBlockTimestamp(b.timestamp); })
      .catch(() => {});
  }, [job.id, signer]);

  // Load bids — for sealed bid jobs, non-client freelancers can't see others' bids
  useEffect(() => {
    if (!signer) return;
    const jm = getJobMarket(signer);
    jm.getJobBids(job.id).then((b: Bid[]) => {
      let filtered = [...b];
      // Sealed bidding: freelancers can only see their own bid
      if (job.sealedBidding && !isClient && currentAddress) {
        filtered = filtered.filter(
          bid => bid.freelancer.toLowerCase() === currentAddress.toLowerCase()
        );
      }
      setBids(filtered);
      setLoadingBids(false);
    }).catch(() => setLoadingBids(false));
  }, [job.id, job.sealedBidding, signer, isClient, currentAddress]);

  // Load settlement info
  useEffect(() => {
    if (!signer) return;
    const jm = getJobMarket(signer);
    jm.getSettlement(job.id).then((s: any) => {
      if (s && s.active) setSettlement(s);
    }).catch(() => {});
  }, [job.id, signer]);

  // Load milestones
  useEffect(() => {
    if (!signer || Number(job.milestoneCount) === 0) return;
    getJobMarket(signer).getJobMilestones(job.id).then((ms: any[]) => {
      setMilestones(ms.map((m: any) => ({ title: m.title, amount: m.amount, status: Number(m.status) })));
    }).catch(() => {});
  }, [job.id, job.milestoneCount, signer]);

  // Auto-show review for completed
  useEffect(() => {
    if (!signer || !currentAddress || liveStatus !== 2) return;
    if (!isClient && !isFreelancer) return;
    const reviewee = isClient ? job.selectedFreelancer : job.client;
    getUserProfile(signer).hasReviewed(job.id, currentAddress, reviewee)
      .then((reviewed: boolean) => { if (!reviewed) setShowReview(true); })
      .catch(() => {});
  }, [job.id, liveStatus, signer, currentAddress, isClient, isFreelancer, job.selectedFreelancer, job.client]);

  // Load dispute info
  useEffect(() => {
    if (!signer || liveStatus !== 4) return;
    const dr = getDisputeResolution(signer);
    setActiveDisputeId(null); setDisputeInitiator(null);
    setDisputeResponseSubmitted(false); setDisputeCreatedAt(null);
    dr.getDisputesByJob(job.id).then(async (ids: bigint[]) => {
      if (!ids || ids.length === 0) return;
      const lastId = ids[ids.length - 1];
      const dispute: any = await dr.getDispute(lastId);
      if (!dispute || dispute.id === 0n) return;
      setActiveDisputeId(dispute.id); setDisputeInitiator(dispute.initiator);
      setDisputeResponseSubmitted(dispute.responseSubmitted); setDisputeCreatedAt(dispute.createdAt);
      if (!dispute.responseSubmitted && currentAddress &&
          dispute.initiator.toLowerCase() !== currentAddress.toLowerCase() &&
          (dispute.client.toLowerCase() === currentAddress.toLowerCase() ||
           dispute.freelancer.toLowerCase() === currentAddress.toLowerCase())) {
        setShowResponseForm(true);
      }
    }).catch(() => {});
  }, [job.id, liveStatus, signer, currentAddress]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setTxLoading(label); setTxError(null);
    try { await fn(); window.dispatchEvent(new Event("dfm:tx")); onRefresh(); }
    catch (e: any) { setTxError(e?.reason || e?.message?.split("(")[0] || "Transaction failed"); }
    finally { setTxLoading(null); }
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const placeBid = () => run("Placing bid…", async () => {
    const jm = getJobMarket(signer!);
    const fn = jm.getFunction("placeBid(uint256,uint256,uint256,string)");
    const tx = await fn(job.id, ethers.parseEther(bidAmount), bidDays ? parseInt(bidDays) : 0, bidProposal);
    await tx.wait(); setShowBidForm(false);
  });

  const acceptBid = (bid: Bid) => {
    if (!confirm(`Accept this bid for ${formatEth(bid.amount)} ${NATIVE_SYMBOL}? Funds will be locked in escrow.`)) return;
    run("Accepting bid…", async () => {
      const tx = await getJobMarket(signer!).acceptBid(bid.id, { value: bid.amount });
      await tx.wait();
    });
  };

  const deliverJob = () => run("Delivering…", async () => {
    const tx = await getJobMarket(signer!).deliverJob(job.id);
    await tx.wait();
  });

  const completeJob = () => run("Completing job…", async () => {
    const tx = await getJobMarket(signer!).completeJob(job.id);
    await tx.wait();
    try {
      localStorage.removeItem(chatKey(job.id));
      localStorage.removeItem(chatReadKey(job.id, job.client));
      localStorage.removeItem(chatReadKey(job.id, job.selectedFreelancer));
    } catch {}
    setShowReview(true);
  });

  const cancelJob = () => {
    if (!confirm("Are you sure you want to cancel this job? This cannot be undone.")) return;
    run("Cancelling job…", async () => {
      const tx = await getJobMarket(signer!).cancelJob(job.id);
      await tx.wait();
      try {
        localStorage.removeItem(chatKey(job.id));
        localStorage.removeItem(chatReadKey(job.id, job.client));
        localStorage.removeItem(chatReadKey(job.id, job.selectedFreelancer));
      } catch {}
    });
  };

  const raiseDispute = () => run("Raising dispute…", async () => {
    const tx = await getDisputeResolution(signer!).raiseDispute(
      job.id, job.client, job.selectedFreelancer, disputeReason
    );
    await tx.wait(); setShowDisputeForm(false);
  });

  const submitResponse = () => run("Submitting response…", async () => {
    if (!activeDisputeId) return;
    const tx = await getDisputeResolution(signer!).submitResponse(activeDisputeId, responseText);
    await tx.wait(); setDisputeResponseSubmitted(true); setShowResponseForm(false);
  });

  const withdrawDisputeAction = () => {
    if (!confirm("Cancel this dispute? The job will return to In Progress.")) return;
    run("Cancelling dispute…", async () => {
      if (!activeDisputeId) return;
      const tx = await getDisputeResolution(signer!).withdrawDispute(activeDisputeId);
      await tx.wait();
    });
  };

  // ─── On-chain revision ────────────────────────────────────────────────────
  const requestRevision = () => run("Requesting revision…", async () => {
    const tx = await getJobMarket(signer!).requestRevision(job.id);
    await tx.wait();
  });

  // ─── Settlement ───────────────────────────────────────────────────────────
  const requestSettlementAction = () => run("Requesting settlement…", async () => {
    const tx = await getJobMarket(signer!).requestSettlement(
      job.id, parseInt(settlePct), parseInt(settleFreelancerPct)
    );
    await tx.wait();
    setShowSettlementForm(false);
    // Reload settlement
    const s = await getJobMarket(signer!).getSettlement(job.id);
    if (s && s.active) setSettlement(s);
  });

  const respondToSettlement = (accept: boolean) => run(accept ? "Accepting settlement…" : "Rejecting settlement…", async () => {
    const tx = await getJobMarket(signer!).respondToSettlement(job.id, accept);
    await tx.wait();
    setSettlement(null);
  });

  // ─── Milestones ──────────────────────────────────────────────────────────
  const submitMilestone = (idx: number) => run(`Submitting milestone ${idx + 1}…`, async () => {
    const tx = await getJobMarket(signer!).submitMilestone(job.id, idx);
    await tx.wait();
    // Reload milestones
    const ms = await getJobMarket(signer!).getJobMilestones(job.id);
    setMilestones(ms.map((m: any) => ({ title: m.title, amount: m.amount, status: Number(m.status) })));
  });

  const approveMilestone = (idx: number) => run(`Approving milestone ${idx + 1}…`, async () => {
    const tx = await getJobMarket(signer!).approveMilestone(job.id, idx);
    await tx.wait();
    const ms = await getJobMarket(signer!).getJobMilestones(job.id);
    setMilestones(ms.map((m: any) => ({ title: m.title, amount: m.amount, status: Number(m.status) })));
  });

  // ─── Tip ─────────────────────────────────────────────────────────────────
  const tipFreelancer = () => run("Sending tip…", async () => {
    const tx = await getJobMarket(signer!).tipFreelancer(job.id, { value: ethers.parseEther(tipAmount) });
    await tx.wait();
    setShowTipForm(false); setTipAmount("");
  });

  // ─── Withdraw bid ────────────────────────────────────────────────────────
  const withdrawBid = (bidId: bigint) => run("Withdrawing bid…", async () => {
    const tx = await getJobMarket(signer!).withdrawBid(bidId);
    await tx.wait();
  });

  // Style helpers
  const btnPrimary = { background: colors.primary, color: colors.primaryText };
  const btnOutline = { borderColor: colors.cardBorder, color: colors.mutedFg };
  const inputStyle = { background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: colors.cardBg }}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 gap-4" style={{ borderBottom: `1px solid ${colors.cardBorder}` }}>
          <div>
            <span className="text-xs font-medium px-2 py-1 rounded-full"
              style={{ background: colors.primaryLight, color: colors.primaryFg }}>{job.category}</span>
            {job.sealedBidding && <span className="text-xs font-medium px-2 py-1 rounded-full ml-1"
              style={{ background: colors.warningBg, color: colors.warningText }}><Lock size={12} className="inline" /> Sealed</span>}
            <h2 className="text-xl font-bold mt-2" style={{ color: colors.pageFg }}>{job.title}</h2>
            {(() => {
              const accepted = bids.find(b => b.id === job.acceptedBidId);
              return (
                <p className="text-sm mt-1" style={{ color: colors.muted }}>
                  {JOB_STATUS[liveStatus]}
                  {accepted ? (
                    <> · Price: <strong>{formatEth(accepted.amount)} {NATIVE_SYMBOL}</strong>
                      {Number(accepted.completionDays) > 0 && <> · {Number(accepted.completionDays)} days</>}
                      <span className="text-xs ml-1">(budget: {formatEth(job.budget)})</span>
                    </>
                  ) : (
                    <> · Budget: <strong>{formatEth(job.budget)} {NATIVE_SYMBOL}</strong></>
                  )}
                  {" · Deadline: "}{formatDate(job.deadline)}
                  {!accepted && Number(job.expectedDays) > 0 && <> · Expected: {Number(job.expectedDays)} days</>}
                </p>
              );
            })()}
          </div>
          {showReview ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2.5 py-1.5 rounded-lg font-medium hidden sm:block border"
                style={{ background: colors.warningBg, color: colors.warningText, borderColor: colors.warningText + "44" }}>
                <Star size={14} className="inline" /> Review required
              </span>
              <button disabled title="Submit your review first"
                className="text-2xl leading-none shrink-0 cursor-not-allowed" style={{ color: colors.muted }}>&times;</button>
            </div>
          ) : (
            <button onClick={onClose} className="text-2xl leading-none shrink-0" style={{ color: colors.muted }}>&times;</button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: colors.mutedFg }}>Description</h3>
            <p className="text-sm leading-relaxed" style={{ color: colors.pageFg }}>{job.description}</p>
            <p className="text-xs mt-2" style={{ color: colors.muted }}>
              Posted by{" "}
              <Link href={`/profile/${job.client}`} style={{ color: colors.primaryFg }} className="hover:underline">
                {isClient ? "You" : shortenAddress(job.client)}
              </Link>
              {job.selectedFreelancer && job.selectedFreelancer !== ethers.ZeroAddress && (
                <> · Freelancer:{" "}
                  <Link href={`/profile/${job.selectedFreelancer}`} style={{ color: colors.primaryFg }} className="hover:underline">
                    {isFreelancer ? "You" : shortenAddress(job.selectedFreelancer)}
                  </Link>
                </>
              )}
            </p>
          </div>

          {/* Error */}
          {txError && <div className="text-sm rounded-lg p-3" style={{ background: colors.dangerBg, color: colors.dangerText }}>{txError}</div>}

          {/* ─── Open job: bid form ──────────────────────────────── */}
          {liveStatus === 0 && signer && (
            <div className="space-y-3">
              {/* Sealed bid info banner */}
              {job.sealedBidding && (
                <div className="rounded-xl p-4 border" style={{ background: colors.warningBg, borderColor: colors.warningText + "33" }}>
                  <p className="font-semibold text-sm" style={{ color: colors.warningText }}><Lock size={14} className="inline mr-1" />Sealed Bid Job</p>
                  <p className="text-xs mt-1" style={{ color: colors.warningText }}>
                    {isClient
                      ? "You can see all bids. Freelancers can only see their own bid."
                      : "Your bid is private — only the client can see it."}
                  </p>
                </div>
              )}

              {!isClient && !hasAlreadyBid && (
                showBidForm ? (
                  <div className="rounded-xl p-4 space-y-3 border" style={{ borderColor: colors.cardBorder }}>
                    <h4 className="font-semibold" style={{ color: colors.pageFg }}>Place a Bid</h4>
                    <Input type="number" step="0.001" placeholder={`Your bid in ${NATIVE_SYMBOL} (can be above budget)`}
                      containerClassName="w-full"
                      value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
                    <Input type="number" min="1" placeholder="Completion days (how many days you need)"
                      containerClassName="w-full"
                      value={bidDays} onChange={e => setBidDays(e.target.value)} />
                    <textarea rows={3} placeholder="Your proposal…"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                      value={bidProposal} onChange={e => setBidProposal(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => setShowBidForm(false)}
                        className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                      <button onClick={placeBid} disabled={!!txLoading || !bidAmount || !bidProposal}
                        className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover" style={btnPrimary}>
                        {txLoading === "Placing bid…" ? "Placing…" : "Submit Bid"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowBidForm(true)}
                    className="w-full rounded-lg py-2.5 text-sm font-medium btn-hover" style={btnPrimary}>Place a Bid</button>
                )
              )}
              {!isClient && hasAlreadyBid && (
                <div className="rounded-lg p-3 text-sm border" style={{ background: colors.successBg, borderColor: colors.successText + "44", color: colors.successText }}>
                  ✓ You have already placed a bid on this job.
                </div>
              )}
              {isClient && (
                <button onClick={cancelJob} disabled={!!txLoading}
                  className="w-full border rounded-lg py-2 text-sm"
                  style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                  {txLoading === "Cancelling job…" ? "Cancelling…" : "Cancel Job"}
                </button>
              )}
            </div>
          )}

          {/* ─── In-progress job ──────────────────────────────── */}
          {liveStatus === 1 && signer && (
            <div className="space-y-3">
              {(isClient || isFreelancer) && (
                <>
                  <Link href={`/chat/${job.id.toString()}`}
                    className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                    style={{ background: colors.primaryLight, borderColor: colors.primary + "33", color: colors.primaryFg }}>
                    <MessageCircle size={16} /> Open Chat
                  </Link>
                  <a href={`https://meet.jit.si/verity-job-${job.id.toString()}`} target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                    style={{ background: colors.infoBg, borderColor: colors.infoText + "33", color: colors.infoText }}>
                    <Video size={16} /> Start Video Call
                  </a>
                  <button onClick={() => setShowTaskBoard(true)}
                    className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                    style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>
                    <ClipboardList size={16} /> Task Board
                  </button>
                </>
              )}
              {/* Sub-contracting link for freelancer */}
              {isFreelancer && (
                <Link href={`/sub-contracts?jobId=${job.id.toString()}`}
                  className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                  style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>
                  <Handshake size={16} /> Sub-Contract Part of This Job
                </Link>
              )}
              {/* Milestones */}
              {milestones.length > 0 && (isClient || isFreelancer) && (
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <h4 className="text-sm font-semibold" style={{ color: colors.mutedFg }}>Milestones</h4>
                  {milestones.map((ms, idx) => {
                    const msStatus = ms.status === 0 ? "Pending" : ms.status === 1 ? "Submitted" : "Approved";
                    const msColor = ms.status === 0 ? colors.muted : ms.status === 1 ? colors.warningText : colors.successText;
                    return (
                      <div key={idx} className="flex items-center justify-between rounded-lg px-3 py-2 border"
                        style={{ borderColor: colors.cardBorder }}>
                        <div>
                          <p className="text-sm font-medium" style={{ color: colors.pageFg }}>{ms.title || `Milestone ${idx + 1}`}</p>
                          <p className="text-xs" style={{ color: colors.muted }}>{formatEth(ms.amount)} {NATIVE_SYMBOL} · <span style={{ color: msColor }}>{msStatus}</span></p>
                        </div>
                        {ms.status === 0 && isFreelancer && (
                          <button onClick={() => submitMilestone(idx)} disabled={!!txLoading}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                            style={{ background: colors.primary, color: colors.primaryText }}>Submit</button>
                        )}
                        {ms.status === 1 && isClient && (
                          <button onClick={() => approveMilestone(idx)} disabled={!!txLoading}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                            style={{ background: colors.successText, color: "#fff" }}>Approve</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {isFreelancer && (
                <button onClick={deliverJob} disabled={!!txLoading}
                  className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                  style={{ background: "#7c3aed", color: "#fff" }}>
                  {txLoading === "Delivering…" ? "Delivering…" : <><Package size={16} className="inline mr-1" />Mark as Delivered</>}
                </button>
              )}
              {isClient && (
                <button onClick={completeJob} disabled={!!txLoading}
                  className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                  style={{ background: colors.successText, color: "#fff" }}>
                  {txLoading === "Completing job…" ? "Completing…" : "✓ Mark as Complete & Release Payment"}
                </button>
              )}
              {/* Settlement — both parties can propose during InProgress */}
              {(isClient || isFreelancer) && !showSettlementForm && !showDisputeForm && (
                <button onClick={() => setShowSettlementForm(true)}
                  className="w-full border rounded-lg py-2 text-sm"
                  style={{ borderColor: colors.infoText + "55", color: colors.infoText }}>
                  <Handshake size={14} className="inline mr-1" />Propose Settlement
                </button>
              )}
              {showSettlementForm && (
                <div className="rounded-xl p-4 space-y-3 border" style={{ background: colors.infoBg, borderColor: colors.infoText + "33" }}>
                  <h4 className="font-semibold" style={{ color: colors.pageFg }}>Propose a Settlement</h4>
                  <p className="text-xs" style={{ color: colors.muted }}>Suggest partial payment to end the job amicably.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1 block text-xs">% Complete</Label>
                      <Input type="number" min="0" max="100" value={settlePct}
                        onChange={e => setSettlePct(String(Math.min(100, Math.max(0, parseInt(e.target.value) || 0))))}
                        className="h-9 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Freelancer gets %</Label>
                      <Input type="number" min="0" max="100" value={settleFreelancerPct}
                        onChange={e => setSettleFreelancerPct(String(Math.min(100, Math.max(0, parseInt(e.target.value) || 0))))}
                        className="h-9 px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  {(() => {
                    const ab = bids.find(b => b.id === job.acceptedBidId);
                    const amt = ab ? ab.amount : job.budget;
                    try {
                      const pct = BigInt(parseInt(settleFreelancerPct) || 0);
                      return (
                        <p className="text-xs" style={{ color: colors.infoText }}>
                          Freelancer would receive ≈ {formatEth(amt * pct / 100n)} {NATIVE_SYMBOL} of {formatEth(amt)} escrowed
                        </p>
                      );
                    } catch {
                      return (
                        <p className="text-xs" style={{ color: colors.infoText }}>
                          Freelancer would receive ≈ 0 {NATIVE_SYMBOL} of {formatEth(amt)} escrowed
                        </p>
                      );
                    }
                  })()}
                  <div className="flex gap-2">
                    <button onClick={() => setShowSettlementForm(false)}
                      className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                    <button onClick={requestSettlementAction} disabled={!!txLoading}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.infoText, color: "#fff" }}>
                      {txLoading === "Requesting settlement…" ? "Sending…" : "Propose"}
                    </button>
                  </div>
                </div>
              )}
              {/* Active settlement from other party */}
              {settlement && settlement.active && settlement.proposer.toLowerCase() !== currentAddress?.toLowerCase() && (
                <div className="rounded-xl p-4 border space-y-3" style={{ background: colors.infoBg, borderColor: colors.infoText + "33" }}>
                  <p className="font-semibold text-sm" style={{ color: colors.infoText }}><Handshake size={14} className="inline mr-1" />Settlement Proposal</p>
                  {(() => {
                    const ab = bids.find(b => b.id === job.acceptedBidId);
                    const amt = ab ? ab.amount : job.budget;
                    return (
                      <p className="text-sm" style={{ color: colors.pageFg }}>
                        {Number(settlement.percentComplete)}% complete, freelancer gets {Number(settlement.freelancerPercent)}% of escrowed funds
                        ({formatEth(amt * settlement.freelancerPercent / 100n)} {NATIVE_SYMBOL})
                      </p>
                    );
                  })()}
                  <div className="flex gap-2">
                    <button onClick={() => respondToSettlement(true)} disabled={!!txLoading}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.successText, color: "#fff" }}>
                      {txLoading === "Accepting settlement…" ? "Accepting…" : "✓ Accept"}</button>
                    <button onClick={() => respondToSettlement(false)} disabled={!!txLoading}
                      className="flex-1 border rounded-lg py-2 text-sm disabled:opacity-60"
                      style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                      {txLoading === "Rejecting settlement…" ? "Rejecting…" : "✗ Reject"}</button>
                  </div>
                </div>
              )}
              {(isClient || isFreelancer) && !showDisputeForm && !showSettlementForm && (
                <button onClick={() => setShowDisputeForm(true)}
                  className="w-full border rounded-lg py-2 text-sm"
                  style={{ borderColor: colors.warningText + "66", color: colors.warningText }}>Raise Dispute</button>
              )}
              {showDisputeForm && (
                <div className="rounded-xl p-4 space-y-3 border" style={{ background: colors.warningBg, borderColor: colors.warningText + "33" }}>
                  <h4 className="font-semibold" style={{ color: colors.pageFg }}>Raise a Dispute</h4>
                  <p className="text-xs" style={{ color: colors.muted }}>The other party will have {responsePeriodDays != null ? (Number.isInteger(responsePeriodDays) ? responsePeriodDays : responsePeriodDays.toFixed(1)) : "…"} day{responsePeriodDays !== 1 ? "s" : ""} to submit their side.</p>
                  <textarea rows={3} placeholder="Describe your reason…"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                    value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowDisputeForm(false)}
                      className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                    <button onClick={raiseDispute} disabled={!!txLoading || !disputeReason}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.warningText, color: "#fff" }}>
                      {txLoading === "Raising dispute…" ? "Submitting…" : "Raise Dispute"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Delivered job ──────────────────────────────────── */}
          {liveStatus === 5 && signer && (
            <div className="space-y-3">
              <div className="rounded-xl p-4 border" style={{ background: "#ede9fe", borderColor: "#7c3aed33" }}>
                <p className="font-semibold text-sm" style={{ color: "#7c3aed" }}><Package size={14} className="inline mr-1" />Work has been delivered</p>
                <p className="text-xs mt-1" style={{ color: "#6d28d9" }}>
                  Delivered {formatDate(job.deliveredAt)}. Auto-release in {autoReleasePeriod != null ? timeRemaining(Number(job.deliveredAt) + autoReleasePeriod) : "…"}.
                </p>
              </div>

              {(isClient || isFreelancer) && (
                <>
                  <Link href={`/chat/${job.id.toString()}`}
                    className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                    style={{ background: colors.primaryLight, borderColor: colors.primary + "33", color: colors.primaryFg }}>
                    <MessageCircle size={16} /> Open Chat
                  </Link>
                  <a href={`https://meet.jit.si/verity-job-${job.id.toString()}`} target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                    style={{ background: colors.infoBg, borderColor: colors.infoText + "33", color: colors.infoText }}>
                    <Video size={16} /> Start Video Call
                  </a>
                </>
              )}

              {/* Client-only: approve + revision */}
              {isClient && (
                <>
                  <button onClick={completeJob} disabled={!!txLoading}
                    className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                    style={{ background: colors.successText, color: "#fff" }}>
                    {txLoading === "Completing job…" ? "Completing…" : "✓ Approve & Release Payment"}
                  </button>
                  <button onClick={requestRevision} disabled={!!txLoading}
                    className="w-full border rounded-lg py-2 text-sm disabled:opacity-60"
                    style={{ borderColor: "#7c3aed55", color: "#7c3aed" }}>
                    {txLoading === "Requesting revision…" ? "Requesting…" : <><Pencil size={14} className="inline mr-1" />Request Revision</>}
                  </button>
                </>
              )}

              {/* Settlement — both parties can propose or respond */}
              {(isClient || isFreelancer) && settlement && settlement.active && settlement.proposer.toLowerCase() !== currentAddress?.toLowerCase() && (
                <div className="rounded-xl p-4 border space-y-3" style={{ background: colors.infoBg, borderColor: colors.infoText + "33" }}>
                  <p className="font-semibold text-sm" style={{ color: colors.infoText }}><Handshake size={14} className="inline mr-1" />Settlement Proposal</p>
                  {(() => {
                    const ab = bids.find(b => b.id === job.acceptedBidId);
                    const amt = ab ? ab.amount : job.budget;
                    return (
                      <p className="text-sm" style={{ color: colors.pageFg }}>
                        {Number(settlement.percentComplete)}% complete, freelancer gets {Number(settlement.freelancerPercent)}% of escrowed funds
                        ({formatEth(amt * settlement.freelancerPercent / 100n)} {NATIVE_SYMBOL})
                      </p>
                    );
                  })()}
                  <div className="flex gap-2">
                    <button onClick={() => respondToSettlement(true)} disabled={!!txLoading}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.successText, color: "#fff" }}>
                      {txLoading === "Accepting settlement…" ? "Accepting…" : "✓ Accept"}</button>
                    <button onClick={() => respondToSettlement(false)} disabled={!!txLoading}
                      className="flex-1 border rounded-lg py-2 text-sm disabled:opacity-60"
                      style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                      {txLoading === "Rejecting settlement…" ? "Rejecting…" : "✗ Reject"}</button>
                  </div>
                </div>
              )}
              {(isClient || isFreelancer) && (!settlement || !settlement.active) && !showSettlementForm && !showDisputeForm && (
                <button onClick={() => setShowSettlementForm(true)}
                  className="w-full border rounded-lg py-2 text-sm"
                  style={{ borderColor: colors.infoText + "55", color: colors.infoText }}>
                  <Handshake size={14} className="inline mr-1" />Propose Settlement
                </button>
              )}
              {showSettlementForm && (
                <div className="rounded-xl p-4 space-y-3 border" style={{ background: colors.infoBg, borderColor: colors.infoText + "33" }}>
                  <h4 className="font-semibold" style={{ color: colors.pageFg }}>Propose a Settlement</h4>
                  <p className="text-xs" style={{ color: colors.muted }}>Suggest partial payment to end the job amicably.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1 block text-xs">% Complete</Label>
                      <Input type="number" min="0" max="100" value={settlePct}
                        onChange={e => setSettlePct(String(Math.min(100, Math.max(0, parseInt(e.target.value) || 0))))}
                        className="h-9 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Freelancer gets %</Label>
                      <Input type="number" min="0" max="100" value={settleFreelancerPct}
                        onChange={e => setSettleFreelancerPct(String(Math.min(100, Math.max(0, parseInt(e.target.value) || 0))))}
                        className="h-9 px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  {(() => {
                    const ab = bids.find(b => b.id === job.acceptedBidId);
                    const amt = ab ? ab.amount : job.budget;
                    try {
                      const pct = BigInt(parseInt(settleFreelancerPct) || 0);
                      return (
                        <p className="text-xs" style={{ color: colors.infoText }}>
                          Freelancer would receive ≈ {formatEth(amt * pct / 100n)} {NATIVE_SYMBOL} of {formatEth(amt)} escrowed
                        </p>
                      );
                    } catch {
                      return (
                        <p className="text-xs" style={{ color: colors.infoText }}>
                          Freelancer would receive ≈ 0 {NATIVE_SYMBOL} of {formatEth(amt)} escrowed
                        </p>
                      );
                    }
                  })()}
                  <div className="flex gap-2">
                    <button onClick={() => setShowSettlementForm(false)}
                      className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                    <button onClick={requestSettlementAction} disabled={!!txLoading}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.infoText, color: "#fff" }}>
                      {txLoading === "Requesting settlement…" ? "Sending…" : "Propose"}
                    </button>
                  </div>
                </div>
              )}

              {/* Dispute — both parties */}
              {(isClient || isFreelancer) && !showDisputeForm && !showSettlementForm && (
                <button onClick={() => setShowDisputeForm(true)}
                  className="w-full border rounded-lg py-2 text-sm"
                  style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                  Raise Dispute
                </button>
              )}
              {showDisputeForm && (
                <div className="rounded-xl p-4 space-y-3 border" style={{ background: colors.warningBg, borderColor: colors.warningText + "33" }}>
                  <h4 className="font-semibold" style={{ color: colors.pageFg }}>Raise a Dispute</h4>
                  <p className="text-xs" style={{ color: colors.muted }}>The other party will have {responsePeriodDays != null ? (Number.isInteger(responsePeriodDays) ? responsePeriodDays : responsePeriodDays.toFixed(1)) : "…"} day{responsePeriodDays !== 1 ? "s" : ""} to submit their side.</p>
                  <textarea rows={3} placeholder="Describe the issue…"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                    value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowDisputeForm(false)}
                      className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                    <button onClick={raiseDispute} disabled={!!txLoading || !disputeReason}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.warningText, color: "#fff" }}>
                      {txLoading === "Raising dispute…" ? "Submitting…" : "Raise Dispute"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Disputed job ──────────────────────────────────── */}
          {liveStatus === 4 && signer && (
            <div className="space-y-3">
              {(isClient || isFreelancer) && (
                <div className="border rounded-xl p-4" style={{
                  background: activeDisputeId && disputeInitiator && currentAddress?.toLowerCase() === disputeInitiator.toLowerCase()
                    ? colors.warningBg : colors.dangerBg,
                  borderColor: activeDisputeId && disputeInitiator && currentAddress?.toLowerCase() === disputeInitiator.toLowerCase()
                    ? colors.warningText + "44" : colors.dangerText + "44",
                }}>
                  {activeDisputeId && disputeInitiator ? (
                    currentAddress?.toLowerCase() === disputeInitiator.toLowerCase() ? (
                      <>
                        <p className="font-semibold text-sm" style={{ color: colors.warningText }}><AlertTriangle size={14} className="inline mr-1" />You raised a dispute</p>
                        <p className="text-xs mt-1" style={{ color: colors.warningText }}>
                          You can cancel below. Voting on the <a href="/disputes" className="underline font-medium">Disputes page</a>.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-sm" style={{ color: colors.dangerText }}><AlertTriangle size={14} className="inline mr-1" />A dispute has been raised</p>
                        <p className="text-xs mt-1" style={{ color: colors.dangerText }}>
                          {disputeResponseSubmitted
                            ? <>Your response submitted. Voting on <a href="/disputes" className="underline font-medium">Disputes page</a>.</>
                            : <>Submit your side then the community votes on <a href="/disputes" className="underline font-medium">Disputes page</a>.</>}
                        </p>
                      </>
                    )
                  ) : (
                    <p className="font-semibold text-sm" style={{ color: colors.dangerText }}><AlertTriangle size={14} className="inline mr-1" />A dispute has been raised</p>
                  )}
                </div>
              )}

              {(isClient || isFreelancer) && (
                <Link href={`/chat/${job.id.toString()}`}
                  className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                  style={{ background: colors.primaryLight, borderColor: colors.primary + "33", color: colors.primaryFg }}>
                  <MessageCircle size={16} /> Open Chat
                </Link>
              )}

              {/* Cancel dispute (initiator only) */}
              {activeDisputeId && disputeInitiator &&
               currentAddress?.toLowerCase() === disputeInitiator.toLowerCase() && (() => {
                const within12h = disputeCreatedAt != null && blockTimestamp < Number(disputeCreatedAt) + 12 * 3600;
                const canWithdraw = !disputeResponseSubmitted || within12h;
                return canWithdraw ? (
                  <button onClick={withdrawDisputeAction} disabled={!!txLoading}
                    className="w-full border rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                    style={{ borderColor: colors.warningText + "55", color: colors.warningText }}>
                    {txLoading === "Cancelling dispute…" ? "Cancelling…" : "↩ Cancel Dispute"}
                  </button>
                ) : (
                  <div className="rounded-lg p-3 text-xs border" style={{ background: colors.inputBg, borderColor: colors.cardBorder, color: colors.muted }}>
                    <Lock size={14} className="inline mr-1" />Cancellation window closed.
                  </div>
                );
              })()}

              {/* Submit response (non-initiator) */}
              {activeDisputeId && disputeInitiator &&
               currentAddress?.toLowerCase() !== disputeInitiator.toLowerCase() &&
               (isClient || isFreelancer) && (
                !disputeResponseSubmitted ? (
                  showResponseForm ? (
                    <div className="rounded-xl p-4 space-y-3 border" style={{ background: colors.infoBg, borderColor: colors.infoText + "33" }}>
                      <h4 className="font-semibold" style={{ color: colors.pageFg }}>Submit Your Side</h4>
                      <textarea rows={3} placeholder="Explain your side…"
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                        value={responseText} onChange={e => setResponseText(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={() => setShowResponseForm(false)}
                          className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                        <button onClick={submitResponse} disabled={!!txLoading || !responseText}
                          className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                          style={{ background: colors.infoText, color: "#fff" }}>
                          {txLoading === "Submitting response…" ? "Submitting…" : "Submit Response"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowResponseForm(true)}
                      className="w-full border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                      style={{ borderColor: colors.infoText + "55", color: colors.infoText }}>
                      <PenLine size={14} className="inline mr-1" />Submit Your Side of the Dispute
                    </button>
                  )
                ) : (
                  <div className="rounded-lg p-3 text-sm border" style={{ background: colors.successBg, borderColor: colors.successText + "44", color: colors.successText }}>
                    ✓ Your response has been submitted.
                  </div>
                )
              )}
            </div>
          )}

          {/* ─── Completed job ──────────────────────────────────── */}
          {liveStatus === 2 && signer && (isClient || isFreelancer) && (
            <div className="space-y-3">
              <div className="rounded-xl p-4 border" style={{ background: colors.successBg, borderColor: colors.successText + "33" }}>
                <p className="font-semibold text-sm" style={{ color: colors.successText }}>✓ Job Completed</p>
                <p className="text-xs mt-1" style={{ color: colors.successText }}>
                  Payment has been released to the freelancer.
                </p>
              </div>
              {/* Tip freelancer (client only) */}
              {isClient && (
                showTipForm ? (
                  <div className="rounded-xl p-4 space-y-3 border" style={{ borderColor: colors.cardBorder }}>
                    <h4 className="font-semibold flex items-center gap-1.5" style={{ color: colors.pageFg }}><Heart size={16} /> Send a Tip</h4>
                    <p className="text-xs" style={{ color: colors.muted }}>Show your appreciation with an extra payment.</p>
                    <Input type="number" step="0.001" min="0.001" placeholder={`Tip amount in ${NATIVE_SYMBOL}`}
                      containerClassName="w-full"
                      value={tipAmount} onChange={e => setTipAmount(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => { setShowTipForm(false); setTipAmount(""); }}
                        className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                      <button onClick={tipFreelancer} disabled={!!txLoading || !tipAmount}
                        className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                        style={btnPrimary}>
                        {txLoading === "Sending tip…" ? "Sending…" : "Send Tip"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowTipForm(true)}
                    className="w-full border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                    style={{ borderColor: colors.primary + "55", color: colors.primaryFg }}>
                    <Heart size={16} className="inline mr-1" />Tip Freelancer
                  </button>
                )
              )}
            </div>
          )}

          {/* ─── Cancelled job ──────────────────────────────────── */}
          {liveStatus === 3 && (
            <div className="rounded-xl p-4 border" style={{ background: colors.inputBg, borderColor: colors.cardBorder }}>
              <p className="font-semibold text-sm" style={{ color: colors.muted }}>Job Cancelled</p>
              <p className="text-xs mt-1" style={{ color: colors.muted }}>This job has been cancelled.</p>
            </div>
          )}

          {/* ─── Bids section ──────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: colors.mutedFg }}>
              Bids {!loadingBids && `(${bids.length})`}
              {job.sealedBidding && !isClient && (
                <span className="text-xs font-normal ml-2" style={{ color: colors.muted }}>
                  (sealed — only your bid is visible)
                </span>
              )}
            </h3>
            {loadingBids ? (
              <p className="text-sm" style={{ color: colors.muted }}>Loading bids…</p>
            ) : bids.length === 0 ? (
              <p className="text-sm" style={{ color: colors.muted }}>No bids yet.</p>
            ) : (
              <div className="space-y-3">
                {bids.map(bid => (
                  <div key={bid.id.toString()} className="border rounded-xl p-4"
                    style={{
                      borderColor: bid.id === job.acceptedBidId ? colors.successText + "55" : colors.cardBorder,
                      background: bid.id === job.acceptedBidId ? colors.successBg : "transparent",
                    }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: colors.primaryFg }}>
                          {formatEth(bid.amount)} {NATIVE_SYMBOL}
                          {bid.amount > job.budget && (
                            <span className="text-xs ml-1" style={{ color: colors.warningText }}>above budget</span>
                          )}
                        </p>
                        <p className="text-xs font-mono mt-0.5" style={{ color: colors.muted }}>
                          {bid.freelancer.toLowerCase() === currentAddress?.toLowerCase() ? "You" : shortenAddress(bid.freelancer)}
                          {Number(bid.completionDays) > 0 && (
                            <span className="ml-2 font-sans"><Clock size={12} className="inline mr-0.5" />{Number(bid.completionDays)} days</span>
                          )}
                          {bid.id === job.acceptedBidId && (
                            <span className="ml-2 font-medium" style={{ color: colors.successText }}>✓ Accepted</span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {isClient && liveStatus === 0 && bid.isActive && (
                          <button onClick={() => acceptBid(bid)} disabled={!!txLoading}
                            className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-60"
                            style={btnPrimary}>
                            {txLoading === "Accepting bid…" ? "…" : "Accept"}
                          </button>
                        )}
                        {!isClient && bid.freelancer.toLowerCase() === currentAddress?.toLowerCase() && liveStatus === 0 && bid.isActive && (
                          <button onClick={() => withdrawBid(bid.id)} disabled={!!txLoading}
                            className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-60"
                            style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                            {txLoading === "Withdrawing bid…" ? "…" : "Withdraw"}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm mt-2 leading-relaxed" style={{ color: colors.pageFg }}>{bid.proposal}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {showReview && signer && (isClient || isFreelancer) && (
      <ReviewModal jobId={job.id}
        revieweeAddress={isClient ? job.selectedFreelancer : job.client}
        revieweeLabel={isClient ? "Freelancer" : "Client"}
        jobTitle={job.title} signer={signer} mandatory
        onClose={() => setShowReview(false)}
        onSuccess={() => { setShowReview(false); onRefresh(); onClose(); }} />
    )}

    {showTaskBoard && (
      <TaskBoard jobId={job.id.toString()} onClose={() => setShowTaskBoard(false)} readOnly={isClient} />
    )}
    </>
  );
}
