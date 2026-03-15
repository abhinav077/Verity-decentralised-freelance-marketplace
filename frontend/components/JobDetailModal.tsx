"use client";
import { useState, useEffect, useCallback } from "react";
import { ethers, JsonRpcSigner } from "ethers";
import { getJobMarket, getDisputeResolution, getUserProfile, formatEth, formatDate, shortenAddress, timeRemaining, NATIVE_SYMBOL } from "@/lib/contracts";
import { extractTransactionError, getExpectedChainId, getExpectedChainLabel, normalizeDecimalInput } from "@/lib/tx";
import { useTheme } from "@/context/ThemeContext";
import Link from "next/link";
import ReviewModal from "@/components/ReviewModal";
import TaskBoard from "@/components/TaskBoard";
import IpfsFileUpload from "@/components/IpfsFileUpload";
import { Input } from "@/components/reactbits/Input";
import { Label } from "@/components/reactbits/Label";
import { Star, ClipboardList, Package, Heart, MessageCircle, Video, Handshake, Users, Lock, AlertTriangle, PenLine, Pencil, Clock, Briefcase, Calendar, X, Trash2 } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Job {
  id: bigint; client: string; title: string; description: string; category: string;
  budget: bigint; deadline: bigint; status: number; selectedFreelancer: string;
  acceptedBidId: bigint; createdAt: bigint; deliveredAt: bigint;
  milestoneCount: bigint; sealedBidding: boolean; expectedDays: bigint;
  deliveryProof?: string;
  deliveryDescription?: string;
  tipGiven?: boolean;
  revisionRequested?: boolean;
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
  initialShowBid?: boolean;
}

