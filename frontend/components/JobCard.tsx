"use client";
import { JOB_STATUS, formatEth, formatDate, NATIVE_SYMBOL, timeAgo } from "@/lib/contracts";
import { useTheme } from "@/context/ThemeContext";
import { Lock, Clock, Calendar } from "lucide-react";

interface Job {
  id: bigint; client: string; title: string; description: string; category: string;
  budget: bigint; deadline: bigint; status: number; selectedFreelancer: string;
  acceptedBidId: bigint; createdAt: bigint; deliveredAt: bigint;
  milestoneCount: bigint; sealedBidding: boolean; expectedDays: bigint;
}

interface Props {
  job: Job;
  currentAddress: string | null;
  onClick: () => void;
  onPlaceBid?: () => void;
}

export default function JobCard({ job, currentAddress, onClick, onPlaceBid }: Props) {
  const { colors } = useTheme();
  const isOwner = currentAddress?.toLowerCase() === job.client.toLowerCase();

  const statusDotColor: Record<number, string> = {
    0: "#16A34A", 1: "#3B82F6", 2: "#64748B", 3: "#DC2626",
    4: "#D97706", 5: "#7C3AED",
  };

  return (
    <div
      className="rounded-xl p-5 cursor-pointer border flex flex-col justify-between transition-shadow hover:shadow-lg"
      style={{ background: colors.cardBg, borderColor: colors.cardBorder }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = colors.cardBorder; }}>
      {/* Top row: category + status | budget */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
              style={{ background: colors.primary, color: colors.primaryText }}>
              {job.category}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: statusDotColor[job.status] || colors.mutedFg }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: statusDotColor[job.status] || colors.mutedFg }} />
              {JOB_STATUS[job.status]}
              {job.sealedBidding && <Lock size={10} className="inline ml-0.5" />}
            </span>
          </div>
          <span className="text-base font-bold shrink-0" style={{ color: colors.successText }}>
            {formatEth(job.budget)} {NATIVE_SYMBOL}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-lg leading-tight line-clamp-2 mb-4" style={{ color: colors.pageFg }}>
          {job.title}
        </h3>
      </div>

      {/* Bottom row: meta + buttons */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs" style={{ color: colors.mutedFg }}>
          <span className="flex items-center gap-1">
            <Clock size={12} /> Posted {timeAgo(job.createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={12} /> Deadline: {formatDate(job.deadline)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isOwner && job.status === 0 && (
            <button
              onClick={e => { e.stopPropagation(); onPlaceBid?.(); }}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg btn-hover"
              style={{ background: colors.primary, color: colors.primaryText }}>
              Place a Bid
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onClick(); }}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg btn-hover"
            style={{ background: colors.pageFg, color: colors.pageBg }}>
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
