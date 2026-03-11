"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getSubContracting, getJobMarket, formatEth, formatDate,
  shortenAddress, SUB_CONTRACT_STATUS, CONTRACT_ADDRESSES, NATIVE_SYMBOL,
} from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/reactbits/Input";
import { Label } from "@/components/reactbits/Label";
import {
  Package, ClipboardList, Link as LinkIcon, Send, CheckCircle2,
  RotateCcw, Clock, Handshake, AlertTriangle, X,
  MessageCircle, Video,
} from "lucide-react";
import TaskBoard from "@/components/TaskBoard";

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

  // Bids & settlements loaded per card
  const [scBids, setScBids] = useState<Record<string, any[]>>({});
  const [settlements, setSettlements] = useState<Record<string, any>>({});

  // Bid form (open per scId)
  const [bidOpen, setBidOpen] = useState<string | null>(null);
  const [bidAmt, setBidAmt] = useState("");
  const [bidDays, setBidDays] = useState("");
  const [bidProposal, setBidProposal] = useState("");

  // Settlement form
  const [settlementOpen, setSettlementOpen] = useState<string | null>(null);
  const [settlementPct, setSettlementPct] = useState("50");

  // Create form (enhanced like job posting)
  const [parentJob, setParentJob] = useState(searchParams.get("jobId") || "");
  const [createTitle, setCreateTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [createCategory, setCreateCategory] = useState("Web Development");
  const [payment, setPayment] = useState("");
  const [createDeadlineDays, setCreateDeadlineDays] = useState("30");
  const [createExpectedDays, setCreateExpectedDays] = useState("");
  const [subAddr, setSubAddr] = useState("");

  // Task board state
  const [showTaskBoard, setShowTaskBoard] = useState<string | null>(null);

  // Categories (same as job posting)
  const CATEGORIES = [
    "Web Development", "Mobile Development", "Smart Contracts", "Design",
    "Writing", "Marketing", "Data Science", "DevOps", "Other",
  ];

  // Job title cache
  const [jobTitles, setJobTitles] = useState<Record<string, string>>({});

  // Auto-release period
  const [autoReleasePeriod, setAutoReleasePeriod] = useState(14 * 86400);

  /* ── Load data ──────────────────────────────────────────────────────── */

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

      // Load bids for open listings
      const bidsMap: Record<string, any[]> = {};
      for (const s of open) {
        try {
          const b = await sc.getScBids(s.id);
          bidsMap[s.id.toString()] = [...b];
        } catch { /* ignore */ }
      }

      // Load bids + settlements for user's subs
      const settMap: Record<string, any> = {};
      if (address) {
        for (const s of mine) {
          const st = Number(s.status);
          try {
            const b = await sc.getScBids(s.id);
            bidsMap[s.id.toString()] = [...b];
          } catch { /* ignore */ }
          if (st === 1 || st === 2 || st === 4) {
            try {
              const sett = await sc.getSettlement(s.id);
              if (sett.active) settMap[s.id.toString()] = sett;
            } catch { /* ignore */ }
          }
        }
      }
      setScBids(bidsMap);
      setSettlements(settMap);

      // Auto release period
      try { setAutoReleasePeriod(Number(await sc.AUTO_RELEASE_PERIOD())); } catch { /* ignore */ }

      // Job titles
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
  useEffect(() => {
    if (searchParams.get("jobId") && address) setShowCreate(true);
  }, [searchParams, address]);

  /* ── Transaction wrapper ────────────────────────────────────────────── */

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); window.dispatchEvent(new Event("dfm:tx")); load(); }
    catch (err: any) { alert(err?.reason || err?.message || "Transaction failed"); }
    finally { setBusy(null); }
  };

  /* ── Handlers ───────────────────────────────────────────────────────── */

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    run("creating", async () => {
      const sc = getSubContracting(signer!);
      const sub = subAddr.trim() || ethers.ZeroAddress;
      // Encode extra fields into description
      const meta = [createTitle, createCategory, `Deadline: ${createDeadlineDays}d`, createExpectedDays ? `Expected: ${createExpectedDays}d` : ""].filter(Boolean).join(" | ");
      const fullDesc = `${meta}\n\n${desc}`;
      const tx = await sc.createSubContract(Number(parentJob), sub, fullDesc, {
        value: ethers.parseEther(payment),
      });
      await tx.wait();
      setShowCreate(false); setParentJob(""); setSubAddr(""); setDesc(""); setPayment("");
      setCreateTitle(""); setCreateCategory("Web Development"); setCreateDeadlineDays("30"); setCreateExpectedDays("");
    });
  };

  const handlePlaceBid = (scId: string) => {
    run(`bid-${scId}`, async () => {
      const sc = getSubContracting(signer!);
      const tx = await sc.placeBid(
        BigInt(scId),
        ethers.parseEther(bidAmt),
        Number(bidDays),
        bidProposal,
      );
      await tx.wait();
      setBidOpen(null); setBidAmt(""); setBidDays(""); setBidProposal("");
    });
  };

  const handleWithdrawBid = (bidId: bigint) => run(`wbid-${bidId}`, async () => {
    const tx = await getSubContracting(signer!).withdrawBid(bidId);
    await tx.wait();
  });

  const handleAcceptBid = (bidId: bigint) => {
    if (!confirm("Accept this bid? The sub-contractor will be assigned.")) return;
    run(`abid-${bidId}`, async () => {
      const tx = await getSubContracting(signer!).acceptBid(bidId);
      await tx.wait();
    });
  };

  const handleDeliver = (scId: bigint) => run(`deliver-${scId}`, async () => {
    const tx = await getSubContracting(signer!).deliverWork(scId);
    await tx.wait();
  });

  const handleApprove = (scId: bigint) => run(`approve-${scId}`, async () => {
    const tx = await getSubContracting(signer!).approveWork(scId);
    await tx.wait();
  });

  const handleRevision = (scId: bigint) => run(`rev-${scId}`, async () => {
    const tx = await getSubContracting(signer!).requestRevision(scId);
    await tx.wait();
  });

  const handleAutoRelease = (scId: bigint) => run(`auto-${scId}`, async () => {
    const tx = await getSubContracting(signer!).autoRelease(scId);
    await tx.wait();
  });

  const handleCancel = (scId: bigint) => {
    if (!confirm("Cancel and refund?")) return;
    run(`cancel-${scId}`, async () => {
      const tx = await getSubContracting(signer!).cancelSubContract(scId);
      await tx.wait();
    });
  };

  const handleSettlement = (scId: string) => {
    run(`settle-${scId}`, async () => {
      const tx = await getSubContracting(signer!).requestSettlement(BigInt(scId), Number(settlementPct));
      await tx.wait();
      setSettlementOpen(null); setSettlementPct("50");
    });
  };

  const handleSettlementRespond = (scId: bigint, accept: boolean) => {
    const label = accept ? "Accepting" : "Rejecting";
    if (!confirm(`${label} settlement?`)) return;
    run(`setresp-${scId}`, async () => {
      const tx = await getSubContracting(signer!).respondToSettlement(scId, accept);
      await tx.wait();
    });
  };

  /* ── Helpers ────────────────────────────────────────────────────────── */

  const statusBadge = (status: number) => {
    const map: Record<number, { bg: string; fg: string }> = {
      0: { bg: colors.primaryLight, fg: colors.primaryFg },
      1: { bg: colors.infoBg, fg: colors.infoText },
      2: { bg: colors.warningBg || "#fef3c7", fg: colors.warningText || "#92400e" },
      3: { bg: colors.successBg, fg: colors.successText },
      4: { bg: colors.dangerBg, fg: colors.dangerText },
      5: { bg: colors.surfaceBg || colors.inputBg, fg: colors.muted },
    };
    const s = map[status] || map[5];
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>
        {SUB_CONTRACT_STATUS[status] || "Unknown"}
      </span>
    );
  };

  const inputStyle = { background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg };

  if (!configured) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center" style={{ color: colors.muted }}>
        <p className="text-lg font-semibold">SubContracting contract not configured</p>
      </div>
    );
  }

  /* ── Card renderer ──────────────────────────────────────────────────── */

  const renderCard = (s: any) => {
    const status = Number(s.status);
    const isPrimary = address?.toLowerCase() === s.primaryFreelancer.toLowerCase();
    const isSub = address?.toLowerCase() === s.subContractor?.toLowerCase();
    const isOpen = status === 0;
    const scKey = s.id.toString();
    const bids = scBids[scKey] || [];
    const activeBids = bids.filter((b: any) => b.isActive);
    const myBid = activeBids.find((b: any) => b.bidder.toLowerCase() === address?.toLowerCase());
    const settlement = settlements[scKey];
    const isParty = isPrimary || isSub;

    // Auto-release countdown
    const deliveredAt = Number(s.deliveredAt);
    const autoReleaseAt = deliveredAt > 0 ? deliveredAt + autoReleasePeriod : 0;
    const now = Math.floor(Date.now() / 1000);
    const canAutoRelease = status === 2 && autoReleaseAt > 0 && now >= autoReleaseAt;
    const daysUntilRelease = autoReleaseAt > now ? Math.ceil((autoReleaseAt - now) / 86400) : 0;

    return (
      <div key={scKey} className="rounded-2xl border p-5 card-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {statusBadge(status)}
              <span className="text-xs" style={{ color: colors.muted }}>
                SC #{scKey} — {jobTitles[s.parentJobId.toString()] || `Job #${s.parentJobId.toString()}`}
              </span>
              {status === 2 && daysUntilRelease > 0 && (
                <span className="text-xs flex items-center gap-1" style={{ color: colors.warningText || "#92400e" }}>
                  <Clock size={12} /> Auto-release in {daysUntilRelease}d
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: colors.pageFg }}>{s.description}</p>
            <p className="text-xs mt-2" style={{ color: colors.muted }}>
              Posted by{" "}
              <Link href={`/profile/${s.primaryFreelancer}`} style={{ color: colors.primaryFg }} className="hover:underline">
                {isPrimary ? "You" : shortenAddress(s.primaryFreelancer)}
              </Link>
              {s.subContractor && s.subContractor !== ethers.ZeroAddress && (
                <> {" \u2192 "} Sub:{" "}
                  <Link href={`/profile/${s.subContractor}`} style={{ color: colors.primaryFg }} className="hover:underline">
                    {isSub ? "You" : shortenAddress(s.subContractor)}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="font-mono font-bold" style={{ color: colors.primaryFg }}>{formatEth(s.payment)} {NATIVE_SYMBOL}</p>
            <p className="text-xs" style={{ color: colors.muted }}>{formatDate(s.createdAt)}</p>
          </div>
        </div>

        {/* Actions area */}
        <div className="space-y-2 pt-3" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>

          {/* ── OPEN: Show bids list (primary) or bid form (others) ── */}
          {isOpen && (
            <>
              {/* Bid list for primary */}
              {isPrimary && activeBids.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: colors.mutedFg }}>Bids ({activeBids.length})</p>
                  <div className="space-y-1.5">
                    {activeBids.map((b: any) => (
                      <div key={b.id.toString()} className="flex items-center justify-between rounded-lg px-3 py-2 border"
                        style={{ borderColor: colors.cardBorder }}>
                        <div className="flex-1">
                          <Link href={`/profile/${b.bidder}`} className="text-xs font-mono hover:underline" style={{ color: colors.primaryFg }}>
                            {shortenAddress(b.bidder)}
                          </Link>
                          <span className="text-xs ml-2 font-semibold" style={{ color: colors.pageFg }}>
                            {formatEth(b.amount)} {NATIVE_SYMBOL}
                          </span>
                          <span className="text-xs ml-2" style={{ color: colors.muted }}>{Number(b.completionDays)}d</span>
                          {b.proposal && <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: colors.muted }}>{b.proposal}</p>}
                        </div>
                        <button onClick={() => handleAcceptBid(b.id)} disabled={!!busy}
                          className="text-xs px-3 py-1 rounded-lg font-medium disabled:opacity-50 btn-hover"
                          style={{ background: colors.successBg, color: colors.successText }}>
                          {busy === `abid-${b.id}` ? "..." : "Accept"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isPrimary && activeBids.length === 0 && (
                <p className="text-xs" style={{ color: colors.muted }}>No bids yet — waiting for freelancers to bid</p>
              )}

              {/* Place bid (non-owners) */}
              {!isPrimary && address && (
                myBid ? (
                  <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: colors.successBg }}>
                    <p className="text-xs" style={{ color: colors.successText }}>
                      ✓ Your bid: {formatEth(myBid.amount)} {NATIVE_SYMBOL} / {Number(myBid.completionDays)}d
                    </p>
                    <button onClick={() => handleWithdrawBid(myBid.id)} disabled={!!busy}
                      className="text-xs px-2 py-1 rounded font-medium disabled:opacity-50"
                      style={{ color: colors.dangerText }}>
                      {busy === `wbid-${myBid.id}` ? "..." : "Withdraw"}
                    </button>
                  </div>
                ) : bidOpen === scKey ? (
                  <div className="rounded-xl p-4 space-y-3 border" style={{ borderColor: colors.cardBorder }}>
                    <h4 className="font-semibold text-sm" style={{ color: colors.pageFg }}>Place a Bid</h4>
                    <Input type="number" step="0.001" placeholder={`Your bid in ${NATIVE_SYMBOL} (can be above budget)`}
                      value={bidAmt} onChange={e => setBidAmt(e.target.value)} className="font-mono text-sm" />
                    <Input type="number" min="1" placeholder="Completion days (how many days you need)"
                      value={bidDays} onChange={e => setBidDays(e.target.value)} className="font-mono text-sm" />
                    <textarea value={bidProposal} onChange={e => setBidProposal(e.target.value)} rows={3}
                      placeholder="Your proposal…"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      style={inputStyle} />
                    <div className="flex gap-2">
                      <button onClick={() => setBidOpen(null)}
                        className="flex-1 border rounded-lg py-2 text-sm" style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                      <button onClick={() => handlePlaceBid(scKey)} disabled={!!busy || !bidAmt || !bidDays || !bidProposal}
                        className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                        style={{ background: colors.primary, color: colors.primaryText }}>
                        {busy === `bid-${scKey}` ? "Placing…" : "Submit Bid"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setBidOpen(scKey); setBidAmt(formatEth(s.payment)); }}
                    className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-hover"
                    style={{ background: colors.primary, color: colors.primaryText }}>
                    <Send size={14} className="inline mr-1" />Place a Bid
                  </button>
                )
              )}
            </>
          )}

          {/* ── ACTIVE (status 1): Full lifecycle like normal jobs ── */}
          {status === 1 && isParty && (
            <div className="space-y-2">
              <Link href={`/chat/sc-${scKey}`}
                className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                style={{ background: colors.primaryLight, borderColor: colors.primary + "33", color: colors.primaryFg }}>
                <MessageCircle size={16} /> Open Chat
              </Link>
              <a href={`https://meet.jit.si/verity-sc-${scKey}`} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                style={{ background: colors.infoBg, borderColor: colors.infoText + "33", color: colors.infoText }}>
                <Video size={16} /> Start Video Call
              </a>
              <button onClick={() => setShowTaskBoard(showTaskBoard === scKey ? null : scKey)}
                className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>
                <ClipboardList size={16} /> Task Board
              </button>
              {isSub && (
                <button onClick={() => handleDeliver(s.id)} disabled={!!busy}
                  className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                  style={{ background: "#7c3aed", color: "#fff" }}>
                  {busy === `deliver-${s.id}` ? "Delivering…" : <><Package size={16} className="inline mr-1" />Mark as Delivered</>}
                </button>
              )}
              {isPrimary && (
                <button onClick={() => handleApprove(s.id)} disabled={!!busy}
                  className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                  style={{ background: colors.successText, color: "#fff" }}>
                  {busy === `approve-${s.id}` ? "Completing…" : "✓ Mark as Complete & Release Payment"}
                </button>
              )}
              {/* Settlement */}
              {settlement ? (
                <div className="rounded-xl p-4 border space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <p className="text-sm font-medium" style={{ color: colors.pageFg }}>
                    <Handshake size={14} className="inline mr-1" />
                    Settlement proposed by {settlement.proposer.toLowerCase() === address?.toLowerCase() ? "you" : shortenAddress(settlement.proposer)}
                  </p>
                  <p className="text-xs" style={{ color: colors.muted }}>
                    Sub-contractor gets {Number(settlement.freelancerPercent)}% — Primary gets {100 - Number(settlement.freelancerPercent)}%
                  </p>
                  {settlement.proposer.toLowerCase() !== address?.toLowerCase() && (
                    <div className="flex gap-2">
                      <button onClick={() => handleSettlementRespond(s.id, true)} disabled={!!busy}
                        className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                        style={{ background: colors.successText, color: "#fff" }}>✓ Accept</button>
                      <button onClick={() => handleSettlementRespond(s.id, false)} disabled={!!busy}
                        className="flex-1 border rounded-lg py-2 text-sm disabled:opacity-60"
                        style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>✗ Reject</button>
                    </div>
                  )}
                </div>
              ) : settlementOpen === scKey ? (
                <div className="space-y-2 p-4 rounded-xl border" style={{ borderColor: colors.cardBorder }}>
                  <Label className="text-xs block">Sub-contractor receives (%)</Label>
                  <Input type="number" min="0" max="100" value={settlementPct}
                    onChange={e => setSettlementPct(e.target.value)} className="font-mono text-sm" />
                  <p className="text-xs" style={{ color: colors.muted }}>Primary keeps {100 - (Number(settlementPct) || 0)}%</p>
                  <div className="flex gap-2">
                    <button onClick={() => setSettlementOpen(null)}
                      className="flex-1 border rounded-lg py-2 text-sm" style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                    <button onClick={() => handleSettlement(scKey)} disabled={!!busy}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.primary, color: colors.primaryText }}>
                      {busy === `settle-${scKey}` ? "…" : "Propose Settlement"}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setSettlementOpen(scKey)}
                  className="w-full border rounded-lg py-2 text-sm"
                  style={{ borderColor: colors.infoText + "55", color: colors.infoText }}>
                  <Handshake size={14} className="inline mr-1" />Propose Settlement
                </button>
              )}
              {/* Raise Dispute */}
              <Link href="/disputes"
                className="w-full flex items-center justify-center border rounded-lg py-2 text-sm"
                style={{ borderColor: colors.warningText + "66", color: colors.warningText }}>
                <AlertTriangle size={14} className="mr-1" />Raise Dispute
              </Link>
            </div>
          )}

          {/* ── DELIVERED (status 2): Full lifecycle ── */}
          {status === 2 && isParty && (
            <div className="space-y-2">
              <Link href={`/chat/sc-${scKey}`}
                className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                style={{ background: colors.primaryLight, borderColor: colors.primary + "33", color: colors.primaryFg }}>
                <MessageCircle size={16} /> Open Chat
              </Link>
              <a href={`https://meet.jit.si/verity-sc-${scKey}`} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                style={{ background: colors.infoBg, borderColor: colors.infoText + "33", color: colors.infoText }}>
                <Video size={16} /> Start Video Call
              </a>
              {isPrimary && (
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(s.id)} disabled={!!busy}
                    className="flex-1 rounded-lg py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
                    style={{ background: colors.successText, color: "#fff" }}>
                    {busy === `approve-${s.id}` ? "…" : <><CheckCircle2 size={14} className="inline mr-1" />Approve &amp; Release Payment</>}
                  </button>
                  <button onClick={() => handleRevision(s.id)} disabled={!!busy}
                    className="flex-1 rounded-lg py-2.5 text-sm font-medium border disabled:opacity-60 btn-outline-hover"
                    style={{ borderColor: colors.cardBorder, color: colors.pageFg }}>
                    {busy === `rev-${s.id}` ? "…" : <><RotateCcw size={14} className="inline mr-1" />Request Revision</>}
                  </button>
                </div>
              )}
              {canAutoRelease && (
                <button onClick={() => handleAutoRelease(s.id)} disabled={!!busy}
                  className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-hover"
                  style={{ background: colors.warningBg || "#fef3c7", color: colors.warningText || "#92400e" }}>
                  {busy === `auto-${s.id}` ? "Releasing…" : <><Clock size={14} className="inline mr-1" />Trigger Auto-Release (14d passed)</>}
                </button>
              )}
              {/* Settlement */}
              {settlement ? (
                <div className="rounded-xl p-4 border space-y-2" style={{ borderColor: colors.cardBorder }}>
                  <p className="text-sm font-medium" style={{ color: colors.pageFg }}>
                    <Handshake size={14} className="inline mr-1" />
                    Settlement proposed by {settlement.proposer.toLowerCase() === address?.toLowerCase() ? "you" : shortenAddress(settlement.proposer)}
                  </p>
                  <p className="text-xs" style={{ color: colors.muted }}>
                    Sub-contractor gets {Number(settlement.freelancerPercent)}% — Primary gets {100 - Number(settlement.freelancerPercent)}%
                  </p>
                  {settlement.proposer.toLowerCase() !== address?.toLowerCase() && (
                    <div className="flex gap-2">
                      <button onClick={() => handleSettlementRespond(s.id, true)} disabled={!!busy}
                        className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                        style={{ background: colors.successText, color: "#fff" }}>✓ Accept</button>
                      <button onClick={() => handleSettlementRespond(s.id, false)} disabled={!!busy}
                        className="flex-1 border rounded-lg py-2 text-sm disabled:opacity-60"
                        style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>✗ Reject</button>
                    </div>
                  )}
                </div>
              ) : settlementOpen === scKey ? (
                <div className="space-y-2 p-4 rounded-xl border" style={{ borderColor: colors.cardBorder }}>
                  <Label className="text-xs block">Sub-contractor receives (%)</Label>
                  <Input type="number" min="0" max="100" value={settlementPct}
                    onChange={e => setSettlementPct(e.target.value)} className="font-mono text-sm" />
                  <p className="text-xs" style={{ color: colors.muted }}>Primary keeps {100 - (Number(settlementPct) || 0)}%</p>
                  <div className="flex gap-2">
                    <button onClick={() => setSettlementOpen(null)}
                      className="flex-1 border rounded-lg py-2 text-sm" style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                    <button onClick={() => handleSettlement(scKey)} disabled={!!busy}
                      className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                      style={{ background: colors.primary, color: colors.primaryText }}>
                      {busy === `settle-${scKey}` ? "…" : "Propose Settlement"}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setSettlementOpen(scKey)}
                  className="w-full border rounded-lg py-2 text-sm"
                  style={{ borderColor: colors.infoText + "55", color: colors.infoText }}>
                  <Handshake size={14} className="inline mr-1" />Propose Settlement
                </button>
              )}
              <Link href="/disputes"
                className="w-full flex items-center justify-center border rounded-lg py-2 text-sm"
                style={{ borderColor: colors.warningText + "66", color: colors.warningText }}>
                <AlertTriangle size={14} className="mr-1" />Raise Dispute
              </Link>
            </div>
          )}

          {/* ── DISPUTED indicator ── */}
          {status === 4 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: colors.dangerBg }}>
                <AlertTriangle size={14} style={{ color: colors.dangerText }} />
                <p className="text-xs" style={{ color: colors.dangerText }}>
                  Under dispute — resolution pending on the{" "}
                  <Link href="/disputes" className="underline">Disputes page</Link>
                </p>
              </div>
              {isParty && (
                <Link href={`/chat/sc-${scKey}`}
                  className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium btn-outline-hover"
                  style={{ background: colors.primaryLight, borderColor: colors.primary + "33", color: colors.primaryFg }}>
                  <MessageCircle size={16} /> Open Chat
                </Link>
              )}
            </div>
          )}

          {/* ── CANCEL (Open only, primary only) ── */}
          {isPrimary && isOpen && (
            <button onClick={() => handleCancel(s.id)} disabled={!!busy}
              className="w-full border rounded-lg py-2 text-xs disabled:opacity-50 btn-outline-hover"
              style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
              {busy === `cancel-${s.id}` ? "Cancelling…" : <><X size={12} className="inline mr-1" />Cancel Sub-Contract</>}
            </button>
          )}

          {/* ── COMPLETED summary ── */}
          {status === 3 && (
            <p className="text-xs flex items-center gap-1" style={{ color: colors.successText }}>
              <CheckCircle2 size={14} /> Completed {s.completedAt ? formatDate(s.completedAt) : ""}
            </p>
          )}
        </div>

        {/* Task Board (expanded inline) */}
        {showTaskBoard === scKey && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
            <TaskBoard jobId={`sc-${scKey}`} onClose={() => setShowTaskBoard(null)} />
          </div>
        )}
      </div>
    );
  };

  /* ── Page layout ────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen" style={{ background: colors.pageBg }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black" style={{ color: colors.pageFg }}>Sub-Contracts</h1>
            <p className="text-sm mt-1" style={{ color: colors.mutedFg }}>
              Delegate work to other freelancers — bid, deliver, settle
            </p>
          </div>

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
          <p className="text-sm py-12 text-center animate-pulse" style={{ color: colors.muted }}>Loading...</p>
        ) : (
          <>
            {tab === "open" && (
              openSubs.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                  <LinkIcon size={32} className="mb-3 mx-auto" style={{ color: colors.muted }} />
                  <p className="font-semibold" style={{ color: colors.pageFg }}>No open sub-contract listings</p>
                  <p className="text-sm mt-1" style={{ color: colors.muted }}>Post one to delegate work to other freelancers</p>
                </div>
              ) : (
                <div className="space-y-3">{openSubs.map(s => renderCard(s))}</div>
              )
            )}
            {tab === "mine" && (
              mySubs.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                  <ClipboardList size={32} className="mb-3 mx-auto" style={{ color: colors.muted }} />
                  <p className="font-semibold" style={{ color: colors.pageFg }}>No sub-contracts yet</p>
                  <p className="text-sm mt-1" style={{ color: colors.muted }}>Create or bid on one to get started</p>
                </div>
              ) : (
                <div className="space-y-3">{mySubs.map(s => renderCard(s))}</div>
              )
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: colors.cardBg }} onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-1" style={{ color: colors.pageFg }}>Post a Sub-Contract</h2>
            <p className="text-xs mb-4" style={{ color: colors.muted }}>
              Leave &quot;Sub-Contractor Address&quot; empty to create an open listing that freelancers can bid on.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label className="mb-1 block text-xs font-medium">Parent Job ID *</Label>
                <Input type="number" min="1" value={parentJob} onChange={e => setParentJob(e.target.value)} required
                  className="font-mono" />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">Title *</Label>
                <Input value={createTitle} onChange={e => setCreateTitle(e.target.value)} required
                  placeholder="e.g. Build responsive landing page" />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">Description *</Label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} required rows={3}
                  placeholder="Describe the work you want completed..."
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
                  style={inputStyle} />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">Category</Label>
                <select value={createCategory} onChange={e => setCreateCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">Budget ({NATIVE_SYMBOL}) *</Label>
                <Input type="number" step="0.001" min="0.001" value={payment} onChange={e => setPayment(e.target.value)} required
                  placeholder="Amount in ETH" className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs font-medium">Deadline (days)</Label>
                  <Input type="number" min="1" value={createDeadlineDays} onChange={e => setCreateDeadlineDays(e.target.value)}
                    placeholder="30" className="font-mono" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">Expected Days</Label>
                  <Input type="number" min="1" value={createExpectedDays} onChange={e => setCreateExpectedDays(e.target.value)}
                    placeholder="e.g. 7" className="font-mono" />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">
                  Sub-Contractor Address <span className="font-normal text-xs">(optional — leave empty for open listing)</span>
                </Label>
                <Input value={subAddr} onChange={e => setSubAddr(e.target.value)} placeholder="0x... or leave empty"
                  className="font-mono" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border btn-outline-hover"
                  style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                <button type="submit" disabled={!!busy || !createTitle || !desc || !payment}
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
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh] animate-pulse">Loading...</div>}>
      <SubContractsInner />
    </Suspense>
  );
}
