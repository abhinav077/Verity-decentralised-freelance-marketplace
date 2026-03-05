"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getEscrow, getDisputeResolution, getGovernance, getReputationLoans,
  getInsurancePool, getVRTToken, getJobMarket,
  getBountyBoard, getProvider,
  formatEth, formatVrt, shortenAddress,
  DISPUTE_STATUS, disputeStatusStyle,
} from "@/lib/contracts";
import { ethers } from "ethers";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** seconds → human-readable */
function fmtDuration(s: bigint | number): string {
  const sec = Number(s);
  if (sec === 0) return "0";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${sec}s`);
  return parts.join(" ");
}

/** BPS → percentage string */
function fmtBps(bps: bigint | number): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TxLog = { id: number; label: string; status: "pending" | "success" | "error"; hash?: string; error?: string; ts: number };

type ParamDef = {
  key: string;
  label: string;
  /** How to display the raw value */
  display: "duration" | "bps" | "vrt" | "eth" | "raw";
  /** Input unit hint */
  inputUnit: string;
  /** Contract getter name */
  getter: string;
  /** Contract setter name */
  setter: string;
  /** For duration: user types days and we multiply by 86400 */
  inputMultiplier?: number;
  /** For VRT/ETH: parseEther the input */
  parseEther?: boolean;
};

type SectionDef = {
  title: string;
  icon: string;
  contractKey: string;
  params: ParamDef[];
};

// ─── Section definitions ─────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  {
    title: "Jobs & Payments",
    icon: "💼",
    contractKey: "jobMarket",
    params: [
      { key: "jm_autoRelease", label: "Auto-Release Period", display: "duration", inputUnit: "days", getter: "AUTO_RELEASE_PERIOD", setter: "setAutoReleasePeriod", inputMultiplier: 86400 },
      { key: "jm_repReward", label: "Reputation Reward", display: "vrt", inputUnit: "VRT", getter: "REPUTATION_REWARD", setter: "setReputationReward", parseEther: true },
      { key: "jm_cancelPenalty", label: "Cancel Penalty", display: "bps", inputUnit: "BPS (100 = 1%)", getter: "CANCEL_PENALTY_BPS", setter: "setCancelPenaltyBps" },
      { key: "jm_minVrtBid", label: "Min VRT to Bid", display: "vrt", inputUnit: "VRT", getter: "minVrtToBid", setter: "setMinVrtToBid", parseEther: true },
    ],
  },
  {
    title: "Platform Fees",
    icon: "💰",
    contractKey: "escrow",
    params: [
      { key: "es_platformFee", label: "Platform Fee", display: "bps", inputUnit: "BPS (100 = 1%)", getter: "platformFeeBps", setter: "setPlatformFee" },
      { key: "es_maxFee", label: "Max Fee Cap", display: "bps", inputUnit: "BPS (100 = 1%)", getter: "MAX_FEE_BPS", setter: "setMaxFeeBps" },
    ],
  },
  {
    title: "Disputes",
    icon: "⚖️",
    contractKey: "disputes",
    params: [
      { key: "dr_response", label: "Response Period", display: "duration", inputUnit: "days", getter: "RESPONSE_PERIOD", setter: "setResponsePeriod", inputMultiplier: 86400 },
      { key: "dr_voting", label: "Voting Period", display: "duration", inputUnit: "days", getter: "VOTING_PERIOD", setter: "setVotingPeriod", inputMultiplier: 86400 },
      { key: "dr_autoResolve", label: "Auto-Resolve Deadline", display: "duration", inputUnit: "days", getter: "AUTO_RESOLVE_DEADLINE", setter: "setAutoResolveDeadline", inputMultiplier: 86400 },
      { key: "dr_voterReward", label: "Voter Reward", display: "vrt", inputUnit: "VRT", getter: "VOTER_REWARD", setter: "setVoterReward", parseEther: true },
      { key: "dr_minVrtVote", label: "Min VRT to Vote", display: "vrt", inputUnit: "VRT", getter: "MIN_VRT_TO_VOTE", setter: "setMinVrtToVote", parseEther: true },
    ],
  },
  {
    title: "Governance",
    icon: "🏛️",
    contractKey: "governance",
    params: [
      { key: "gv_minPropose", label: "Min VRT to Propose", display: "vrt", inputUnit: "VRT", getter: "MIN_VRT_TO_PROPOSE", setter: "setMinVrtToPropose", parseEther: true },
      { key: "gv_votePeriod", label: "Voting Period", display: "duration", inputUnit: "days", getter: "VOTING_PERIOD", setter: "setGovVotingPeriod", inputMultiplier: 86400 },
      { key: "gv_quorum", label: "Min Quorum", display: "bps", inputUnit: "BPS (1000 = 10%)", getter: "MIN_QUORUM_BPS", setter: "setMinQuorumBps" },
      { key: "gv_minCrowdfund", label: "Min VRT to Crowdfund", display: "vrt", inputUnit: "VRT", getter: "MIN_VRT_TO_CROWDFUND", setter: "setMinVrtToCrowdfund", parseEther: true },
    ],
  },
  {
    title: "Insurance Pool",
    icon: "🛡️",
    contractKey: "insurance",
    params: [
      { key: "in_coverMult", label: "Coverage Multiplier", display: "raw", inputUnit: "×", getter: "COVERAGE_MULTIPLIER", setter: "setCoverageMultiplier" },
      { key: "in_duration", label: "Policy Duration", display: "duration", inputUnit: "days", getter: "POLICY_DURATION", setter: "setPolicyDuration", inputMultiplier: 86400 },
      { key: "in_minPremium", label: "Min Premium", display: "eth", inputUnit: "ETH", getter: "MIN_PREMIUM", setter: "setMinPremium", parseEther: true },
    ],
  },
  {
    title: "Reputation Loans",
    icon: "🏦",
    contractKey: "loans",
    params: [
      { key: "ln_maxAmount", label: "Max Loan Amount", display: "vrt", inputUnit: "VRT", getter: "MAX_LOAN_AMOUNT", setter: "setMaxLoanAmount", parseEther: true },
      { key: "ln_duration", label: "Loan Duration", display: "duration", inputUnit: "days", getter: "LOAN_DURATION", setter: "setLoanDuration", inputMultiplier: 86400 },
      { key: "ln_collateral", label: "Collateral per 10 VRT", display: "eth", inputUnit: "ETH", getter: "COLLATERAL_PER_10_VRT", setter: "setCollateralPer10Vrt", parseEther: true },
    ],
  },
  {
    title: "Bounties",
    icon: "🎯",
    contractKey: "bounty",
    params: [
      { key: "bb_vrtReward", label: "Bounty VRT Reward", display: "vrt", inputUnit: "VRT", getter: "BOUNTY_VRT_REWARD", setter: "setBountyVrtReward", parseEther: true },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { address, provider } = useWallet();
  const { colors } = useTheme();

  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  // Parameter values: key → raw bigint
  const [values, setValues] = useState<Record<string, bigint>>({});
  // Input fields: key → user-typed string
  const [inputs, setInputs] = useState<Record<string, string>>({});
  // Tx log
  const [txLog, setTxLog] = useState<TxLog[]>([]);
  const [txId, setTxId] = useState(0);

  // VRT tier thresholds (separate since setter takes 3 args)
  const [silverThresh, setSilverThresh] = useState<bigint>(0n);
  const [goldThresh, setGoldThresh] = useState<bigint>(0n);
  const [platThresh, setPlatThresh] = useState<bigint>(0n);
  const [silverIn, setSilverIn] = useState("");
  const [goldIn, setGoldIn] = useState("");
  const [platIn, setPlatIn] = useState("");

  // Tier discounts
  const [tierDiscounts, setTierDiscounts] = useState<bigint[]>([0n, 0n, 0n, 0n]);
  const [tierDiscountInputs, setTierDiscountInputs] = useState(["", "", "", ""]);

  // Escalated disputes
  const [escalated, setEscalated] = useState<any[]>([]);
  const [resolveInputs, setResolveInputs] = useState<Record<number, string>>({});

  // Treasury
  const [treasuryBal, setTreasuryBal] = useState<bigint>(0n);
  const [treasuryTo, setTreasuryTo] = useState("");
  const [treasuryAmt, setTreasuryAmt] = useState("");

  // Fee balances
  const [escrowFees, setEscrowFees] = useState<bigint>(0n);

  // Proposals
  const [proposals, setProposals] = useState<any[]>([]);

  // VRT mint/burn
  const [mintTo, setMintTo] = useState("");
  const [mintAmt, setMintAmt] = useState("");
  const [burnFrom, setBurnFrom] = useState("");
  const [burnAmt, setBurnAmt] = useState("");

  // ── Log helper ──
  const addLog = useCallback((label: string): number => {
    const id = Date.now();
    setTxLog(prev => [{ id, label, status: "pending" as const, ts: id }, ...prev].slice(0, 50));
    return id;
  }, []);

  const updateLog = useCallback((id: number, update: Partial<TxLog>) => {
    setTxLog(prev => prev.map(l => l.id === id ? { ...l, ...update } : l));
  }, []);

  // ── Contract getter helper ──
  const getContract = useCallback((key: string, sp: any) => {
    const map: Record<string, (sp: any) => any> = {
      jobMarket: getJobMarket,
      escrow: getEscrow,
      disputes: getDisputeResolution,
      governance: getGovernance,
      insurance: getInsurancePool,
      loans: getReputationLoans,
      bounty: getBountyBoard,
    };
    return map[key]?.(sp);
  }, []);

  // ── Admin check ──
  useEffect(() => {
    (async () => {
      setChecking(true);
      if (!provider || !address) { setChecking(false); return; }
      try {
        const escrow = getEscrow(provider);
        const role = await escrow.ADMIN_ROLE();
        const ok = await escrow.hasRole(role, address);
        setIsAdmin(ok);
      } catch { setIsAdmin(false); }
      setChecking(false);
    })();
  }, [provider, address]);

  // ── Load all values ──
  const loadAll = useCallback(async () => {
    if (!provider || !isAdmin) return;
    const newVals: Record<string, bigint> = {};

    // Load configurable params
    for (const sec of SECTIONS) {
      try {
        const c = getContract(sec.contractKey, provider);
        if (!c) continue;
        for (const p of sec.params) {
          try { newVals[p.key] = await c[p.getter](); } catch {}
        }
      } catch {}
    }
    setValues(newVals);

    // VRT thresholds
    try {
      const vrt = getVRTToken(provider);
      setSilverThresh(await vrt.SILVER_THRESHOLD());
      setGoldThresh(await vrt.GOLD_THRESHOLD());
      setPlatThresh(await vrt.PLATINUM_THRESHOLD());
      const discs: bigint[] = [];
      for (let t = 0; t < 4; t++) {
        try { discs.push(await vrt.tierFeeDiscount(t)); } catch { discs.push(0n); }
      }
      setTierDiscounts(discs);
    } catch {}

    // Escalated disputes
    try {
      const dr = getDisputeResolution(provider);
      const count = Number(await dr.disputeCounter());
      const esc: any[] = [];
      for (let i = 1; i <= count; i++) {
        try {
          const d = await dr.getDispute(i);
          if (Number(d.status) === 6) esc.push(d);
        } catch {}
      }
      setEscalated(esc);
    } catch {}

    // Treasury
    try { setTreasuryBal(await getGovernance(provider).treasuryBalance()); } catch {}

    // Escrow fees
    try { setEscrowFees(await getEscrow(provider).collectedFees()); } catch {}

    // Proposals (for execute)
    try {
      const gov = getGovernance(provider);
      const cnt = Number(await gov.proposalCounter());
      const arr: any[] = [];
      for (let i = cnt; i >= 1; i--) {
        try {
          const p = await gov.getProposal(i);
          if (Number(p.status) === 1) arr.push(p); // Passed = executable
        } catch {}
      }
      setProposals(arr);
    } catch {}
  }, [provider, isAdmin, getContract]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Display a value ──
  function displayVal(p: ParamDef, raw: bigint | undefined): string {
    if (raw === undefined) return "…";
    switch (p.display) {
      case "duration": return fmtDuration(raw);
      case "bps": return fmtBps(raw);
      case "vrt": return formatVrt(raw) + " VRT";
      case "eth": return formatEth(raw) + " ETH";
      default: return raw.toString();
    }
  }

  // ── Build tx value from input ──
  function buildTxValue(p: ParamDef, input: string): bigint {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Empty input");
    if (p.parseEther) return ethers.parseEther(trimmed);
    if (p.inputMultiplier) return BigInt(Math.round(parseFloat(trimmed) * p.inputMultiplier));
    return BigInt(trimmed);
  }

  // ── Update a single param ──
  async function updateParam(sec: SectionDef, p: ParamDef) {
    const val = inputs[p.key];
    if (!val?.trim()) return;
    setBusy(true);
    const lid = addLog(`Set ${p.label}`);
    try {
      const signer = await (await getProvider()).getSigner();
      const c = getContract(sec.contractKey, signer);
      const txVal = buildTxValue(p, val);
      const tx = await c[p.setter](txVal);
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      setInputs(prev => ({ ...prev, [p.key]: "" }));
      window.dispatchEvent(new Event("dfm:tx"));
      loadAll();
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Resolve escalated dispute ──
  async function resolveEscalated(disputeId: number) {
    const pct = resolveInputs[disputeId];
    if (!pct?.trim()) return;
    setBusy(true);
    const lid = addLog(`Resolve Dispute #${disputeId}`);
    try {
      const signer = await (await getProvider()).getSigner();
      const dr = getDisputeResolution(signer);
      const tx = await dr.resolveEscalatedDispute(disputeId, BigInt(pct));
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      window.dispatchEvent(new Event("dfm:tx"));
      loadAll();
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Withdraw Escrow fees ──
  async function withdrawEscrowFees() {
    setBusy(true);
    const lid = addLog("Withdraw Escrow Fees");
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getEscrow(signer).withdrawFees();
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      window.dispatchEvent(new Event("dfm:tx"));
      loadAll();
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Treasury withdraw ──
  async function withdrawTreasury() {
    if (!treasuryTo.trim() || !treasuryAmt.trim()) return;
    setBusy(true);
    const lid = addLog("Withdraw Treasury");
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getGovernance(signer).withdrawTreasury(treasuryTo, ethers.parseEther(treasuryAmt));
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      setTreasuryTo(""); setTreasuryAmt("");
      window.dispatchEvent(new Event("dfm:tx"));
      loadAll();
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Execute passed proposal ──
  async function executeProposal(pid: number) {
    setBusy(true);
    const lid = addLog(`Execute Proposal #${pid}`);
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getGovernance(signer).executeProposal(pid);
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      window.dispatchEvent(new Event("dfm:tx"));
      loadAll();
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── VRT Mint / Burn ──
  async function handleMint() {
    if (!mintTo.trim() || !mintAmt.trim()) return;
    setBusy(true);
    const lid = addLog("Mint VRT");
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getVRTToken(signer).mint(mintTo, ethers.parseEther(mintAmt));
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      setMintTo(""); setMintAmt("");
      window.dispatchEvent(new Event("dfm:tx"));
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  async function handleBurn() {
    if (!burnFrom.trim() || !burnAmt.trim()) return;
    setBusy(true);
    const lid = addLog("Burn VRT");
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getVRTToken(signer).burn(burnFrom, ethers.parseEther(burnAmt));
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      setBurnFrom(""); setBurnAmt("");
      window.dispatchEvent(new Event("dfm:tx"));
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Set tier thresholds ──
  async function handleSetThresholds() {
    if (!silverIn.trim() || !goldIn.trim() || !platIn.trim()) return;
    setBusy(true);
    const lid = addLog("Set Tier Thresholds");
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getVRTToken(signer).setTierThresholds(
        ethers.parseEther(silverIn),
        ethers.parseEther(goldIn),
        ethers.parseEther(platIn),
      );
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      setSilverIn(""); setGoldIn(""); setPlatIn("");
      window.dispatchEvent(new Event("dfm:tx"));
      loadAll();
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Set tier discount ──
  async function handleSetTierDiscount(tier: number) {
    const val = tierDiscountInputs[tier];
    if (!val?.trim()) return;
    setBusy(true);
    const lid = addLog(`Set Tier ${tier} Discount`);
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getVRTToken(signer).setTierFeeDiscount(tier, BigInt(val));
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      setTierDiscountInputs(prev => prev.map((v, i) => i === tier ? "" : v));
      window.dispatchEvent(new Event("dfm:tx"));
      loadAll();
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Withdraw forfeited collateral ──
  async function withdrawForfeited() {
    setBusy(true);
    const lid = addLog("Withdraw Forfeited Collateral");
    try {
      const signer = await (await getProvider()).getSigner();
      const tx = await getReputationLoans(signer).withdrawForfeitedCollateral();
      await tx.wait();
      updateLog(lid, { status: "success", hash: tx.hash });
      window.dispatchEvent(new Event("dfm:tx"));
    } catch (err: any) {
      updateLog(lid, { status: "error", error: err?.reason || err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  // ── Styles ──
  const cardStyle: React.CSSProperties = {
    background: colors.cardBg,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 16,
    padding: 24,
  };

  const inputStyle: React.CSSProperties = {
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    borderRadius: 8,
    padding: "8px 12px",
    color: colors.pageFg,
    outline: "none",
    width: "100%",
    fontSize: 14,
  };

  const btnPrimary: React.CSSProperties = {
    background: colors.primary,
    color: colors.primaryText,
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
    fontSize: 13,
    whiteSpace: "nowrap",
  };

  const btnOutline: React.CSSProperties = {
    background: "transparent",
    color: colors.primaryFg,
    border: `1px solid ${colors.primary}`,
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
    fontSize: 13,
    whiteSpace: "nowrap",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: colors.pageFg,
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: colors.mutedFg,
    marginBottom: 4,
  };

  const currentValStyle: React.CSSProperties = {
    fontSize: 12,
    color: colors.muted,
  };

  // ── Access gate ──
  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div style={{ ...cardStyle, maxWidth: 480, margin: "0 auto" }} className="card-hover">
          <p style={{ fontSize: 48, marginBottom: 16 }}>🔐</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.pageFg, marginBottom: 8 }}>Admin Panel</h2>
          <p style={{ color: colors.mutedFg }}>Connect your wallet to access the admin panel.</p>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p style={{ color: colors.mutedFg, fontSize: 16 }}>Checking admin access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div style={{ ...cardStyle, maxWidth: 480, margin: "0 auto" }} className="card-hover">
          <p style={{ fontSize: 48, marginBottom: 16 }}>🚫</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.dangerText, marginBottom: 8 }}>Access Denied</h2>
          <p style={{ color: colors.mutedFg }}>
            Connected wallet <strong style={{ color: colors.pageFg }}>{shortenAddress(address)}</strong> does not have admin privileges.
          </p>
        </div>
      </div>
    );
  }

  // ── Render param row ──
  function renderParamRow(sec: SectionDef, p: ParamDef) {
    const raw = values[p.key];
    return (
      <div key={p.key} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", minWidth: 180 }}>
          <div style={labelStyle}>{p.label}</div>
          <div style={currentValStyle}>Current: <strong style={{ color: colors.pageFg }}>{displayVal(p, raw)}</strong>{raw !== undefined ? ` (raw: ${raw.toString()})` : ""}</div>
        </div>
        <div style={{ flex: "1 1 160px", minWidth: 140 }}>
          <input
            style={inputStyle}
            placeholder={p.inputUnit}
            value={inputs[p.key] || ""}
            onChange={e => setInputs(prev => ({ ...prev, [p.key]: e.target.value }))}
            disabled={busy}
          />
        </div>
        <button
          className="btn-hover"
          style={btnPrimary}
          disabled={busy || !inputs[p.key]?.trim()}
          onClick={() => updateParam(sec, p)}
        >
          Save
        </button>
      </div>
    );
  }

  // ── Main render ──
  return (
    <div style={{ minHeight: "100vh", background: colors.pageBg, color: colors.pageFg }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>🔐 Admin Panel</h1>
          <p style={{ color: colors.mutedFg, fontSize: 14 }}>
            Platform configuration &amp; management — connected as <strong style={{ color: colors.primaryFg }}>{shortenAddress(address)}</strong>
          </p>
          <button
            className="btn-outline-hover"
            style={{ ...btnOutline, marginTop: 12 }}
            onClick={loadAll}
            disabled={busy}
          >
            ↻ Refresh All Values
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Configurable Parameter Sections ── */}
          {SECTIONS.map(sec => (
            <div key={sec.title} style={cardStyle} className="card-hover">
              <div style={sectionTitle}><span>{sec.icon}</span> {sec.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {sec.params.map(p => renderParamRow(sec, p))}
              </div>
            </div>
          ))}

          {/* ── VRT Token & Tiers ── */}
          <div style={cardStyle} className="card-hover">
            <div style={sectionTitle}><span>🪙</span> VRT Token &amp; Tiers</div>

            {/* Thresholds */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Tier Thresholds</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {[
                  { label: "Silver", val: silverThresh, state: silverIn, set: setSilverIn },
                  { label: "Gold", val: goldThresh, state: goldIn, set: setGoldIn },
                  { label: "Platinum", val: platThresh, state: platIn, set: setPlatIn },
                ].map(t => (
                  <div key={t.label}>
                    <div style={{ fontSize: 12, color: colors.mutedFg, marginBottom: 4 }}>
                      {t.label}: <strong style={{ color: colors.pageFg }}>{formatVrt(t.val)} VRT</strong>
                    </div>
                    <input
                      style={inputStyle}
                      placeholder={`New ${t.label} (VRT)`}
                      value={t.state}
                      onChange={e => t.set(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                ))}
              </div>
              <button
                className="btn-hover"
                style={{ ...btnPrimary, marginTop: 12 }}
                disabled={busy || !silverIn.trim() || !goldIn.trim() || !platIn.trim()}
                onClick={handleSetThresholds}
              >
                Update All Thresholds
              </button>
            </div>

            {/* Tier fee discounts */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Tier Fee Discounts (BPS)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {["Bronze", "Silver", "Gold", "Platinum"].map((name, i) => (
                  <div key={name}>
                    <div style={{ fontSize: 12, color: colors.mutedFg, marginBottom: 4 }}>
                      {name}: <strong style={{ color: colors.pageFg }}>{fmtBps(tierDiscounts[i])}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder="BPS"
                        value={tierDiscountInputs[i]}
                        onChange={e => setTierDiscountInputs(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                        disabled={busy}
                      />
                      <button
                        className="btn-hover"
                        style={btnPrimary}
                        disabled={busy || !tierDiscountInputs[i]?.trim()}
                        onClick={() => handleSetTierDiscount(i)}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mint / Burn */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={labelStyle}>Mint VRT</div>
                <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="Address" value={mintTo} onChange={e => setMintTo(e.target.value)} disabled={busy} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...inputStyle, flex: 1 }} placeholder="Amount (VRT)" value={mintAmt} onChange={e => setMintAmt(e.target.value)} disabled={busy} />
                  <button className="btn-hover" style={btnPrimary} disabled={busy || !mintTo.trim() || !mintAmt.trim()} onClick={handleMint}>Mint</button>
                </div>
              </div>
              <div>
                <div style={labelStyle}>Burn VRT</div>
                <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="Address" value={burnFrom} onChange={e => setBurnFrom(e.target.value)} disabled={busy} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...inputStyle, flex: 1 }} placeholder="Amount (VRT)" value={burnAmt} onChange={e => setBurnAmt(e.target.value)} disabled={busy} />
                  <button className="btn-hover" style={btnPrimary} disabled={busy || !burnFrom.trim() || !burnAmt.trim()} onClick={handleBurn}>Burn</button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Escalated Disputes ── */}
          <div style={cardStyle} className="card-hover">
            <div style={sectionTitle}><span>🚨</span> Escalated Disputes</div>
            {escalated.length === 0 ? (
              <p style={{ color: colors.mutedFg, fontSize: 14 }}>No escalated disputes.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {escalated.map((d: any) => {
                  const did = Number(d.id);
                  return (
                    <div key={did} style={{ background: colors.surfaceBg, borderRadius: 12, padding: 16, border: `1px solid ${colors.divider}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <strong>Dispute #{did}</strong> — Job #{Number(d.jobId)}
                          <span style={{ ...disputeStatusStyle(Number(d.status), colors as any), padding: "2px 8px", borderRadius: 999, fontSize: 11, marginLeft: 8 }}>
                            {DISPUTE_STATUS[Number(d.status)]}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: colors.mutedFg }}>
                          Client: {shortenAddress(d.client)} — Freelancer: {shortenAddress(d.freelancer)}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: colors.mutedFg, marginTop: 6 }}>{d.reason}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                        <input
                          style={{ ...inputStyle, maxWidth: 200 }}
                          placeholder="Freelancer % (0-100)"
                          value={resolveInputs[did] || ""}
                          onChange={e => setResolveInputs(prev => ({ ...prev, [did]: e.target.value }))}
                          disabled={busy}
                        />
                        <button
                          className="btn-hover"
                          style={btnPrimary}
                          disabled={busy || !resolveInputs[did]?.trim()}
                          onClick={() => resolveEscalated(did)}
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Treasury & Fees ── */}
          <div style={cardStyle} className="card-hover">
            <div style={sectionTitle}><span>🏦</span> Treasury &amp; Fees</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: colors.surfaceBg, borderRadius: 12, padding: 16, border: `1px solid ${colors.divider}` }}>
                <div style={{ fontSize: 13, color: colors.mutedFg }}>Governance Treasury</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: colors.primaryFg }}>{formatEth(treasuryBal)} ETH</div>
              </div>
              <div style={{ background: colors.surfaceBg, borderRadius: 12, padding: 16, border: `1px solid ${colors.divider}` }}>
                <div style={{ fontSize: 13, color: colors.mutedFg }}>Collected Escrow Fees</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: colors.primaryFg }}>{formatEth(escrowFees)} ETH</span>
                  <button className="btn-hover" style={btnPrimary} disabled={busy || escrowFees === 0n} onClick={withdrawEscrowFees}>Withdraw</button>
                </div>
              </div>
            </div>

            {/* Treasury withdraw */}
            <div style={labelStyle}>Withdraw from Treasury</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input style={{ ...inputStyle, flex: "1 1 200px" }} placeholder="Recipient address" value={treasuryTo} onChange={e => setTreasuryTo(e.target.value)} disabled={busy} />
              <input style={{ ...inputStyle, flex: "0 0 120px", maxWidth: 140 }} placeholder="Amount (ETH)" value={treasuryAmt} onChange={e => setTreasuryAmt(e.target.value)} disabled={busy} />
              <button className="btn-hover" style={btnPrimary} disabled={busy || !treasuryTo.trim() || !treasuryAmt.trim()} onClick={withdrawTreasury}>Send</button>
            </div>
          </div>

          {/* ── Execute Proposals ── */}
          <div style={cardStyle} className="card-hover">
            <div style={sectionTitle}><span>📜</span> Execute Passed Proposals</div>
            {proposals.length === 0 ? (
              <p style={{ color: colors.mutedFg, fontSize: 14 }}>No proposals awaiting execution.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {proposals.map((p: any) => (
                  <div key={Number(p.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: colors.surfaceBg, borderRadius: 10, padding: "10px 14px", border: `1px solid ${colors.divider}` }}>
                    <div>
                      <strong>#{Number(p.id)}</strong> {p.title}
                      <span style={{ fontSize: 12, color: colors.mutedFg, marginLeft: 8 }}>For: {p.forVotes?.toString()} / Against: {p.againstVotes?.toString()}</span>
                    </div>
                    <button className="btn-hover" style={btnPrimary} disabled={busy} onClick={() => executeProposal(Number(p.id))}>Execute</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Loans: Withdraw forfeited collateral ── */}
          <div style={cardStyle} className="card-hover">
            <div style={sectionTitle}><span>💸</span> Forfeited Loan Collateral</div>
            <p style={{ color: colors.mutedFg, fontSize: 14, marginBottom: 12 }}>
              Withdraw any forfeited collateral from defaulted loans to the admin wallet.
            </p>
            <button className="btn-hover" style={btnPrimary} disabled={busy} onClick={withdrawForfeited}>
              Withdraw Forfeited Collateral
            </button>
          </div>

          {/* ── Transaction Log ── */}
          <div style={cardStyle} className="card-hover">
            <div style={sectionTitle}><span>📋</span> Transaction Log</div>
            {txLog.length === 0 ? (
              <p style={{ color: colors.mutedFg, fontSize: 14 }}>No transactions yet this session.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                {txLog.map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 10px", borderRadius: 8, background: l.status === "success" ? colors.successBg : l.status === "error" ? colors.dangerBg : colors.surfaceBg }}>
                    <span style={{ color: l.status === "success" ? colors.successText : l.status === "error" ? colors.dangerText : colors.pageFg }}>
                      {l.status === "pending" ? "⏳" : l.status === "success" ? "✅" : "❌"} {l.label}
                    </span>
                    <span style={{ color: colors.mutedFg, fontSize: 11 }}>
                      {l.hash ? shortenAddress(l.hash) : l.error ? l.error.slice(0, 40) : "waiting…"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}