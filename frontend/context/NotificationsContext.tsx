"use client";
import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, ReactNode,
} from "react";
import { useWallet } from "./WalletContext";
import {
  getJobMarket, getDisputeResolution, getUserProfile,
  CONTRACT_ADDRESSES, chatKey, chatReadKey,
} from "@/lib/contracts";

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotifType = "bid" | "dispute" | "chat" | "review";

export interface AppNotification {
  id: string;
  type: NotifType;
  jobId: bigint;
  jobTitle: string;
  message: string;
  link: string;
  /** true when the current user is the freelancer on this job */
  isMyWork: boolean;
}

interface NotificationsState {
  notifications: AppNotification[];
  /** count of dispute notifications where user is the freelancer */
  myWorkDisputeCount: number;
  totalCount: number;
  refresh: () => void;
  /** Dismiss a notification by id (persists across sessions) */
  dismiss: (id: string) => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const NotificationsContext = createContext<NotificationsState>({
  notifications: [],
  myWorkDisputeCount: 0,
  totalCount: 0,
  refresh: () => {},
  dismiss: () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { address, provider, signer } = useWallet();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Load dismissed set from localStorage when address changes
  useEffect(() => {
    if (!address) { setDismissed(new Set()); return; }
    try {
      const raw = localStorage.getItem(`verity_notif_dismissed_${address.toLowerCase()}`);
      setDismissed(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      setDismissed(new Set());
    }
  }, [address]);

  const dismiss = useCallback((id: string) => {
    if (!address) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          `verity_notif_dismissed_${address.toLowerCase()}`,
          JSON.stringify(Array.from(next))
        );
      } catch { /* storage full */ }
      return next;
    });
  }, [address]);

  const refresh = useCallback(async () => {
    if (!address || !CONTRACT_ADDRESSES.JobMarket) return;
    const reader = provider || signer;
    if (!reader) return;

    try {
      const jm = getJobMarket(reader);
      const count = Number(await jm.jobCounter());
      if (count === 0) { setNotifications([]); return; }

      // Fetch all jobs in parallel
      const rawJobs = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          jm.getJob(i + 1).catch(() => null)
        )
      );

      const jobs = rawJobs
        .filter(Boolean)
        .map((j) => ({
          id: j.id as bigint,
          client: (j.client as string).toLowerCase(),
          title: j.title as string,
          status: Number(j.status),
          selectedFreelancer: (j.selectedFreelancer as string).toLowerCase(),
        }));

      const addr = address.toLowerCase();
      const notifs: AppNotification[] = [];

      // ── 1. Bids on my open jobs (I am the client) ─────────────────────────
      const myOpenJobs = jobs.filter((j) => j.client === addr && j.status === 0);
      await Promise.all(myOpenJobs.map(async (job) => {
        try {
          const bids = await jm.getJobBids(job.id);
          const active = (bids as { isActive: boolean }[]).filter((b) => b.isActive);
          if (active.length > 0) {
            notifs.push({
              id: `bid-${job.id}`,
              type: "bid",
              jobId: job.id,
              jobTitle: job.title,
              message: `${active.length} bid${active.length > 1 ? "s" : ""} received on "${job.title}"`,
              link: "/jobs?tab=mine",
              isMyWork: false,
            });
          }
        } catch { /* contract not yet deployed / no bids */ }
      }));

      // ── 2. Disputes raised against me (other party filed it) ──────────────
      const myDisputedJobs = jobs.filter(
        (j) =>
          j.status === 4 &&
          (j.client === addr || j.selectedFreelancer === addr)
      );
      if (myDisputedJobs.length > 0 && CONTRACT_ADDRESSES.DisputeResolution) {
        const dr = getDisputeResolution(reader);
        await Promise.all(myDisputedJobs.map(async (job) => {
          try {
            const ids: bigint[] = await dr.getDisputesByJob(job.id);
            if (!ids || ids.length === 0) return;
            const lastId = ids[ids.length - 1];
            const dispute: any = await dr.getDispute(lastId);
            if (!dispute || dispute.id === 0n) return;
            const st = Number(dispute.status);
            // Only notify for active phases (Active=0, ResponsePhase=1, VotingPhase=2)
            if (st >= 3) return; // Resolved / AutoResolved / Withdrawn / EscalatedToAdmin — done
            if ((dispute.initiator as string).toLowerCase() === addr) return; // I filed it
            if (st === 1 && dispute.responseSubmitted) return; // Already responded
            notifs.push({
              id: `dispute-${job.id}`,
              type: "dispute",
              jobId: job.id,
              jobTitle: job.title,
              message: st === 1 && !dispute.responseSubmitted
                ? `Dispute raised on "${job.title}" — respond before voting opens`
                : `Dispute on "${job.title}" — voting in progress`,
              link: job.selectedFreelancer === addr ? "/jobs?tab=working" : "/jobs?tab=mine",
              isMyWork: job.selectedFreelancer === addr,
            });
          } catch { /* ignore */ }
        }));
      }

      // ── 3. Unread chat messages from the other party ───────────────────────
      const activeJobs = jobs.filter(
        (j) =>
          (j.status === 1 || j.status === 4 || j.status === 5) &&  // InProgress, Disputed, or Delivered
          (j.client === addr || j.selectedFreelancer === addr)
      );
      for (const job of activeJobs) {
        try {
          const msgs: { sender: string }[] = JSON.parse(
            localStorage.getItem(chatKey(job.id)) || "[]"
          );
          const lastRead = parseInt(
            localStorage.getItem(chatReadKey(job.id, addr)) || "0",
            10
          );
          const unread = msgs
            .slice(lastRead)
            .filter((m) => m.sender.toLowerCase() !== addr).length;
          if (unread > 0) {
            notifs.push({
              id: `chat-${job.id}`,
              type: "chat",
              jobId: job.id,
              jobTitle: job.title,
              message: `${unread} unread message${unread > 1 ? "s" : ""} on "${job.title}"`,
              link: `/chat/${job.id}`,
              isMyWork: job.selectedFreelancer === addr,
            });
          }
        } catch { /* no localStorage */ }
      }

      // ── 4. Revision — now on-chain (requestRevision changes status back to InProgress)
      // No separate notification needed; the job simply moves back from Delivered to InProgress.

      // ── 5. Pending reviews on completed jobs ───────────────────────────────
      if (CONTRACT_ADDRESSES.UserProfile) {
        const up = getUserProfile(reader);
        const completed = jobs.filter(
          (j) =>
            j.status === 2 &&
            (j.client === addr || j.selectedFreelancer === addr)
        );
        await Promise.all(completed.map(async (job) => {
          try {
            const reviewee = job.client === addr ? job.selectedFreelancer : job.client;
            const reviewed = await up.hasReviewed(job.id, address, reviewee);
            if (!reviewed) {
              notifs.push({
                id: `review-${job.id}`,
                type: "review",
                jobId: job.id,
                jobTitle: job.title,
                message: `Leave a review for "${job.title}"`,
                link: job.client === addr ? "/jobs?tab=mine" : "/jobs?tab=working",
                isMyWork: job.selectedFreelancer === addr,
              });
            }
          } catch { /* ignore */ }
        }));
      }

      setNotifications(notifs);
    } catch (e) {
      // Silently ignore BAD_DATA / "0x" errors — they just mean the node was
      // restarted and contracts aren't yet deployed at the stored addresses.
      // Any other unexpected error is logged for debugging.
      const msg = (e as Error)?.message ?? String(e);
      if (!msg.includes("BAD_DATA") && !msg.includes('value="0x"')) {
        console.error("Notifications refresh error:", e);
      }
    }
  }, [address, provider, signer]);

  // Refresh whenever address/provider changes
  useEffect(() => {
    setNotifications([]);
    refresh();
  }, [refresh]);

  // Refresh on every new block — debounced to avoid rapid-fire calls on fast local chains
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!provider) return;
    const handler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refresh, 10_000); // 10s debounce
    };
    provider.on("block", handler);
    return () => {
      provider.off("block", handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [provider, refresh]);

  // Filter out dismissed notifications; also auto-clean dismissed IDs that no longer appear
  const visibleNotifications = notifications.filter((n) => !dismissed.has(n.id));

  const myWorkDisputeCount = visibleNotifications.filter(
    (n) => n.type === "dispute" && n.isMyWork
  ).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications: visibleNotifications,
        myWorkDisputeCount,
        totalCount: visibleNotifications.length,
        refresh,
        dismiss,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
