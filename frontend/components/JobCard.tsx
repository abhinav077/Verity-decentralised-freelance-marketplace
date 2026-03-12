"use client";
import { JOB_STATUS, formatEth, formatDate, shortenAddress, NATIVE_SYMBOL } from "@/lib/contracts";
import { useTheme } from "@/context/ThemeContext";
import { Lock } from "lucide-react";

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
}

export default function JobCard({ job, currentAddress, onClick }: Props) {
  const { colors } = useTheme();
  const isOwner = currentAddress?.toLowerCase() === job.client.toLowerCase();

  const statusBg: Record<number, string> = {
    0: colors.successBg, 1: colors.infoBg, 2: colors.cardBg, 3: colors.dangerBg,
    4: colors.warningBg, 5: colors.badgeBg,
  };
  const statusFg: Record<number, string> = {
    0: colors.successText, 1: colors.infoText, 2: colors.mutedFg, 3: colors.dangerText,
    4: colors.warningText, 5: colors.badgeText,
  };

  return (
    <div onClick={onClick}
      className="rounded-xl p-5 cursor-pointer card-hover border"
      style={{ background: colors.cardBg, borderColor: colors.cardBorder }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = colors.cardBorder; }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-lg leading-tight line-clamp-2" style={{ color: colors.pageFg }}>{job.title}</h3>
        <span className="text-xs font-medium px-2 py-1 rounded-full shrink-0"
          style={{ background: statusBg[job.status] || colors.cardBg, color: statusFg[job.status] || colors.mutedFg }}>
          {JOB_STATUS[job.status]}{job.sealedBidding ? <> <Lock size={12} className="inline" /></> : ""}
        </span>
      </div>

      <p className="text-sm line-clamp-2 mb-4" style={{ color: colors.mutedFg }}>{job.description}</p>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="px-2 py-1 rounded-md" style={{ background: colors.inputBg, color: colors.mutedFg }}>{job.category}</span>
        <span className="font-semibold" style={{ color: colors.primaryFg }}>{formatEth(job.budget)} {NATIVE_SYMBOL}</span>
        <span style={{ color: colors.mutedFg }}>Deadline: {formatDate(job.deadline)}</span>
      </div>

      <div className="mt-3 pt-3 flex items-center justify-between text-xs" style={{ borderTop: `1px solid ${colors.cardBorder}`, color: colors.mutedFg }}>
        <span>By {isOwner ? "you" : shortenAddress(job.client)}</span>
        <span>Posted {formatDate(job.createdAt)}</span>
      </div>
    </div>
  );
}
