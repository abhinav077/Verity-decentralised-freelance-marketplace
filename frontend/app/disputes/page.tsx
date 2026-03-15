"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getDisputeResolution, getJobMarket, CONTRACT_ADDRESSES,
  shortenAddress, DISPUTE_STATUS,
} from "@/lib/contracts";
import { resolveIpfsUrl } from "@/lib/ipfs";
import { useIpfsUpload } from "@/hooks/useIpfsUpload";
import { ethers } from "ethers";
import Link from "next/link";
import { Input } from "@/components/reactbits/Input";
import { Paperclip, Scale, Timer, Clock, Vote, PenLine } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Types matching new 23-field DISPUTE_TUPLE ────────────────────────────────
interface Dispute {
  id: bigint;
  jobId: bigint;
  initiator: string;
  client: string;
  freelancer: string;
  reason: string;
  respondentDescription: string;
  responseSubmitted: boolean;
  status: number; // 0=Active 1=ResponsePhase 2=VotingPhase 3=Resolved 4=AutoResolved 5=Withdrawn 6=EscalatedToAdmin
  createdAt: bigint;
  responseDeadline: bigint;
  votingDeadline: bigint;
  clientVotes: bigint;
  freelancerVotes: bigint;
  reProportionVotes: bigint;
  clientWon: boolean;
  clientPercent: bigint;
  totalVoters: bigint;
  freelancerDemandPct: bigint;
  clientDemandPct: bigint;
  freelancerDemandSet: boolean;
  clientDemandSet: boolean;
  votingRound: bigint;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeLeft(deadline: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(deadline) - now;
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  return `${h}h ${m}m left`;
}

// ── 3-Way Vote Bar ──────────────────────────────────────────────────────────
function VoteBar3({ clientVotes, freelancerVotes, reProportionVotes, colors }: {
  clientVotes: bigint; freelancerVotes: bigint; reProportionVotes: bigint; colors: any;
}) {
  const total = clientVotes + freelancerVotes + reProportionVotes;
  const cPct = total === 0n ? 33 : Number((clientVotes * 100n) / total);
  const fPct = total === 0n ? 33 : Number((freelancerVotes * 100n) / total);
  const rPct = total === 0n ? 34 : 100 - cPct - fPct;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1" style={{ color: colors.mutedFg }}>
        <span>Client {cPct}%</span>
        <span>Freelancer {fPct}%</span>
        <span>Split {rPct}%</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex" style={{ background: colors.inputBg }}>
        <div className="h-full transition-all" style={{ width: `${cPct}%`, background: colors.warningText }} />
        <div className="h-full transition-all" style={{ width: `${fPct}%`, background: colors.infoText }} />
        <div className="h-full transition-all" style={{ width: `${rPct}%`, background: colors.badgeText }} />
      </div>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: colors.mutedFg }}>
        <span>{Number(clientVotes)} votes</span>
        <span>{Number(freelancerVotes)} votes</span>
        <span>{Number(reProportionVotes)} votes</span>
      </div>
    </div>
  );
}

// ── Inline evidence file uploader ────────────────────────────────────────────
function EvidenceUploader({ onUpload }: { onUpload: (cid: string) => void }) {
  const { uploadFile, uploading, error } = useIpfsUpload();
  const fileInputRef = useState<HTMLInputElement | null>(null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          style={{
            padding: "6px 12px", borderRadius: 6,
            border: "1px solid var(--border, #333)",
            background: "var(--muted, #1a1a2e)",
            color: "var(--foreground, #e0e0e0)",
            cursor: uploading ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          {uploading ? "Uploading…" : <><Paperclip size={13} className="inline mr-1" />Upload File to IPFS</>}
          <input
            type="file"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const { cid } = await uploadFile(f);
                onUpload(cid);
              } catch { /* error shown via hook */ }
              e.target.value = "";
            }}
          />
        </label>
        {error && <span style={{ fontSize: 12, color: "var(--danger, #ef4444)" }}>{error}</span>}
      </div>
    </div>
  );
}

