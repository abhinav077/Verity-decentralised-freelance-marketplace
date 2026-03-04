"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getJobMarket } from "@/lib/contracts";
import { useTheme } from "@/context/ThemeContext";
import { JsonRpcSigner } from "ethers";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CATEGORIES = [
  "Web Development", "Mobile Development", "Smart Contracts", "Design",
  "Writing", "Marketing", "Data Science", "DevOps", "Other",
];

interface Props {
  signer: JsonRpcSigner;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateJobModal({ signer, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [form, setForm] = useState({
    title: "", description: "", category: CATEGORIES[0], budget: "",
    daysUntilDeadline: "30", expectedDays: "", sealedBidding: false,
  });
  const [milestones, setMilestones] = useState<{ title: string; amount: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const addMilestone = () => setMilestones(ms => [...ms, { title: "", amount: "" }]);
  const removeMilestone = (i: number) => setMilestones(ms => ms.filter((_, idx) => idx !== i));
  const setMs = (i: number, k: string, v: string) =>
    setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [k]: v } : m));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.budget) return;
    setLoading(true); setError(null);
    try {
      const jm = getJobMarket(signer);
      const deadline = Math.floor(Date.now() / 1000) + parseInt(form.daysUntilDeadline) * 86400;
      const budget = ethers.parseEther(form.budget);
      const expectedDays = form.expectedDays ? parseInt(form.expectedDays) : 0;

      // Always use the 9-param createJob overload
      const msAmounts = milestones.map(m => ethers.parseEther(m.amount));
      const msTitles = milestones.map(m => m.title);

      const fn = jm.getFunction(
        "createJob(string,string,string,uint256,uint256,uint256,bool,uint256[],string[])"
      );
      const tx = await fn(
        form.title, form.description, form.category,
        budget, deadline, expectedDays, form.sealedBidding,
        msAmounts, msTitles
      );
      await tx.wait();
      onSuccess(); onClose();
    } catch (e: any) {
      setError(e?.reason || e?.message?.split("(")[0] || "Transaction failed");
    } finally { setLoading(false); }
  };

  const msTotal = milestones.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" style={{ background: colors.cardBg }}>
        <div className="flex items-center justify-between p-6" style={{ borderBottom: `1px solid ${colors.cardBorder}` }}>
          <h2 className="text-xl font-bold" style={{ color: colors.pageFg }}>Post a New Job</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: colors.muted }}>&times;</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.mutedFg }}>Title *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
              placeholder="e.g. Build a DeFi dashboard"
              value={form.title} onChange={e => set("title", e.target.value)} required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.mutedFg }}>Description *</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
              rows={4} placeholder="Describe the work in detail…"
              value={form.description} onChange={e => set("description", e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: colors.mutedFg }}>Category</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
                value={form.category} onChange={e => set("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: colors.mutedFg }}>Budget (ETH) *</label>
              <input type="number" step="0.001" min="0.001"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
                placeholder="0.5" value={form.budget} onChange={e => set("budget", e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: colors.mutedFg }}>Deadline (days)</label>
              <input type="number" min="1" max="365"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
                value={form.daysUntilDeadline} onChange={e => set("daysUntilDeadline", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: colors.mutedFg }}>Expected Days</label>
              <input type="number" min="1" max="365" placeholder="e.g. 14"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
                value={form.expectedDays} onChange={e => set("expectedDays", e.target.value)} />
            </div>
          </div>

          {/* Sealed bidding toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: colors.cardBorder, background: colors.inputBg }}>
            <input type="checkbox" id="sealed" checked={form.sealedBidding}
              onChange={e => set("sealedBidding", e.target.checked)}
              className="w-4 h-4 rounded" />
            <label htmlFor="sealed" className="text-sm" style={{ color: colors.pageFg }}>
              🔒 Sealed Bidding — freelancers can&apos;t see each other&apos;s bids
            </label>
          </div>

          {form.sealedBidding && (
            <p className="text-xs px-1" style={{ color: colors.muted }}>
              Client can see all bids. Freelancers only see their own bid. All bids are on-chain but the UI enforces privacy.
            </p>
          )}

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: colors.mutedFg }}>Milestones (optional)</label>
              <button type="button" onClick={addMilestone} className="text-xs font-medium px-2 py-1 rounded-lg"
                style={{ background: colors.primaryLight, color: colors.primaryFg }}>+ Add</button>
            </div>
            {milestones.length > 0 && (
              <div className="space-y-2">
                {milestones.map((ms, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input placeholder="Milestone title"
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none"
                      style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
                      value={ms.title} onChange={e => setMs(i, "title", e.target.value)} />
                    <input type="number" step="0.001" min="0.001" placeholder="ETH"
                      className="w-24 border rounded-lg px-2 py-1.5 text-sm outline-none font-mono"
                      style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }}
                      value={ms.amount} onChange={e => setMs(i, "amount", e.target.value)} />
                    <button type="button" onClick={() => removeMilestone(i)} className="text-lg" style={{ color: colors.dangerText }}>×</button>
                  </div>
                ))}
                <p className="text-xs" style={{ color: msTotal > 0 && form.budget && msTotal > parseFloat(form.budget) ? colors.dangerText : colors.muted }}>
                  Milestone total: {msTotal.toFixed(3)} ETH {form.budget ? `/ ${form.budget} ETH budget` : ""}
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-sm rounded-lg p-3" style={{ background: colors.dangerBg, color: colors.dangerText }}>{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border rounded-lg py-2 text-sm btn-outline-hover"
              style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60 btn-hover"
              style={{ background: colors.primary, color: colors.primaryText }}>
              {loading ? "Posting…" : "Post Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