export default function JobDetailModal({ job, signer, currentAddress, onClose, onRefresh, initialShowBid }: Props) {
  const { colors } = useTheme();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [bidDays, setBidDays] = useState("");
  const [bidProposal, setBidProposal] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidenceHash, setDisputeEvidenceHash] = useState("");
  const [disputeDemandPct, setDisputeDemandPct] = useState("50");
  const [showBidForm, setShowBidForm] = useState(initialShowBid ?? false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [txLoading, setTxLoading] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showTaskBoard, setShowTaskBoard] = useState(false);

  // Dispute state
  const [activeDisputeId, setActiveDisputeId] = useState<bigint | null>(null);
  const [disputeInitiator, setDisputeInitiator] = useState<string | null>(null);
  const [disputeResponseSubmitted, setDisputeResponseSubmitted] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseEvidenceHash, setResponseEvidenceHash] = useState("");
  const [responseDemandPct, setResponseDemandPct] = useState("50");
  const [showResponseForm, setShowResponseForm] = useState(false);

  // Settlement state
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [settlePct, setSettlePct] = useState("50");
  const [settleFreelancerPct, setSettleFreelancerPct] = useState("50");

  // Milestone state
  const [milestones, setMilestones] = useState<{title: string; amount: bigint; status: number; submissionProof: string; submissionDescription: string; submittedAt: bigint}[]>([]);
  const [milestoneProofInputs, setMilestoneProofInputs] = useState<Record<number, string>>({});
  const [milestoneDescriptionInputs, setMilestoneDescriptionInputs] = useState<Record<number, string>>({});

  // Tip state
  const [showTipForm, setShowTipForm] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [deliveryProofCid, setDeliveryProofCid] = useState("");
  const [deliveryDescription, setDeliveryDescription] = useState("");
  const [onChainDeliveryProof, setOnChainDeliveryProof] = useState(job.deliveryProof || "");
  const [onChainDeliveryDescription, setOnChainDeliveryDescription] = useState(job.deliveryDescription || "");
  const [tipGiven, setTipGiven] = useState(Boolean(job.tipGiven));
  const [revisionRequested, setRevisionRequested] = useState(Boolean(job.revisionRequested));

  useEffect(() => {
    setOnChainDeliveryProof(job.deliveryProof || "");
    setOnChainDeliveryDescription(job.deliveryDescription || "");
    setTipGiven(Boolean(job.tipGiven));
    setRevisionRequested(Boolean(job.revisionRequested));
  }, [job.deliveryProof, job.deliveryDescription, job.tipGiven, job.revisionRequested]);

  // On-chain configurable params
  const [autoReleasePeriod, setAutoReleasePeriod] = useState<number | null>(null);
  const [responsePeriodDays, setResponsePeriodDays] = useState<number | null>(null);

  const isClient = currentAddress?.toLowerCase() === job.client.toLowerCase();
  const isFreelancer = currentAddress?.toLowerCase() === job.selectedFreelancer.toLowerCase();
  const hasAlreadyBid = bids.some(b => b.freelancer.toLowerCase() === currentAddress?.toLowerCase());
  const hasMilestones = Number(job.milestoneCount) > 0;
  const allMilestonesApproved = milestones.length > 0 && milestones.every((m) => m.status === 3);

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
      .then((j: any) => {
        setLiveStatus(Number(j.status));
        setOnChainDeliveryProof(j.deliveryProof || "");
        setOnChainDeliveryDescription(j.deliveryDescription || "");
        setTipGiven(Boolean(j.tipGiven));
        setRevisionRequested(Boolean(j.revisionRequested));
      })
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
  const reloadMilestones = useCallback(async () => {
    if (!signer || Number(job.milestoneCount) === 0) return;
    const ms = await getJobMarket(signer).getJobMilestones(job.id);
    setMilestones(ms.map((m: any) => ({
      title: m.title,
      amount: m.amount,
      status: Number(m.status),
      submissionProof: m.submissionProof || "",
      submissionDescription: m.submissionDescription || "",
      submittedAt: m.submittedAt || 0n,
    })));
  }, [job.id, job.milestoneCount, signer]);

  useEffect(() => {
    reloadMilestones().catch(() => {});
  }, [reloadMilestones]);

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
    setDisputeResponseSubmitted(false);
    dr.getDisputesByJob(job.id).then(async (ids: bigint[]) => {
      if (!ids || ids.length === 0) return;
      const lastId = ids[ids.length - 1];
      const dispute: any = await dr.getDispute(lastId);
      if (!dispute || dispute.id === 0n) return;
      setActiveDisputeId(dispute.id); setDisputeInitiator(dispute.initiator);
      setDisputeResponseSubmitted(dispute.responseSubmitted);
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
    catch (e: unknown) { setTxError(extractTransactionError(e)); }
    finally { setTxLoading(null); }
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const placeBid = () => run("Placing bid…", async () => {
    if (!signer) throw new Error("Connect your wallet to place a bid.");
    if (!signer.provider) throw new Error("Wallet provider unavailable. Reconnect your wallet and try again.");

    const network = await signer.provider.getNetwork();
    if (Number(network.chainId) !== getExpectedChainId()) {
      throw new Error(`Switch your wallet to ${getExpectedChainLabel()} before placing a bid.`);
    }
    if (liveStatus !== 0) throw new Error("This job is no longer open for bids.");
    if (isClient) throw new Error("You cannot bid on your own job.");
    if (hasAlreadyBid) throw new Error("You have already placed a bid.");
    if (Number(job.deadline) <= blockTimestamp) throw new Error("The bidding deadline has passed.");

    const proposal = bidProposal.trim();
    if (!proposal) throw new Error("Enter a short proposal before submitting your bid.");

    const normalizedAmount = normalizeDecimalInput(bidAmount);
    let amount: bigint;
    try {
      amount = ethers.parseEther(normalizedAmount);
    } catch {
      throw new Error(`Enter a valid ${NATIVE_SYMBOL} amount.`);
    }
    if (amount <= 0n) throw new Error("Enter a bid amount greater than 0.");

    const completionDaysText = bidDays.trim();
    const completionDays = completionDaysText ? Number.parseInt(completionDaysText, 10) : 0;
    if (!Number.isInteger(completionDays) || completionDays < 0) {
      throw new Error("Completion days must be a whole number.");
    }

    const jm = getJobMarket(signer);
    const fn = jm.getFunction("placeBid(uint256,uint256,uint256,string)");
    await fn.staticCall(job.id, amount, completionDays, proposal);

    let gasLimit: bigint | undefined;
    try {
      const estimate = await fn.estimateGas(job.id, amount, completionDays, proposal);
      gasLimit = estimate + estimate / 5n;
    } catch {}

    const tx = gasLimit
      ? await fn(job.id, amount, completionDays, proposal, { gasLimit })
      : await fn(job.id, amount, completionDays, proposal);
    await tx.wait();
    setShowBidForm(false);
    setBidAmount("");
    setBidDays("");
    setBidProposal("");
  });

  const acceptBid = (bid: Bid) => {
    if (!confirm(`Accept this bid for ${formatEth(bid.amount)} ${NATIVE_SYMBOL}? Funds will be locked in escrow.`)) return;
    run("Accepting bid…", async () => {
      const tx = await getJobMarket(signer!).acceptBid(bid.id, { value: bid.amount });
      await tx.wait();
    });
  };

  const deliverJob = () => run("Delivering…", async () => {
    const proof = deliveryProofCid.trim();
    if (!proof) throw new Error("Upload delivery proof before marking as delivered.");
    const fn = getJobMarket(signer!).getFunction("deliverJob(uint256,string,string)");
    const tx = await fn(job.id, proof, deliveryDescription.trim());
    await tx.wait();
    setDeliveryProofCid("");
    setDeliveryDescription("");
    setRevisionRequested(false);
  });

  const completeJob = () => run("Completing job…", async () => {
    const tx = await getJobMarket(signer!).completeJob(job.id);
    await tx.wait();
    setShowReview(true);
  });

  const cancelJob = () => {
    if (!confirm("Are you sure you want to cancel this job? This cannot be undone.")) return;
    run("Cancelling job…", async () => {
      const tx = await getJobMarket(signer!).cancelJob(job.id);
      await tx.wait();
    });
  };

  const raiseDispute = () => run("Raising dispute…", async () => {
    const reason = disputeReason.trim();
    if (!reason) throw new Error("Please add dispute description.");
    if (!disputeEvidenceHash.trim()) throw new Error("Please upload or paste dispute evidence.");
    const demand = Number(disputeDemandPct);
    if (!Number.isFinite(demand) || demand < 0 || demand > 100) {
      throw new Error("Demand must be between 0 and 100.");
    }

    const dr = getDisputeResolution(signer!);
    await dr.raiseDisputeWithEvidenceAndDemand.staticCall(
      job.id,
      job.client,
      job.selectedFreelancer,
      reason,
      disputeEvidenceHash.trim(),
      demand,
    );
    const tx = await dr.raiseDisputeWithEvidenceAndDemand(
      job.id,
      job.client,
      job.selectedFreelancer,
      reason,
      disputeEvidenceHash.trim(),
      demand,
    );
    await tx.wait();

    setShowDisputeForm(false);
    setDisputeReason("");
    setDisputeEvidenceHash("");
    setDisputeDemandPct("50");
  });

  const submitResponse = () => run("Submitting response…", async () => {
    if (!activeDisputeId) return;
    const desc = responseText.trim();
    if (!desc) throw new Error("Please add your response description.");
    if (!responseEvidenceHash.trim()) throw new Error("Please upload or paste your evidence.");
    const demand = Number(responseDemandPct);
    if (!Number.isFinite(demand) || demand < 0 || demand > 100) {
      throw new Error("Demand must be between 0 and 100.");
    }

    const dr = getDisputeResolution(signer!);
    const tx = await dr.submitResponseWithEvidenceAndDemand(
      activeDisputeId,
      desc,
      responseEvidenceHash.trim(),
      demand,
    );
    await tx.wait();

    setDisputeResponseSubmitted(true);
    setShowResponseForm(false);
    setResponseText("");
    setResponseEvidenceHash("");
    setResponseDemandPct("50");
  });

  // ─── On-chain revision ────────────────────────────────────────────────────
  const requestRevision = () => run("Requesting revision…", async () => {
    const tx = await getJobMarket(signer!).requestRevision(job.id);
    await tx.wait();
    setRevisionRequested(true);
  });

  const approveRevisionRequest = () => run("Approving revision…", async () => {
    const tx = await getJobMarket(signer!).approveRevisionRequest(job.id);
    await tx.wait();
    setRevisionRequested(false);
    setOnChainDeliveryProof("");
    setLiveStatus(1);
  });

  const rejectRevisionRequest = () => run("Rejecting revision…", async () => {
    const tx = await getJobMarket(signer!).rejectRevisionRequest(job.id);
    await tx.wait();
    setRevisionRequested(false);
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
    const proof = (milestoneProofInputs[idx] || "").trim();
    if (!proof) throw new Error("Upload or paste milestone proof before submitting.");
    const description = (milestoneDescriptionInputs[idx] || "").trim();
    const fn = getJobMarket(signer!).getFunction("submitMilestone(uint256,uint256,string,string)");
    const tx = await fn(job.id, idx, proof, description);
    await tx.wait();
    setMilestoneProofInputs((prev) => ({ ...prev, [idx]: "" }));
    setMilestoneDescriptionInputs((prev) => ({ ...prev, [idx]: "" }));
    await reloadMilestones();
  });

  const approveMilestone = (idx: number) => run(`Approving milestone ${idx + 1}…`, async () => {
    const tx = await getJobMarket(signer!).approveMilestone(job.id, idx);
    await tx.wait();
    await reloadMilestones();
  });

  const requestMilestoneRevision = (idx: number) => run(`Requesting revision for milestone ${idx + 1}…`, async () => {
    const tx = await getJobMarket(signer!).requestMilestoneRevision(job.id, idx);
    await tx.wait();
    await reloadMilestones();
  });

  // ─── Tip ─────────────────────────────────────────────────────────────────
  const tipFreelancer = () => run("Sending tip…", async () => {
    const tx = await getJobMarket(signer!).tipFreelancer(job.id, { value: ethers.parseEther(tipAmount) });
    await tx.wait();
    setShowTipForm(false); setTipAmount("");
    setTipGiven(true);
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
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${colors.cardBorder}` }}>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: colors.primary }}>
              <Briefcase size={16} style={{ color: colors.primaryText }} />
            </span>
            <span className="text-sm font-semibold" style={{ color: colors.pageFg }}>Job Details</span>
          </div>
          {showReview ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2.5 py-1.5 rounded-lg font-medium hidden sm:block border"
                style={{ background: colors.warningBg, color: colors.warningText, borderColor: colors.warningText + "44" }}>
                <Star size={14} className="inline" /> Review required
              </span>
              <button disabled title="Submit your review first"
                className="shrink-0 cursor-not-allowed p-1" style={{ color: colors.mutedFg }}><X size={18} /></button>
            </div>
          ) : (
            <button onClick={onClose} className="shrink-0 p-1 rounded-md transition-colors hover:bg-black/5" style={{ color: colors.mutedFg }}><X size={18} /></button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold" style={{ color: colors.pageFg }}>{job.title}</h2>
          </div>

          {/* Info cards row */}
          <div className="grid grid-cols-3 gap-3">
            {(() => {
              const accepted = bids.find(b => b.id === job.acceptedBidId);
              const displayAmount = accepted ? formatEth(accepted.amount) : formatEth(job.budget);
              return (
                <div className="rounded-xl px-4 py-3" style={{ background: colors.primary }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: colors.primaryText, opacity: 0.85 }}>
                    <Briefcase size={10} /> {accepted ? "Accepted Price" : "Reward Amount"}
                  </p>
                  <p className="text-lg font-bold mt-1" style={{ color: colors.primaryText }}>{displayAmount} {NATIVE_SYMBOL}</p>
                </div>
              );
            })()}
            <div className="rounded-xl px-4 py-3 border" style={{ borderColor: colors.cardBorder }}>
              <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: colors.mutedFg }}>
                <Calendar size={10} /> Application Deadline
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: colors.pageFg }}>{formatDate(job.deadline)}</p>
            </div>
            <div className="rounded-xl px-4 py-3 border" style={{ borderColor: colors.cardBorder }}>
              <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: colors.mutedFg }}>
                <Clock size={10} /> Expected Days to Complete
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: colors.pageFg }}>
                {Number(job.expectedDays) > 0 ? `${Number(job.expectedDays)} Days` : "—"}
              </p>
            </div>
          </div>

          {/* Job Description */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: colors.pageFg }}>
              <span className="w-1 h-4 rounded-full inline-block" style={{ background: colors.primary }} />
              Job Description
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: colors.pageFg }}>{job.description}</p>
            <p className="text-xs mt-2" style={{ color: colors.mutedFg }}>
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
                  <div className="rounded-xl p-5 space-y-4 border" style={{ borderColor: colors.cardBorder }}>
                    <h4 className="font-semibold flex items-center gap-2" style={{ color: colors.pageFg }}>
                      <span className="w-1 h-4 rounded-full inline-block" style={{ background: colors.primary }} />
                      Place a Bid
                    </h4>
                    <div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider">Your Bid ({NATIVE_SYMBOL})</Label>
                          <div className="relative">
                            <Input type="number" step="0.001" placeholder="0.0000"
                              containerClassName="w-full"
                              value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: colors.mutedFg }}>{NATIVE_SYMBOL}</span>
                          </div>
                        </div>
                        <div>
                          <Label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider">Completion Days</Label>
                          <Input type="number" min="1" placeholder="e.g. 5"
                            containerClassName="w-full"
                            value={bidDays} onChange={e => setBidDays(e.target.value)} />
                          <p className="text-[10px] mt-0.5" style={{ color: colors.mutedFg }}>(how many days you need)</p>
                        </div>
                      </div>
                      <p className="text-xs mt-1.5" style={{ color: colors.primaryFg }}>
                        The client&apos;s budget is {formatEth(job.budget)} {NATIVE_SYMBOL}.
                      </p>
                      {hasMilestones && (
                        <p className="text-xs mt-1" style={{ color: colors.infoText }}>
                          This job uses {Number(job.milestoneCount)} milestone(s). Payment is released milestone-by-milestone after approval.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider">Bid Details / Proposal</Label>
                      <textarea rows={4} placeholder="Explain your proposal and why you're the best candidate..."
                        className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none" style={inputStyle}
                        value={bidProposal} onChange={e => setBidProposal(e.target.value)} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowBidForm(false)}
                        className="px-5 border rounded-lg py-2 text-sm font-medium" style={btnOutline}>Cancel</button>
                      <button onClick={placeBid} disabled={!!txLoading || !bidAmount || !bidProposal}
                        className="px-5 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover" style={btnPrimary}>
                        {txLoading === "Placing bid…" ? "Placing…" : "Submit Bid"}
                      </button>
                    </div>
                  </div>
                ) : null
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
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.mutedFg }}>Collaboration</h4>
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
                  {isFreelancer && (
                    <Link href={`/sub-contracts?jobId=${job.id.toString()}`}
                      className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                      style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>
                      <Handshake size={16} /> Sub-Contract Part of This Job
                    </Link>
                  )}
                </div>
              )}
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: colors.cardBorder }}>
                <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.mutedFg }}>Delivery</h4>
              {/* Milestones */}
              {milestones.length > 0 && (isClient || isFreelancer) && (
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <h4 className="text-sm font-semibold" style={{ color: colors.pageFg }}>Milestones</h4>
                  {milestones.map((ms, idx) => {
                    const isLastMilestone = idx + 1 === milestones.length;
                    const msStatus = ms.status === 0
                      ? "Pending"
                      : ms.status === 1
                      ? "Submitted"
                      : ms.status === 2
                      ? "Revision Requested"
                      : "Approved";
                    const msColor = ms.status === 0
                      ? colors.mutedFg
                      : ms.status === 1
                      ? colors.warningText
                      : ms.status === 2
                      ? colors.dangerText
                      : colors.successText;
                    return (
                      <div key={idx} className="flex items-center justify-between rounded-lg px-3 py-2 border"
                        style={{ borderColor: colors.cardBorder }}>
                        <div className="flex-1">
                          <p className="text-sm font-medium" style={{ color: colors.pageFg }}>{ms.title || `Milestone ${idx + 1}`}</p>
                          <p className="text-xs" style={{ color: colors.mutedFg }}>{formatEth(ms.amount)} {NATIVE_SYMBOL} · <span style={{ color: msColor }}>{msStatus}</span></p>
                          {ms.submissionProof && (
                            <p className="text-xs mt-1">
                              <a href={`https://gateway.pinata.cloud/ipfs/${ms.submissionProof}`} target="_blank" rel="noopener noreferrer"
                                className="underline" style={{ color: colors.primaryFg }}>
                                View submitted proof
                              </a>
                            </p>
                          )}
                          {ms.submissionDescription && (
                            <p className="text-xs mt-1" style={{ color: colors.mutedFg }}>
                              Notes: {ms.submissionDescription}
                            </p>
                          )}
                          {(ms.status === 0 || ms.status === 2) && isFreelancer && (
                            <div className="mt-2 space-y-2">
                              <IpfsFileUpload
                                label={milestoneProofInputs[idx] ? "Replace Milestone Proof" : "Upload Milestone Proof"}
                                compact
                                existingCid={milestoneProofInputs[idx] || undefined}
                                onUpload={(cid) => setMilestoneProofInputs((prev) => ({ ...prev, [idx]: cid }))}
                              />
                              <Input
                                placeholder="Or paste milestone proof IPFS hash / URL"
                                value={milestoneProofInputs[idx] || ""}
                                onChange={(e) => setMilestoneProofInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                              />
                              <textarea
                                rows={2}
                                placeholder="Describe what was delivered for this milestone"
                                className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                                style={inputStyle}
                                value={milestoneDescriptionInputs[idx] || ""}
                                onChange={(e) => setMilestoneDescriptionInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                              />
                            </div>
                          )}
                        </div>
                        {(ms.status === 0 || ms.status === 2) && isFreelancer && (
                          <button onClick={() => submitMilestone(idx)} disabled={!!txLoading}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                            style={{ background: colors.primary, color: colors.primaryText }}>
                            {isLastMilestone ? "Submit & Mark Delivered" : "Submit Work"}
                          </button>
                        )}
                        {ms.status === 1 && isClient && (
                          <div className="flex flex-col gap-2 items-end">
                            <button onClick={() => approveMilestone(idx)} disabled={!!txLoading}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                              style={{ background: colors.successText, color: "#fff" }}>Approve</button>
                            <button onClick={() => requestMilestoneRevision(idx)} disabled={!!txLoading}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                              style={{ border: `1px solid ${colors.dangerText}66`, color: colors.dangerText }}>Request Revision</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {isFreelancer && !hasMilestones && (
                <div className="rounded-lg p-3 border space-y-3" style={{ borderColor: colors.cardBorder }}>
                  <h4 className="text-sm font-semibold" style={{ color: colors.pageFg }}>Upload Work Before Delivery</h4>
                  <IpfsFileUpload
                    label={deliveryProofCid ? "Replace Uploaded Work" : "Upload Delivered Work"}
                    compact
                    existingCid={deliveryProofCid || undefined}
                    onUpload={(cid) => setDeliveryProofCid(cid)}
                  />
                  <textarea
                    rows={3}
                    placeholder="Add a short delivery description for the client"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    style={inputStyle}
                    value={deliveryDescription}
                    onChange={(e) => setDeliveryDescription(e.target.value)}
                  />
                  <button onClick={deliverJob} disabled={!!txLoading || !deliveryProofCid}
                    className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                    style={{ background: "#7c3aed", color: "#fff" }}>
                    {txLoading === "Delivering…" ? "Delivering…" : <><Package size={16} className="inline mr-1" />Mark as Delivered</>}
                  </button>
                </div>
              )}
              {isClient && !hasMilestones && (
                <button onClick={completeJob} disabled={!!txLoading}
                  className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                  style={{ background: colors.successText, color: "#fff" }}>
                  {txLoading === "Completing job…" ? "Completing…" : "✓ Mark as Complete & Release Payment"}
                </button>
              )}
              {isClient && hasMilestones && !allMilestonesApproved && (
                <div className="rounded-lg p-3 text-xs border" style={{ background: colors.inputBg, borderColor: colors.cardBorder, color: colors.mutedFg }}>
                  Approve each submitted milestone to continue. Final payment release is enabled after all milestones are approved.
                </div>
              )}
              </div>
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: colors.cardBorder }}>
                <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.mutedFg }}>Resolution</h4>
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
                  <p className="text-xs" style={{ color: colors.mutedFg }}>Suggest partial payment to end the job amicably.</p>
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
                  <p className="text-xs" style={{ color: colors.mutedFg }}>The other party will have {responsePeriodDays != null ? (Number.isInteger(responsePeriodDays) ? responsePeriodDays : responsePeriodDays.toFixed(1)) : "…"} day{responsePeriodDays !== 1 ? "s" : ""} to submit their side.</p>
                  <textarea rows={3} placeholder="Describe your reason…"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                    value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
                  <IpfsFileUpload
                    label={disputeEvidenceHash ? "Replace Dispute Proof" : "Upload Dispute Proof"}
                    compact
                    existingCid={disputeEvidenceHash || undefined}
                    onUpload={(cid) => setDisputeEvidenceHash(cid)}
                  />
                  <Input
                    placeholder="Or paste evidence IPFS hash / URL"
                    value={disputeEvidenceHash}
                    onChange={e => setDisputeEvidenceHash(e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Your proportion demand %"
                    value={disputeDemandPct}
                    onChange={e => setDisputeDemandPct(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => {
                      setShowDisputeForm(false);
                      setDisputeReason("");
                      setDisputeEvidenceHash("");
                      setDisputeDemandPct("50");
                    }}
                      className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                    <button onClick={raiseDispute} disabled={!!txLoading || !disputeReason.trim() || !disputeEvidenceHash.trim() || disputeDemandPct === ""}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.warningText, color: "#fff" }}>
                      {txLoading === "Raising dispute…" ? "Submitting…" : "Raise Dispute"}
                    </button>
                  </div>
                </div>
              )}
              </div>
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
                {onChainDeliveryProof && (
                  <p className="text-xs mt-2">
                    <a href={`https://gateway.pinata.cloud/ipfs/${onChainDeliveryProof}`} target="_blank" rel="noopener noreferrer"
                      className="underline" style={{ color: "#6d28d9" }}>
                      View uploaded work proof
                    </a>
                  </p>
                )}
                {onChainDeliveryDescription && (
                  <p className="text-xs mt-2" style={{ color: "#6d28d9" }}>
                    Delivery notes: {onChainDeliveryDescription}
                  </p>
                )}
              </div>

              {(isClient || isFreelancer) && (
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.mutedFg }}>Collaboration</h4>
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
                </div>
              )}

              {milestones.length > 0 && (isClient || isFreelancer) && (
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.mutedFg }}>Milestone Review</h4>
                  <h4 className="text-sm font-semibold" style={{ color: colors.mutedFg }}>Milestones</h4>
                  {milestones.map((ms, idx) => {
                    const msStatus = ms.status === 0
                      ? "Pending"
                      : ms.status === 1
                      ? "Submitted"
                      : ms.status === 2
                      ? "Revision Requested"
                      : "Approved";
                    const msColor = ms.status === 0
                      ? colors.mutedFg
                      : ms.status === 1
                      ? colors.warningText
                      : ms.status === 2
                      ? colors.dangerText
                      : colors.successText;
                    return (
                      <div key={idx} className="flex items-center justify-between rounded-lg px-3 py-2 border"
                        style={{ borderColor: colors.cardBorder }}>
                        <div className="flex-1">
                          <p className="text-sm font-medium" style={{ color: colors.pageFg }}>{ms.title || `Milestone ${idx + 1}`}</p>
                          <p className="text-xs" style={{ color: colors.mutedFg }}>{formatEth(ms.amount)} {NATIVE_SYMBOL} · <span style={{ color: msColor }}>{msStatus}</span></p>
                          {ms.submissionProof && (
                            <p className="text-xs mt-1">
                              <a href={`https://gateway.pinata.cloud/ipfs/${ms.submissionProof}`} target="_blank" rel="noopener noreferrer"
                                className="underline" style={{ color: colors.primaryFg }}>
                                View submitted proof
                              </a>
                            </p>
                          )}
                          {ms.submissionDescription && (
                            <p className="text-xs mt-1" style={{ color: colors.mutedFg }}>
                              Notes: {ms.submissionDescription}
                            </p>
                          )}
                        </div>
                        {ms.status === 1 && isClient && (
                          <div className="flex flex-col gap-2 items-end">
                            <button onClick={() => approveMilestone(idx)} disabled={!!txLoading}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                              style={{ background: colors.successText, color: "#fff" }}>Approve</button>
                            <button onClick={() => requestMilestoneRevision(idx)} disabled={!!txLoading}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                              style={{ border: `1px solid ${colors.dangerText}66`, color: colors.dangerText }}>Request Revision</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Client-only: approve + revision */}
              {isClient && (
                <>
                  {(!hasMilestones || allMilestonesApproved) && (
                    <button onClick={completeJob} disabled={!!txLoading}
                      className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.successText, color: "#fff" }}>
                      {txLoading === "Completing job…" ? "Completing…" : "✓ Approve & Release Payment"}
                    </button>
                  )}
                  {hasMilestones && !allMilestonesApproved && (
                    <div className="rounded-lg p-3 text-xs border" style={{ background: colors.inputBg, borderColor: colors.cardBorder, color: colors.mutedFg }}>
                      Final release is available after all milestones are approved.
                    </div>
                  )}
                  {!revisionRequested ? (
                    <button onClick={requestRevision} disabled={!!txLoading}
                      className="w-full border rounded-lg py-2 text-sm disabled:opacity-60"
                      style={{ borderColor: "#7c3aed55", color: "#7c3aed" }}>
                      {txLoading === "Requesting revision…" ? "Requesting…" : <><Pencil size={14} className="inline mr-1" />Request Revision</>}
                    </button>
                  ) : (
                    <div className="rounded-lg p-3 text-xs border" style={{ background: colors.warningBg, borderColor: colors.warningText + "44", color: colors.warningText }}>
                      Revision requested. Waiting for freelancer response.
                    </div>
                  )}
                </>
              )}

              {isFreelancer && revisionRequested && (
                <div className="rounded-xl p-4 border space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <p className="text-sm font-medium" style={{ color: colors.pageFg }}>Client requested a revision</p>
                  <div className="flex gap-2">
                    <button onClick={approveRevisionRequest} disabled={!!txLoading}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.successText, color: "#fff" }}>
                      {txLoading === "Approving revision…" ? "Approving…" : "Accept Revision"}
                    </button>
                    <button onClick={rejectRevisionRequest} disabled={!!txLoading}
                      className="flex-1 border rounded-lg py-2 text-sm disabled:opacity-60"
                      style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                      {txLoading === "Rejecting revision…" ? "Rejecting…" : "Reject Revision"}
                    </button>
                  </div>
                </div>
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
                  <p className="text-xs" style={{ color: colors.mutedFg }}>Suggest partial payment to end the job amicably.</p>
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
                  <p className="text-xs" style={{ color: colors.mutedFg }}>The other party will have {responsePeriodDays != null ? (Number.isInteger(responsePeriodDays) ? responsePeriodDays : responsePeriodDays.toFixed(1)) : "…"} day{responsePeriodDays !== 1 ? "s" : ""} to submit their side.</p>
                  <textarea rows={3} placeholder="Describe the issue…"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                    value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
                  <IpfsFileUpload
                    label={disputeEvidenceHash ? "Replace Dispute Proof" : "Upload Dispute Proof"}
                    compact
                    existingCid={disputeEvidenceHash || undefined}
                    onUpload={(cid) => setDisputeEvidenceHash(cid)}
                  />
                  <Input
                    placeholder="Or paste evidence IPFS hash / URL"
                    value={disputeEvidenceHash}
                    onChange={e => setDisputeEvidenceHash(e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Your proportion demand %"
                    value={disputeDemandPct}
                    onChange={e => setDisputeDemandPct(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => {
                      setShowDisputeForm(false);
                      setDisputeReason("");
                      setDisputeEvidenceHash("");
                      setDisputeDemandPct("50");
                    }}
                      className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                    <button onClick={raiseDispute} disabled={!!txLoading || !disputeReason.trim() || !disputeEvidenceHash.trim() || disputeDemandPct === ""}
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
                      <IpfsFileUpload
                        label={responseEvidenceHash ? "Replace Response Proof" : "Upload Response Proof"}
                        compact
                        existingCid={responseEvidenceHash || undefined}
                        onUpload={(cid) => setResponseEvidenceHash(cid)}
                      />
                      <Input
                        placeholder="Or paste evidence IPFS hash / URL"
                        value={responseEvidenceHash}
                        onChange={e => setResponseEvidenceHash(e.target.value)}
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Your proportion demand %"
                        value={responseDemandPct}
                        onChange={e => setResponseDemandPct(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => {
                          setShowResponseForm(false);
                          setResponseText("");
                          setResponseEvidenceHash("");
                          setResponseDemandPct("50");
                        }}
                          className="flex-1 border rounded-lg py-2 text-sm" style={btnOutline}>Cancel</button>
                        <button onClick={submitResponse} disabled={!!txLoading || !responseText.trim() || !responseEvidenceHash.trim() || responseDemandPct === ""}
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
              <Link href={`/chat/${job.id.toString()}`}
                className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                style={{ background: colors.primaryLight, borderColor: colors.primary + "33", color: colors.primaryFg }}>
                <MessageCircle size={16} /> Open Chat
              </Link>
              {/* Tip freelancer (client only) */}
              {isClient && !tipGiven && (
                showTipForm ? (
                  <div className="rounded-xl p-4 space-y-3 border" style={{ borderColor: colors.cardBorder }}>
                    <h4 className="font-semibold flex items-center gap-1.5" style={{ color: colors.pageFg }}><Heart size={16} /> Send a Tip</h4>
                    <p className="text-xs" style={{ color: colors.mutedFg }}>Show your appreciation with an extra payment.</p>
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
              <p className="font-semibold text-sm" style={{ color: colors.mutedFg }}>Job Cancelled</p>
              <p className="text-xs mt-1" style={{ color: colors.mutedFg }}>This job has been cancelled.</p>
            </div>
          )}

          {/* ─── Bids section ──────────────────────────────────── */}
          {liveStatus === 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: colors.pageFg }}>
              <span className="w-1 h-4 rounded-full inline-block" style={{ background: colors.primary }} />
              Bids {!loadingBids && `(${bids.length})`}
              {job.sealedBidding && !isClient && (
                <span className="text-xs font-normal ml-1" style={{ color: colors.mutedFg }}>
                  (sealed — only your bid is visible)
                </span>
              )}
            </h3>
            {loadingBids ? (
              <p className="text-sm" style={{ color: colors.mutedFg }}>Loading bids…</p>
            ) : bids.length === 0 ? (
              <div className="rounded-xl border py-8 flex flex-col items-center justify-center" style={{ borderColor: colors.cardBorder }}>
                <Users size={28} style={{ color: colors.muted }} />
                <p className="text-sm mt-2" style={{ color: colors.mutedFg }}>No bids yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bids.map(bid => (
                  <div key={bid.id.toString()} className="border rounded-xl p-4"
                    style={{
                      borderColor: bid.id === job.acceptedBidId ? colors.successText + "55" : colors.cardBorder,
                      background: bid.id === job.acceptedBidId ? colors.successBg : "transparent",
                    }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: colors.inputBg, color: colors.mutedFg }}>
                          <Users size={14} />
                        </span>
                        {bid.freelancer.toLowerCase() === currentAddress?.toLowerCase() ? (
                          <span className="text-sm font-medium" style={{ color: colors.pageFg }}>you</span>
                        ) : (
                          <Link href={`/profile/${bid.freelancer}`} className="text-sm font-medium hover:underline" style={{ color: colors.primaryFg }}>
                            {shortenAddress(bid.freelancer)}
                          </Link>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: colors.primaryFg }}>
                          {formatEth(bid.amount)} {NATIVE_SYMBOL}
                        </p>
                        {Number(bid.completionDays) > 0 && (
                          <p className="text-[11px]" style={{ color: colors.mutedFg }}>Expected: {Number(bid.completionDays)} days</p>
                        )}
                      </div>
                    </div>
                    {bid.proposal && (
                      <p className="text-sm mt-2 leading-relaxed" style={{ color: colors.pageFg }}>{bid.proposal}</p>
                    )}
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      {bid.id === job.acceptedBidId && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: colors.successText, background: colors.successBg }}>✓ Accepted</span>
                      )}
                      {isClient && liveStatus === 0 && bid.isActive && (
                        <button onClick={() => acceptBid(bid)} disabled={!!txLoading}
                          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-60 btn-hover"
                          style={btnPrimary}>
                          {txLoading === "Accepting bid…" ? "…" : "Accept"}
                        </button>
                      )}
                      {!isClient && bid.freelancer.toLowerCase() === currentAddress?.toLowerCase() && liveStatus === 0 && bid.isActive && (
                        <button onClick={() => withdrawBid(bid.id)} disabled={!!txLoading}
                          className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60"
                          style={{ color: colors.dangerText }}>
                          <Trash2 size={12} />{txLoading === "Withdrawing bid…" ? "…" : "Withdraw"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Footer */}
        {liveStatus === 0 && signer && !isClient && !hasAlreadyBid && (
          <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium" style={{ color: colors.mutedFg }}>Close</button>
            <button onClick={() => setShowBidForm(true)}
              className="px-5 py-2 text-sm font-medium rounded-lg btn-hover" style={btnPrimary}>Place a Bid</button>
          </div>
        )}
        {(liveStatus !== 0 || isClient || hasAlreadyBid || !signer) && (
          <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium" style={{ color: colors.mutedFg }}>Close</button>
          </div>
        )}
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
