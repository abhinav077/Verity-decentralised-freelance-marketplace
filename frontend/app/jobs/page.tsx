"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationsContext";
import { getJobMarket, getDisputeResolution, getUserProfile, CONTRACT_ADDRESSES } from "@/lib/contracts";
import JobCard from "@/components/JobCard";
import CreateJobModal from "@/components/CreateJobModal";
import JobDetailModal from "@/components/JobDetailModal";
import ReviewModal from "@/components/ReviewModal";
import { Star, AlertTriangle, Settings } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Job {
  id: bigint; client: string; title: string; description: string; category: string;
  budget: bigint; deadline: bigint; status: number; selectedFreelancer: string;
  acceptedBidId: bigint; createdAt: bigint; deliveredAt: bigint;
  milestoneCount: bigint; sealedBidding: boolean; expectedDays: bigint;
}

function parseJob(j: any): Job {
  return {
    id: j.id, client: j.client, title: j.title, description: j.description,
    category: j.category, budget: j.budget, deadline: j.deadline,
    status: Number(j.status), selectedFreelancer: j.selectedFreelancer,
    acceptedBidId: j.acceptedBidId, createdAt: j.createdAt,
    deliveredAt: j.deliveredAt ?? 0n, milestoneCount: j.milestoneCount ?? 0n,
    sealedBidding: j.sealedBidding ?? false, expectedDays: j.expectedDays ?? 0n,
  };
}

export default function JobsPage() {
  return <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh] animate-pulse">Loading…</div>}><JobsInner /></Suspense>;
}