// ── DisputeCard ──────────────────────────────────────────────────────────────
function DisputeCard({
  dispute, currentAddress,
  onCastVote, onAdvancePhase, onResolve, onAutoResolve, onResponse,
  onEscalateToAdmin, evidence,
  txLoading, colors, responseDays, canSeeVoteBar,
}: {
  dispute: Dispute; currentAddress: string | null;
  onCastVote: (disputeId: bigint, voteType: number) => Promise<void>;
  onAdvancePhase: (disputeId: bigint) => Promise<void>;
  onResolve: (disputeId: bigint) => Promise<void>;
  onAutoResolve: (disputeId: bigint) => Promise<void>;
  onResponse: (disputeId: bigint, text: string, evidenceHash: string, myPct: number) => Promise<void>;
  onEscalateToAdmin: (disputeId: bigint) => Promise<void>;
  evidence: { party: string; ipfsHash: string; timestamp: bigint }[];
  txLoading: string | null; colors: any; responseDays: number; canSeeVoteBar: boolean;
}) {
  const [voteType, setVoteType] = useState<number>(0); // 0=Client 1=Freelancer 2=ReProportion
  const [showVoteForm, setShowVoteForm] = useState(false);
  const [responseFormText, setResponseFormText] = useState("");
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [responseEvidenceHash, setResponseEvidenceHash] = useState("");
  const [responseDemandPct, setResponseDemandPct] = useState("50");
  const [showClientDetails, setShowClientDetails] = useState(false);
  const [showFreelancerDetails, setShowFreelancerDetails] = useState(false);

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);

  const responseExpired = Number(dispute.responseDeadline) > 0 && Number(dispute.responseDeadline) <= now;
  const votingExpired = Number(dispute.votingDeadline) > 0 && Number(dispute.votingDeadline) <= now;

  const st = dispute.status;
  const isResponsePhase = st === 1;
  const isVotingPhase = st === 2;
  const isResolved = st === 3;
  const isAutoResolved = st === 4;
  const isWithdrawn = st === 5;
  const isEscalated = st === 6;
  const isTerminal = isResolved || isAutoResolved || isWithdrawn || isEscalated;

  const isParty =
    currentAddress?.toLowerCase() === dispute.client.toLowerCase() ||
    currentAddress?.toLowerCase() === dispute.freelancer.toLowerCase();
  const isClientParty = currentAddress?.toLowerCase() === dispute.client.toLowerCase();
  const isFreelancerParty = currentAddress?.toLowerCase() === dispute.freelancer.toLowerCase();
  const isInitiator = currentAddress?.toLowerCase() === dispute.initiator.toLowerCase();

  const statusLabel = DISPUTE_STATUS[st] || `Status ${st}`;
  const statusStyle = isResolved
    ? { background: dispute.clientWon ? colors.warningBg : colors.badgeBg, color: dispute.clientWon ? colors.warningText : colors.badgeText }
    : isAutoResolved || isWithdrawn ? { background: colors.inputBg, color: colors.mutedFg }
    : isEscalated ? { background: colors.dangerBg, color: colors.dangerText }
    : isVotingPhase ? { background: colors.infoBg, color: colors.infoText }
    : isResponsePhase && !responseExpired ? { background: colors.warningBg, color: colors.warningText }
    : { background: colors.successBg, color: colors.successText };

  const disputeKey = dispute.id.toString();
  const inputStyle = { background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg };
  void isTerminal;

  const isClientInitiator = dispute.initiator.toLowerCase() === dispute.client.toLowerCase();
  const isFreelancerInitiator = dispute.initiator.toLowerCase() === dispute.freelancer.toLowerCase();
  const clientComplaint = isClientInitiator ? dispute.reason : (dispute.responseSubmitted ? dispute.respondentDescription : "");
  const freelancerComplaint = isFreelancerInitiator ? dispute.reason : (dispute.responseSubmitted ? dispute.respondentDescription : "");
  const clientEvidence = evidence.filter((e) => e.party.toLowerCase() === dispute.client.toLowerCase());
  const freelancerEvidence = evidence.filter((e) => e.party.toLowerCase() === dispute.freelancer.toLowerCase());

  return (
    <div className="border rounded-xl p-5 card-hover" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-xs" style={{ color: colors.mutedFg }}>
          Dispute #{disputeKey} · Job #{dispute.jobId.toString()}
          {Number(dispute.votingRound) > 0 && ` · Round ${Number(dispute.votingRound) + 1}`}
        </span>
        <span className="text-xs font-medium px-2 py-1 rounded-full shrink-0" style={statusStyle}>{statusLabel}</span>
      </div>

      {/* Title + complaint boxes */}
      <div className="rounded-lg border p-3 mb-3" style={{ borderColor: colors.cardBorder, background: colors.surfaceBg }}>
        <p className="text-sm font-semibold" style={{ color: colors.pageFg }}>Dispute Title</p>
        <p className="text-xs mt-1" style={{ color: colors.mutedFg }}>Job #{dispute.jobId.toString()} dispute between client and freelancer</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="border rounded-lg p-3" style={{ background: colors.warningBg, borderColor: colors.warningText + "22" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: colors.warningText }}>Client Complaint</p>
          <button
            onClick={() => setShowClientDetails((v) => !v)}
            className="w-full rounded-lg py-1.5 text-xs font-medium btn-hover"
            style={{ background: colors.warningText, color: "#fff" }}
          >
            {showClientDetails ? "Hide Details" : "View Details"}
          </button>
          {showClientDetails && (
            <div className="mt-2 text-xs space-y-2" style={{ color: colors.pageFg }}>
              <p><span className="font-semibold">Description:</span> {clientComplaint || "Not submitted yet"}</p>
              <p><span className="font-semibold">Proportion Demand:</span> {dispute.clientDemandSet ? `${Number(dispute.clientDemandPct)}%` : "Not submitted"}</p>
              <div>
                <p className="font-semibold">Proofs:</p>
                {clientEvidence.length === 0 ? (
                  <p style={{ color: colors.mutedFg }}>No evidence uploaded.</p>
                ) : (
                  <div className="space-y-1">
                    {clientEvidence.map((e, i) => (
                      <a
                        key={i}
                        href={resolveIpfsUrl(e.ipfsHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block underline break-all"
                        style={{ color: colors.primaryFg }}
                      >
                        {e.ipfsHash}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border rounded-lg p-3" style={{ background: colors.infoBg, borderColor: colors.infoText + "22" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: colors.infoText }}>Freelancer Complaint</p>
          <button
            onClick={() => setShowFreelancerDetails((v) => !v)}
            className="w-full rounded-lg py-1.5 text-xs font-medium btn-hover"
            style={{ background: colors.infoText, color: "#fff" }}
          >
            {showFreelancerDetails ? "Hide Details" : "View Details"}
          </button>
          {showFreelancerDetails && (
            <div className="mt-2 text-xs space-y-2" style={{ color: colors.pageFg }}>
              <p><span className="font-semibold">Description:</span> {freelancerComplaint || "Not submitted yet"}</p>
              <p><span className="font-semibold">Proportion Demand:</span> {dispute.freelancerDemandSet ? `${Number(dispute.freelancerDemandPct)}%` : "Not submitted"}</p>
              <div>
                <p className="font-semibold">Proofs:</p>
                {freelancerEvidence.length === 0 ? (
                  <p style={{ color: colors.mutedFg }}>No evidence uploaded.</p>
                ) : (
                  <div className="space-y-1">
                    {freelancerEvidence.map((e, i) => (
                      <a
                        key={i}
                        href={resolveIpfsUrl(e.ipfsHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block underline break-all"
                        style={{ color: colors.primaryFg }}
                      >
                        {e.ipfsHash}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div className="rounded-lg p-2" style={{ background: colors.warningBg }}>
          <p className="text-xs mb-0.5" style={{ color: colors.mutedFg }}>Client</p>
          <Link href={`/profile/${dispute.client}`} className="font-mono text-xs hover:underline" style={{ color: colors.warningText }}>
            {shortenAddress(dispute.client)}
            {isClientParty && " (you)"}
          </Link>
        </div>
        <div className="rounded-lg p-2" style={{ background: colors.infoBg }}>
          <p className="text-xs mb-0.5" style={{ color: colors.mutedFg }}>Freelancer</p>
          <Link href={`/profile/${dispute.freelancer}`} className="font-mono text-xs hover:underline" style={{ color: colors.infoText }}>
            {shortenAddress(dispute.freelancer)}
            {isFreelancerParty && " (you)"}
          </Link>
        </div>
      </div>

      {/* 3-way vote bar (visible only to parties and admin) */}
      {canSeeVoteBar && (isVotingPhase || isResolved || isAutoResolved || Number(dispute.totalVoters) > 0) && (
        <VoteBar3
          clientVotes={dispute.clientVotes}
          freelancerVotes={dispute.freelancerVotes}
          reProportionVotes={dispute.reProportionVotes}
          colors={colors}
        />
      )}

      {/* Resolution result */}
      {isResolved && (
        <div className="mt-3 rounded-lg p-3 text-sm border" style={{
          background: dispute.clientWon ? colors.warningBg : colors.infoBg,
          borderColor: (dispute.clientWon ? colors.warningText : colors.infoText) + "44",
          color: dispute.clientWon ? colors.warningText : colors.infoText,
        }}>
          {Number(dispute.clientPercent) > 0 && Number(dispute.clientPercent) < 100
            ? `Split resolution — Client: ${Number(dispute.clientPercent)}% · Freelancer: ${100 - Number(dispute.clientPercent)}%`
            : dispute.clientWon
              ? "✓ Client won — Funds refunded"
              : "✓ Freelancer won — Payment released"}
          {Number(dispute.totalVoters) > 0 && ` (${Number(dispute.totalVoters)} voter${Number(dispute.totalVoters) > 1 ? "s" : ""})`}
        </div>
      )}
      {isAutoResolved && (
        <div className="mt-3 rounded-lg p-3 text-sm border" style={{ background: colors.inputBg, borderColor: colors.cardBorder, color: colors.mutedFg }}>
          Auto-resolved (no votes cast or deadline passed)
        </div>
      )}
      {isWithdrawn && (
        <div className="mt-3 rounded-lg p-3 text-sm border" style={{ background: colors.inputBg, borderColor: colors.cardBorder, color: colors.mutedFg }}>
          Dispute was withdrawn by the initiator
        </div>
      )}
      {isEscalated && (
        <div className="mt-3 rounded-lg p-3 text-sm border" style={{ background: colors.dangerBg, borderColor: colors.dangerText + "44", color: colors.dangerText }}>
          <Scale size={14} className="inline mr-1" />Escalated to Admin — awaiting manual resolution
        </div>
      )}

      {/* ── Phase-specific actions ──────────────────────────────── */}

      {/* Response Phase */}
      {isResponsePhase && (
        <div className="mt-3">
          {!responseExpired ? (
            <p className="text-xs" style={{ color: colors.warningText }}>
              <Timer size={14} className="inline mr-1" />Waiting for response · {timeLeft(dispute.responseDeadline)} to respond
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: colors.warningText }}>
                <Clock size={14} className="inline mr-1" />Response deadline passed. Anyone can advance to voting.
              </p>
              <button
                onClick={() => onAdvancePhase(dispute.id)}
                disabled={!!txLoading}
                  className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                style={{ background: colors.primary, color: colors.primaryText }}>
                {txLoading === `advance-${disputeKey}` ? "Advancing…" : "Start Voting Phase"}
              </button>
              {/* Escalate to admin when other party didn't respond */}
              {isParty && !dispute.responseSubmitted && (
                <button
                  onClick={() => {
                    if (!confirm(`Escalate to admin? The other party did not respond within ${responseDays} day${responseDays !== 1 ? "s" : ""}.`)) return;
                    onEscalateToAdmin(dispute.id);
                  }}
                  disabled={!!txLoading}
                  className="w-full border rounded-lg py-2 text-xs disabled:opacity-60"
                  style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                  {txLoading === `escalate-${disputeKey}` ? "Escalating…" : <><Scale size={12} className="inline mr-1" />Escalate to Admin (No Response)</>}
                </button>
              )}
            </div>
          )}

          {/* Submit response (non-initiator only) */}
          {!responseExpired && isParty && !isInitiator && !dispute.responseSubmitted && (
            showResponseForm ? (
              <div className="mt-3 pt-3 space-y-3" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                <p className="text-sm font-medium" style={{ color: colors.pageFg }}>Submit your side of the dispute</p>
                <textarea rows={2} placeholder="Explain your side…"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle}
                  value={responseFormText} onChange={(e) => setResponseFormText(e.target.value)} />
                <EvidenceUploader onUpload={(cid) => setResponseEvidenceHash(cid)} />
                <Input
                  placeholder="IPFS hash or link to evidence"
                  value={responseEvidenceHash}
                  onChange={(e) => setResponseEvidenceHash(e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Your proportion demand %"
                  value={responseDemandPct}
                  onChange={(e) => setResponseDemandPct(e.target.value)}
                />
                <div className="flex gap-2">
                  <button onClick={() => {
                    setShowResponseForm(false);
                    setResponseFormText("");
                    setResponseEvidenceHash("");
                    setResponseDemandPct("50");
                  }}
                    className="flex-1 border rounded-lg py-2 text-sm"
                    style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                  <button
                    onClick={() => onResponse(dispute.id, responseFormText, responseEvidenceHash, parseInt(responseDemandPct || "0")).then(() => {
                      setShowResponseForm(false);
                      setResponseFormText("");
                      setResponseEvidenceHash("");
                      setResponseDemandPct("50");
                    })}
                    disabled={!!txLoading || !responseFormText || !responseEvidenceHash || responseDemandPct === ""}
                    className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                    style={{ background: colors.primary, color: colors.primaryText }}>
                    {txLoading === `response-${disputeKey}` ? "Submitting…" : "Submit Response"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowResponseForm(true)}
                className="mt-3 w-full border rounded-lg py-2 text-sm btn-outline-hover"
                style={{ borderColor: colors.infoText + "55", color: colors.infoText }}>
                <PenLine size={14} className="inline mr-1" />Submit Your Side
              </button>
            )
          )}
          {isResponsePhase && isParty && isInitiator && (
            <p className="mt-3 text-xs text-center" style={{ color: colors.mutedFg }}>
              You raised this dispute. Waiting for the other party to respond.
            </p>
          )}
        </div>
      )}

      {/* Voting Phase — direct vote with 3 options */}
      {isVotingPhase && (
        <div className="mt-3">
          {!votingExpired ? (
            <>
              <p className="text-xs mb-2" style={{ color: colors.infoText }}>
                <Vote size={14} className="inline mr-1" />Voting Phase — {timeLeft(dispute.votingDeadline)} · Cast your vote directly
              </p>
              {/* Non-parties can vote */}
              {!isParty && currentAddress && (
                showVoteForm ? (
                  <div className="pt-3 space-y-3" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                    <p className="text-sm font-medium" style={{ color: colors.pageFg }}>
                      Choose who should win this dispute
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setVoteType(0)}
                        className="flex-1 py-2 rounded-lg text-xs border transition-colors"
                        style={voteType === 0
                          ? { background: colors.warningText, color: "#fff", borderColor: colors.warningText }
                          : { borderColor: colors.cardBorder, color: colors.mutedFg }}>
                        Client wins
                      </button>
                      <button onClick={() => setVoteType(1)}
                        className="flex-1 py-2 rounded-lg text-xs border transition-colors"
                        style={voteType === 1
                          ? { background: colors.infoText, color: "#fff", borderColor: colors.infoText }
                          : { borderColor: colors.cardBorder, color: colors.mutedFg }}>
                        Freelancer wins
                      </button>
                      <button onClick={() => setVoteType(2)}
                        className="flex-1 py-2 rounded-lg text-xs border transition-colors"
                        style={voteType === 2
                          ? { background: colors.badgeText, color: "#fff", borderColor: colors.badgeText }
                          : { borderColor: colors.cardBorder, color: colors.mutedFg }}>
                        Re-proportion
                      </button>
                    </div>
                    {voteType === 2 && (
                      <p className="text-xs" style={{ color: colors.badgeText }}>
                        Re-proportion = split funds based on the parties&apos; demanded percentages
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setShowVoteForm(false)}
                        className="flex-1 border rounded-lg py-2 text-sm"
                        style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                      <button
                        onClick={() => onCastVote(dispute.id, voteType).then(() => setShowVoteForm(false))}
                        disabled={!!txLoading}
                        className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                        style={{ background: colors.primary, color: colors.primaryText }}>
                        {txLoading === `vote-${disputeKey}` ? "Voting…" : "Cast Vote"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowVoteForm(true)}
                    className="w-full border rounded-lg py-2 text-sm btn-outline-hover"
                    style={{ borderColor: colors.primary + "55", color: colors.primaryFg }}>
                    <Vote size={14} className="inline mr-1" />Vote on this Dispute
                  </button>
                )
              )}
              {/* Parties notice */}
              {isParty && (
                <p className="text-xs text-center" style={{ color: colors.mutedFg }}>
                  You&apos;re a party — you cannot vote, but you can set your proportion demand.
                </p>
              )}
              {isParty && (
                <p className="text-xs text-center mt-2" style={{ color: colors.mutedFg }}>
                  Proportion demand is submitted together with your complaint/response.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: colors.warningText }}>
                <Clock size={14} className="inline mr-1" />Voting period ended. Ready to resolve.
              </p>
              {Number(dispute.totalVoters) > 0 ? (
                <button
                  onClick={() => onResolve(dispute.id)}
                  disabled={!!txLoading}
                  className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                  style={{ background: colors.warningText, color: "#fff" }}>
                  {txLoading === `resolve-${disputeKey}` ? "Resolving…" : "Resolve Dispute"}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onAutoResolve(dispute.id)}
                    disabled={!!txLoading}
                    className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
                    style={{ background: colors.muted, color: "#fff" }}>
                    {txLoading === `autoresolve-${disputeKey}` ? "Auto-resolving…" : "Auto-Resolve (No Votes)"}
                  </button>
                  {/* Escalate to admin — no one voted */}
                  {isParty && (
                    <button
                      onClick={() => {
                        if (!confirm("Escalate this dispute to an admin? No one has voted — the admin will decide.")) return;
                        onEscalateToAdmin(dispute.id);
                      }}
                      disabled={!!txLoading}
                      className="w-full border rounded-lg py-2 text-xs disabled:opacity-60"
                      style={{ borderColor: colors.dangerText + "55", color: colors.dangerText }}>
                      {txLoading === `escalate-${disputeKey}` ? "Escalating…" : <><Scale size={12} className="inline mr-1" />Escalate to Admin (No Votes)</>}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function DisputesPage() {
  const { address, signer, provider } = useWallet();
  const { colors } = useTheme();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "resolved" | "mine" | "all">("active");

  // On-chain configurable params
  const [responseDays, setResponseDays] = useState(3);
  const [votingDays, setVotingDays] = useState(5);
  const [voterRewardVrt, setVoterRewardVrt] = useState("2");
  const [minVrtToVote, setMinVrtToVote] = useState("0");
  const [isAdmin, setIsAdmin] = useState(false);

  const contractsConfigured = CONTRACT_ADDRESSES.DisputeResolution !== "";

  // ── Load disputes ─────────────────────────────────────────────────────
  const loadDisputes = useCallback(async () => {
    if (!contractsConfigured) { setLoading(false); return; }
    const reader = provider || signer;
    if (!reader) { setLoading(false); return; }
    try {
      const dr = getDisputeResolution(reader);
      const jm = getJobMarket(reader);
      const count = Number(await dr.disputeCounter());
      const list: Dispute[] = [];
      for (let i = 1; i <= count; i++) {
        try {
          const d = await dr.getDispute(i);
          let client = d.client as string;
          let freelancer = d.freelancer as string;
          if (client === ethers.ZeroAddress) {
            try {
              const job = await jm.getJob(d.jobId);
              client = job.client as string;
              freelancer = job.selectedFreelancer as string;
            } catch {}
          }
          list.push({
            id: d.id, jobId: d.jobId, initiator: d.initiator,
            client, freelancer,
            reason: d.reason, respondentDescription: d.respondentDescription,
            responseSubmitted: d.responseSubmitted,
            status: Number(d.status),
            createdAt: d.createdAt,
            responseDeadline: d.responseDeadline,
            votingDeadline: d.votingDeadline,
            clientVotes: d.clientVotes,
            freelancerVotes: d.freelancerVotes,
            reProportionVotes: d.reProportionVotes,
            clientWon: d.clientWon,
            clientPercent: d.clientPercent,
            totalVoters: d.totalVoters,
            freelancerDemandPct: d.freelancerDemandPct,
            clientDemandPct: d.clientDemandPct,
            freelancerDemandSet: d.freelancerDemandSet,
            clientDemandSet: d.clientDemandSet,
            votingRound: d.votingRound,
          });
        } catch {}
      }
      setDisputes(list.reverse());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [provider, signer, contractsConfigured]);

  // Load configurable params
  useEffect(() => {
    if (!contractsConfigured) return;
    const reader = provider || signer;
    if (!reader) return;
    (async () => {
      try {
        const dr = getDisputeResolution(reader);
        try { setResponseDays(Math.round(Number(await dr.RESPONSE_PERIOD()) / 86400)); } catch {}
        try { setVotingDays(Math.round(Number(await dr.VOTING_PERIOD()) / 86400)); } catch {}
        try { setVoterRewardVrt(parseFloat(ethers.formatEther(await dr.VOTER_REWARD())).toString()); } catch {}
        try { setMinVrtToVote(parseFloat(ethers.formatEther(await dr.MIN_VRT_TO_VOTE())).toString()); } catch {}
      } catch {}
    })();
  }, [provider, signer, contractsConfigured]);

  useEffect(() => {
    if (!contractsConfigured || !address) {
      setIsAdmin(false);
      return;
    }
    const reader = provider || signer;
    if (!reader) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      try {
        const dr = getDisputeResolution(reader);
        const role = await dr.ADMIN_ROLE();
        const ok = await dr.hasRole(role, address);
        setIsAdmin(Boolean(ok));
      } catch {
        setIsAdmin(false);
      }
    })();
  }, [provider, signer, contractsConfigured, address]);

  useEffect(() => { setLoading(true); loadDisputes(); }, [loadDisputes]);
  useEffect(() => {
    if (!provider) return;
    provider.on("block", loadDisputes);
    return () => { provider.off("block", loadDisputes); };
  }, [provider, loadDisputes]);

  // ── Transaction helper ────────────────────────────────────────────────
  const runTx = async (key: string, fn: () => Promise<void>) => {
    if (!signer) return;
    setTxLoading(key); setTxError(null);
    try { await fn(); await loadDisputes(); }
    catch (e: any) { setTxError(e?.reason || e?.message?.split("(")[0] || "Transaction failed"); }
    finally { setTxLoading(null); }
  };

  // ── Direct vote (no commit/reveal needed) ────────────────────────────
  const handleCastVote = async (disputeId: bigint, voteType: number) => {
    if (!signer) return;
    await runTx(`vote-${disputeId.toString()}`, async () => {
      const tx = await getDisputeResolution(signer).castVote(disputeId, voteType);
      await tx.wait();
    });
  };

  // ── Advance to voting phase ───────────────────────────────────────────
  const handleAdvancePhase = async (disputeId: bigint) => {
    if (!signer) return;
    await runTx(`advance-${disputeId.toString()}`, async () => {
      const tx = await getDisputeResolution(signer).advanceToVotingPhase(disputeId);
      await tx.wait();
    });
  };

  // ── Resolve dispute ───────────────────────────────────────────────────
  const handleResolve = async (disputeId: bigint) => {
    if (!signer) return;
    await runTx(`resolve-${disputeId.toString()}`, async () => {
      const tx = await getDisputeResolution(signer).resolveDispute(disputeId);
      await tx.wait();
    });
  };

  // ── Auto-resolve (no votes) ───────────────────────────────────────────
  const handleAutoResolve = async (disputeId: bigint) => {
    if (!signer) return;
    await runTx(`autoresolve-${disputeId.toString()}`, async () => {
      const tx = await getDisputeResolution(signer).autoResolveDispute(disputeId);
      await tx.wait();
    });
  };

  // ── Submit response ───────────────────────────────────────────────────
  const handleResponse = async (disputeId: bigint, text: string, evidenceHash: string, myPct: number) => {
    if (!signer) return;
    await runTx(`response-${disputeId.toString()}`, async () => {
      const dr = getDisputeResolution(signer);
      const tx = await dr.submitResponseWithEvidenceAndDemand(disputeId, text, evidenceHash, myPct);
      await tx.wait();

      loadEvidenceForDispute(disputeId);
    });
  };

  // ── Escalate to admin ─────────────────────────────────────────────────
  const handleEscalateToAdmin = async (disputeId: bigint) => {
    if (!signer) return;
    await runTx(`escalate-${disputeId.toString()}`, async () => {
      const tx = await getDisputeResolution(signer).escalateToAdmin(disputeId);
      await tx.wait();
    });
  };

  // ── Evidence cache ────────────────────────────────────────────────────
  const [evidenceMap, setEvidenceMap] = useState<Record<string, { party: string; ipfsHash: string; timestamp: bigint }[]>>({});

  const loadEvidenceForDispute = useCallback(async (disputeId: bigint) => {
    const reader = provider || signer;
    if (!reader) return;
    try {
      const dr = getDisputeResolution(reader);
      const evs: any[] = await dr.getEvidence(disputeId);
      setEvidenceMap(prev => ({
        ...prev,
        [disputeId.toString()]: evs.map((e: any) => ({ party: e.party, ipfsHash: e.ipfsHash, timestamp: e.timestamp })),
      }));
    } catch {}
  }, [provider, signer]);

  // Load evidence for all displayed disputes
  useEffect(() => {
    if (disputes.length === 0) return;
    disputes.forEach(d => loadEvidenceForDispute(d.id));
  }, [disputes, loadEvidenceForDispute]);

  // ── Filtering ─────────────────────────────────────────────────────────
  const displayed = disputes.filter((d) => {
    if (filter === "active") return d.status <= 2; // Active, ResponsePhase, VotingPhase
    if (filter === "resolved") return d.status === 3 || d.status === 4; // Resolved, AutoResolved
    if (filter === "mine") {
      const addr = address?.toLowerCase();
      return addr && (d.client.toLowerCase() === addr || d.freelancer.toLowerCase() === addr);
    }
    return true;
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold" style={{ color: colors.pageFg }}>Dispute Resolution</h1>
        <p className="mt-2 leading-relaxed" style={{ color: colors.mutedFg }}>Vote on disputes using your VRT tokens. Winners earn rewards.<br />Fair, transparent, community-driven conflict resolution.</p>
      </div>

      <div className="border rounded-xl p-4 mb-6 text-sm" style={{ background: colors.primaryLight, borderColor: colors.primaryFg + "22" }}>
        <p className="font-semibold mb-2" style={{ color: colors.primaryFg }}>How dispute resolution works:</p>
        <ul className="space-y-1 list-disc list-inside" style={{ color: colors.mutedFg }}>
          <li>When a dispute is raised, the other party has <strong style={{ color: colors.pageFg }}>{responseDays} day{responseDays !== 1 ? "s" : ""}</strong> to submit their side</li>
          <li>After both sides are submitted (or {responseDays} day{responseDays !== 1 ? "s" : ""} pass), <strong style={{ color: colors.pageFg }}>Voting Phase</strong> opens (lasts {votingDays} day{votingDays !== 1 ? "s" : ""})</li>
          <li>Voters choose: <strong style={{ color: colors.warningText }}>Client wins</strong> · <strong style={{ color: colors.primaryFg }}>Freelancer wins</strong> · <strong style={{ color: colors.badgeText }}>Re-proportion</strong> (split by demand %)</li>
          <li>Both parties can set their <strong style={{ color: colors.pageFg }}>proportion demand (%)</strong> before the vote</li>
          <li>If voting stalls, either party can <strong style={{ color: colors.pageFg }}>escalate to admin</strong> for manual resolution</li>
        </ul>
      </div>

      {!address && (
        <p className="text-center py-20" style={{ color: colors.mutedFg }}>Connect your wallet to see and vote on disputes.</p>
      )}

      {address && contractsConfigured && (
        <>
          <div className="flex gap-6 mb-6" style={{ borderBottom: `2px solid ${colors.cardBorder}` }}>
            {(["active", "resolved", "mine", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className="relative pb-2.5 text-sm font-medium transition-colors -mb-0.5"
                style={filter === f
                  ? { color: colors.primaryFg, borderBottom: `2px solid ${colors.primaryFg}` }
                  : { color: colors.mutedFg, borderBottom: "2px solid transparent" }}>
                {f === "mine" ? "My Disputes" : f === "active" ? "Active" : f === "resolved" ? "Resolved" : "All"}
              </button>
            ))}
          </div>

          {txError && (
            <div className="text-sm rounded-lg p-3 mb-4" style={{ background: colors.dangerBg, color: colors.dangerText }}>{txError}</div>
          )}

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => <div key={i} className="rounded-xl h-48 animate-pulse" style={{ background: colors.inputBg }} />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-20" style={{ color: colors.mutedFg }}>
              <p className="text-lg">
                {filter === "active" ? "No active disputes." : filter === "resolved" ? "No resolved disputes yet." : filter === "mine" ? "You're not involved in any disputes." : "No disputes found."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayed.map((d) => (
                <DisputeCard
                  key={d.id.toString()}
                  dispute={d}
                  currentAddress={address}
                  onCastVote={handleCastVote}
                  onAdvancePhase={handleAdvancePhase}
                  onResolve={handleResolve}
                  onAutoResolve={handleAutoResolve}
                  onResponse={handleResponse}
                  onEscalateToAdmin={handleEscalateToAdmin}
                  evidence={evidenceMap[d.id.toString()] || []}
                  txLoading={txLoading}
                  colors={colors}
                  responseDays={responseDays}
                  canSeeVoteBar={Boolean(address) && (
                    d.client.toLowerCase() === address.toLowerCase() ||
                    d.freelancer.toLowerCase() === address.toLowerCase() ||
                    isAdmin
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
