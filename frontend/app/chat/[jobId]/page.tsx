"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { getJobMarket, getSubContracting, shortenAddress, CONTRACT_ADDRESSES, chatReadKey, NATIVE_SYMBOL } from "@/lib/contracts";
import { JobChat } from "@/components/StreamChatProvider";
import { ethers } from "ethers";

interface JobInfo {
  id: bigint;
  title: string;
  client: string;
  selectedFreelancer: string;
  status: number;
  budget: bigint;
}

function Avatar({ address, size = 28 }: { address: string; size?: number }) {
  const color = "#" + address.slice(2, 8);
  return (
    <div style={{ width: size, height: size, background: color, borderRadius: "50%", flexShrink: 0 }}
      className="flex items-center justify-center">
      <span style={{ fontSize: size * 0.38, color: "white", fontWeight: 700, lineHeight: 1 }}>
        {address.slice(2, 4).toUpperCase()}
      </span>
    </div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const jobId = params?.jobId as string;
  const { address, provider, signer } = useWallet();
  const { colors } = useTheme();

  const [job, setJob] = useState<JobInfo | null>(null);
  const [jobLoaded, setJobLoaded] = useState(false);
  const [messagesCount, setMessagesCount] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Detect sub-contract chat (sc-X prefix)
  const isSubContract = jobId?.startsWith("sc-") ?? false;
  const scNumericId = isSubContract ? jobId.slice(3) : null;

  // Derived state
  const canFetch = !!(provider || signer) && !!jobId && (isSubContract ? !!CONTRACT_ADDRESSES.SubContracting : !!CONTRACT_ADDRESSES.JobMarket);
  const loadingJob = canFetch && !jobLoaded;
  const accessDenied = !!(job && address &&
    job.client.toLowerCase() !== address.toLowerCase() &&
    job.selectedFreelancer.toLowerCase() !== address.toLowerCase());

  // Load job/sub-contract info (and keep it fresh so we notice completion)
  useEffect(() => {
    const reader = provider || signer;
    if (!reader || !jobId) return;

    const fetchJob = () => {
      if (isSubContract && scNumericId) {
        if (!CONTRACT_ADDRESSES.SubContracting) return;
        getSubContracting(reader).getSubContract(BigInt(scNumericId)).then((sc: { id: bigint; description: string; primaryFreelancer: string; subContractor: string; status: number; payment: bigint; }) => {
          const newStatus = Number(sc.status);
          // Map SC status to job-like status for display: 0=Open,1=Active,2=Delivered,3=Completed,4=Disputed,5=Cancelled
          const displayStatus = newStatus === 1 ? 1 : newStatus === 2 ? 5 : newStatus === 3 ? 2 : newStatus === 4 ? 4 : newStatus === 5 ? 3 : 0;
          // Parse title from description (format: "Title | Category | ...\n\nDescription")
          const descStr = sc.description || "";
          const firstLine = descStr.split("\n")[0] || "";
          const parsedTitle = firstLine.includes(" | ") ? firstLine.split(" | ")[0] : `Sub-Contract #${scNumericId}`;
          setJob({
            id: sc.id, title: parsedTitle, client: sc.primaryFreelancer,
            selectedFreelancer: sc.subContractor,
            status: displayStatus, budget: sc.payment,
          });
          setJobLoaded(true);
        }).catch(() => setJobLoaded(true));
      } else {
        if (!CONTRACT_ADDRESSES.JobMarket) return;
        getJobMarket(reader).getJob(BigInt(jobId)).then((j: { id: bigint; title: string; client: string; selectedFreelancer: string; status: number; budget: bigint; }) => {
          const newStatus = Number(j.status);
          setJob({
            id: j.id, title: j.title, client: j.client,
            selectedFreelancer: j.selectedFreelancer,
            status: newStatus, budget: j.budget,
          });
          setJobLoaded(true);
        }).catch(() => setJobLoaded(true));
      }
    };

    fetchJob();
    if (provider) {
      let timer: ReturnType<typeof setTimeout>;
      const debouncedFetch = () => { clearTimeout(timer); timer = setTimeout(fetchJob, 2000); };
      provider.on("block", debouncedFetch);
      return () => { clearTimeout(timer); provider.off("block", debouncedFetch); };
    }
  }, [provider, signer, jobId, isSubContract, scNumericId]);

  // Mark messages as read in local cache for badge counts (optional)
  useEffect(() => {
    if (!jobId || !address) return;
    localStorage.setItem(chatReadKey(jobId, address), String(messagesCount));
  }, [jobId, address, messagesCount]);

  /* ── Early-return states ── */
  if (!address) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-xl" style={{ color: colors.mutedFg }}>Connect your wallet to access chat.</p>
      </div>
    );
  }

  if (loadingJob) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse" style={{ color: colors.mutedFg }}>Loading job info…</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="mb-4" style={{ color: colors.mutedFg }}>{isSubContract ? "Sub-contract" : "Job"} not found.</p>
          <Link href={isSubContract ? "/sub-contracts" : "/jobs"} className="hover:underline" style={{ color: colors.primaryFg }}>
            Back to {isSubContract ? "Sub-Contracts" : "Jobs"}
          </Link>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-2xl mb-2" style={{ color: colors.dangerText }}>Access Denied</p>
          <p className="mb-4" style={{ color: colors.mutedFg }}>Only the {isSubContract ? "primary freelancer and sub-contractor" : "client and assigned freelancer"} can view this chat.</p>
          <Link href={isSubContract ? "/sub-contracts" : "/jobs"} className="hover:underline" style={{ color: colors.primaryFg }}>
            Back to {isSubContract ? "Sub-Contracts" : "Jobs"}
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel = ["Open", "In Progress", "Completed", "Cancelled", "Disputed", "Delivered"][job.status] ?? "Unknown";
  const otherParty = job.client.toLowerCase() === address.toLowerCase()
    ? job.selectedFreelancer : job.client;
  const otherRole = job.client.toLowerCase() === address.toLowerCase()
    ? (isSubContract ? "Sub-Contractor" : "Freelancer")
    : (isSubContract ? "Primary Freelancer" : "Client");
  const backHref = isSubContract ? "/sub-contracts" : "/jobs";
  const backLabel = isSubContract ? "Sub-Contracts" : "Jobs";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-72px)]">

      {/* Header */}
      <div className="mb-4">
        <Link href={backHref} className="text-sm hover:underline mb-2 inline-block" style={{ color: colors.primaryFg }}>
          ← Back to {backLabel}
        </Link>
        <div className="rounded-2xl p-4 shadow-sm flex items-start justify-between gap-4 border"
          style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
          <div>
            <h1 className="font-bold text-base" style={{ color: colors.pageFg }}>{job.title}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: job.status === 1 ? colors.infoBg
                    : job.status === 2 ? colors.successBg
                    : job.status === 4 ? colors.dangerBg
                    : job.status === 5 ? colors.warningBg
                    : colors.inputBg,
                  color: job.status === 1 ? colors.infoText
                    : job.status === 2 ? colors.successText
                    : job.status === 4 ? colors.dangerText
                    : job.status === 5 ? colors.warningText
                    : colors.mutedFg,
                }}>{statusLabel}</span>
              <span className="text-xs" style={{ color: colors.mutedFg }}>
                Budget: {parseFloat(ethers.formatEther(job.budget)).toFixed(1)} {NATIVE_SYMBOL}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs" style={{ color: colors.mutedFg }}>{otherRole}</p>
              <Link href={`/profile/${otherParty}`}
                className="text-xs font-mono hover:underline" style={{ color: colors.primaryFg }}>
                {shortenAddress(otherParty)}
              </Link>
            </div>
            <Avatar address={otherParty} size={32} />
          </div>
        </div>
      </div>

      {/* Messages area - now powered by Stream Chat */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        <JobChat
          jobId={jobId}
          isSubContract={isSubContract}
          walletAddress={address}
          onMessagesCountChange={setMessagesCount}
        />
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