function JobsInner() {
  const { address, signer, provider } = useWallet();
  const { colors } = useTheme();
  const { myWorkDisputeCount } = useNotifications();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "working">("all");
  const [disputeAlerts, setDisputeAlerts] = useState<{ job: Job; disputeId: bigint }[]>([]);
  const [reviewAlerts, setReviewAlerts] = useState<Job[]>([]);
  const [reviewJob, setReviewJob] = useState<Job | null>(null);

  useEffect(() => {
    if (tabParam === "mine") setFilter("mine");
    else if (tabParam === "working") setFilter("working");
    else setFilter("all");
  }, [tabParam]);

  // Open CreateJobModal when navigated with ?create=true (from navbar)
  useEffect(() => {
    if (searchParams.get("create") === "true" && address) {
      setShowCreate(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("create");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [searchParams, address]);

  const contractsConfigured = CONTRACT_ADDRESSES.JobMarket !== "";

  const loadJobs = useCallback(async () => {
    if (!contractsConfigured) { setLoading(false); return; }
    const reader = provider || signer;
    if (!reader) { setLoading(false); return; }
    try {
      const jm = getJobMarket(reader);
      const count = Number(await jm.jobCounter());
      if (count === 0) { setJobs([]); setLoading(false); return; }
      const allJobs: Job[] = [];
      for (let i = 1; i <= count; i++) {
        try { allJobs.push(parseJob(await jm.getJob(i))); } catch {}
      }
      setJobs([...allJobs].reverse());
      setSelectedJob((prev) => {
        if (!prev) return prev;
        const fresh = allJobs.find((j) => j.id === prev.id);
        return fresh ? parseJob(fresh) : prev;
      });
      setError(null);
    } catch (e: unknown) {
      setError((e as Error).message?.split("(")[0] || "Failed to load jobs");
    } finally { setLoading(false); }
  }, [provider, signer, contractsConfigured]);

  // Dispute alerts
  useEffect(() => {
    const reader = signer || provider;
    if (!address || !reader || jobs.length === 0) return;
    const dr = getDisputeResolution(reader);
    const disputed = jobs.filter((j) => j.status === 4 &&
      (j.client.toLowerCase() === address.toLowerCase() ||
       j.selectedFreelancer.toLowerCase() === address.toLowerCase()));
    if (disputed.length === 0) { setDisputeAlerts([]); return; }
    Promise.all(
      disputed.map(async (j) => {
        try {
          const ids = await dr.getDisputesByJob(j.id);
          if (!ids || ids.length === 0) return null;
          const dispute = await dr.getDispute(ids[ids.length - 1]);
          if (!dispute?.id || dispute.id === 0n) return null;
          if (Number(dispute.status) !== 0) return null;
          if (dispute.initiator.toLowerCase() === address.toLowerCase()) return null;
          if (dispute.responseSubmitted) return null;
          return { job: j, disputeId: dispute.id as bigint };
        } catch { return null; }
      })
    ).then((results) => setDisputeAlerts(results.filter(Boolean) as { job: Job; disputeId: bigint }[]));
  }, [jobs, address, signer, provider]);

  // Review alerts
  useEffect(() => {
    if (!address || !signer || !CONTRACT_ADDRESSES.UserProfile || jobs.length === 0) return;
    const up = getUserProfile(signer);
    const myCompleted = jobs.filter(
      (j) => j.status === 2 &&
        (j.client.toLowerCase() === address.toLowerCase() ||
         j.selectedFreelancer.toLowerCase() === address.toLowerCase())
    );
    if (myCompleted.length === 0) { setReviewAlerts([]); return; }
    Promise.all(
      myCompleted.map(async (j) => {
        try {
          const reviewee = j.client.toLowerCase() === address.toLowerCase()
            ? j.selectedFreelancer : j.client;
          return (await up.hasReviewed(j.id, address, reviewee)) ? null : j;
        }
        catch { return null; }
      })
    ).then((results) => setReviewAlerts(results.filter(Boolean) as Job[]));
  }, [jobs, address, signer]);

  useEffect(() => { setLoading(true); loadJobs(); }, [loadJobs]);
  useEffect(() => {
    if (!provider) return;
    let timer: ReturnType<typeof setTimeout>;
    const debouncedLoad = () => {
      clearTimeout(timer);
      timer = setTimeout(loadJobs, 2000);
    };
    provider.on("block", debouncedLoad);
    return () => { clearTimeout(timer); provider.off("block", debouncedLoad); };
  }, [provider, loadJobs]);

  const displayJobs = jobs.filter((j) => {
    if (filter === "all") return j.status === 0;
    if (filter === "mine") return j.client.toLowerCase() === address?.toLowerCase();
    if (filter === "working") return j.selectedFreelancer.toLowerCase() === address?.toLowerCase();
    return true;
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-8" style={{ color: colors.pageFg }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: colors.pageFg }}>Job Marketplace</h1>
        <p className="mt-1" style={{ color: colors.muted }}>Find work or hire talent — powered by smart contracts.</p>
      </div>

      {/* Dispute alert banners */}
      {disputeAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {disputeAlerts.map(({ job }) => (
            <div key={job.id.toString()}
              className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 border"
              style={{ background: colors.dangerBg, borderColor: colors.dangerText + "44" }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm" style={{ color: colors.dangerText }}>A dispute has been raised against you</p>
                  <p className="text-sm" style={{ color: colors.dangerText }}>
                    Job: <strong>{job.title}</strong> — you have 24 hours to submit your side.
                  </p>
                </div>
              </div>
              <button onClick={() => { const live = jobs.find(j => j.id === job.id) ?? job; setSelectedJob(live); }}
                className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg btn-hover"
                style={{ background: colors.dangerText, color: "#fff" }}>Respond Now</button>
            </div>
          ))}
        </div>
      )}

      {/* Review alerts */}
      {reviewAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {reviewAlerts.map((job) => (
            <div key={`review-${job.id.toString()}`}
              className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 border"
              style={{ background: colors.warningBg, borderColor: colors.warningText + "44" }}>
              <div className="flex items-start gap-3">
                <Star size={20} className="mt-0.5" style={{ color: "#facc15" }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: colors.warningText }}>Leave a review for a completed job</p>
                  <p className="text-sm" style={{ color: colors.warningText }}>Job: <strong>{job.title}</strong></p>
                </div>
              </div>
              <button onClick={() => setReviewJob(job)}
                className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg btn-hover"
                style={{ background: colors.warningText, color: "#fff" }}>Write Review</button>
            </div>
          ))}
        </div>
      )}

      {!contractsConfigured && (
        <div className="rounded-xl p-5 mb-6 border" style={{ background: colors.warningBg, borderColor: colors.warningText + "33" }}>
          <h3 className="font-semibold mb-2" style={{ color: colors.warningText }}><Settings size={16} className="inline mr-1" />Setup Required</h3>
          <p className="text-sm mb-3" style={{ color: colors.warningText }}>
            Deploy contracts and add addresses to <code className="px-1 rounded" style={{ background: colors.inputBg }}>.env.local</code>.
          </p>
          <ol className="text-sm space-y-1 list-decimal list-inside" style={{ color: colors.warningText }}>
            <li>In the <strong>contracts</strong> folder, create a <code className="px-1 rounded" style={{ background: colors.inputBg }}>.env</code> file with your private key and RPC URL</li>
            <li>Run: <code className="px-1 rounded" style={{ background: colors.inputBg }}>npx hardhat run scripts/deploy.ts --network amoy</code></li>
            <li>The deploy script auto-creates <code className="px-1 rounded" style={{ background: colors.inputBg }}>frontend/.env.local</code> with all addresses</li>
            <li>Restart the dev server: <code className="px-1 rounded" style={{ background: colors.inputBg }}>npm run dev</code></li>
          </ol>
        </div>
      )}

      {contractsConfigured && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: colors.inputBg }}>
            {(["all", "mine", "working"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className="relative px-3 py-1.5 text-sm rounded-md font-medium transition-colors"
                style={filter === f
                  ? { background: colors.cardBg, color: colors.primaryFg, boxShadow: "0 1px 3px rgba(0,0,0,.1)" }
                  : { color: colors.mutedFg }}>
                {f === "all" ? "Open Jobs" : f === "mine" ? "My Jobs" : "My Work"}
                {f === "working" && myWorkDisputeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5"
                    style={{ background: colors.dangerText, color: "#fff" }}>{myWorkDisputeCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {!address && contractsConfigured && (
        <div className="text-center py-20" style={{ color: colors.muted }}>
          <p className="text-lg">Connect your wallet to interact with the marketplace.</p>
        </div>
      )}

      {address && loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl h-40 animate-pulse" style={{ background: colors.inputBg }} />
          ))}
        </div>
      )}

      {address && !loading && error && (
        <div className="text-center py-10">
          <p className="text-sm" style={{ color: colors.dangerText }}>{error}</p>
          <button onClick={loadJobs} className="mt-3 text-sm hover:underline" style={{ color: colors.primaryFg }}>Retry</button>
        </div>
      )}

      {address && !loading && !error && displayJobs.length === 0 && (
        <div className="text-center py-20" style={{ color: colors.muted }}>
          <p className="text-lg">
            {filter === "all" ? "No open jobs yet. Be the first to post one!" :
             filter === "mine" ? "You haven't posted any jobs yet." :
             "You're not currently working on any jobs."}
          </p>
          {filter === "mine" && (
            <button onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 rounded-lg text-sm btn-hover"
              style={{ background: colors.primary, color: colors.primaryText }}>Post a Job</button>
          )}
        </div>
      )}

      {address && !loading && !error && displayJobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayJobs.map((job) => (
            <JobCard key={job.id.toString()} job={job} currentAddress={address} onClick={() => setSelectedJob(job)} />
          ))}
        </div>
      )}

      {showCreate && signer && (
        <CreateJobModal signer={signer} onClose={() => setShowCreate(false)} onSuccess={loadJobs} />
      )}
      {selectedJob && (
        <JobDetailModal job={selectedJob} signer={signer} currentAddress={address}
          onClose={() => setSelectedJob(null)} onRefresh={loadJobs} />
      )}
      {reviewJob && signer && address && (
        <ReviewModal jobId={reviewJob.id}
          revieweeAddress={reviewJob.client.toLowerCase() === address.toLowerCase() ? reviewJob.selectedFreelancer : reviewJob.client}
          revieweeLabel={reviewJob.client.toLowerCase() === address.toLowerCase() ? "Freelancer" : "Client"}
          jobTitle={reviewJob.title} signer={signer} mandatory
          onClose={() => setReviewJob(null)}
          onSuccess={() => { setReviewJob(null); loadJobs(); }} />
      )}
    </main>
  );
}
