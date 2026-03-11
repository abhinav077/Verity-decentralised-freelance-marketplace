"use client";
import { useState, useEffect } from "react";
import { JsonRpcSigner } from "ethers";
import { getUserProfile } from "@/lib/contracts";
import { useTheme } from "@/context/ThemeContext";
import { Label } from "@/components/reactbits/Label";
import { Star } from "lucide-react";

interface Props {
  jobId: bigint;
  revieweeAddress: string;
  revieweeLabel: string;
  jobTitle: string;
  signer: JsonRpcSigner;
  mandatory?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReviewModal({ jobId, revieweeAddress, revieweeLabel, jobTitle, signer, mandatory = false, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayRating = hover || rating;
  const LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

  useEffect(() => {
    if (mandatory) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mandatory, onClose]);

  const submit = async () => {
    if (rating === 0 || !comment.trim()) return;
    setLoading(true); setError(null);
    try {
      const up = getUserProfile(signer);
      const tx = await up.submitReview(jobId, revieweeAddress, rating, comment.trim());
      await tx.wait();
      onSuccess();
    } catch (e: unknown) {
      setError((e as Error).message?.split("(")[0] || "Review failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5" style={{ background: colors.cardBg }}>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: colors.primaryFg }}>Leave a Review</p>
          <h2 className="text-xl font-bold mt-1" style={{ color: colors.pageFg }}>Rate the {revieweeLabel}</h2>
          <p className="text-sm mt-0.5" style={{ color: colors.muted }}>Job: <strong>{jobTitle}</strong></p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setRating(s)} onMouseEnter={() => setHover(s)}
                className="text-4xl transition-all hover:scale-110"
                style={{ color: s <= displayRating ? "#facc15" : colors.inputBorder }}>★</button>
            ))}
          </div>
          <p className="text-sm font-medium" style={{ color: displayRating > 0 ? "#ca8a04" : colors.muted }}>
            {displayRating > 0 ? LABELS[displayRating] : "Select a rating"}
          </p>
        </div>

        <div>
          <Label className="text-sm font-medium">Your review</Label>
          <textarea rows={3} placeholder={`Share your experience working with this ${revieweeLabel.toLowerCase()}…`}
            value={comment} onChange={(e) => setComment(e.target.value)}
            className="mt-1.5 w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none"
            style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }} />
        </div>

        {error && <p className="text-sm" style={{ color: colors.dangerText }}>{error}</p>}

        <div className="flex gap-3">
          {!mandatory && (
            <button onClick={onClose} className="flex-1 border rounded-xl py-2.5 text-sm"
              style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Skip for Now</button>
          )}
          {mandatory && (
            <div className="flex-1 flex items-center gap-1.5 text-xs border rounded-xl px-3 justify-center"
              style={{ background: colors.warningBg, color: colors.warningText, borderColor: colors.warningText + "44" }}>
              <Star size={14} className="inline mr-1" />Review is required to close
            </div>
          )}
          <button onClick={submit} disabled={loading || rating === 0 || !comment.trim()}
            className="flex-1 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60 btn-hover"
            style={{ background: colors.primary, color: colors.primaryText }}>
            {loading ? "Submitting…" : "Submit Review"}
          </button>
        </div>
        <p className="text-xs text-center" style={{ color: colors.muted }}>
          Reviews are stored on-chain and cannot be edited.
        </p>
      </div>
    </div>
  );
}
