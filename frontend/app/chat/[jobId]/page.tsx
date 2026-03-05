"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { getJobMarket, shortenAddress, CONTRACT_ADDRESSES, chatKey, chatReadKey } from "@/lib/contracts";
import { ethers } from "ethers";

interface Attachment {
  name: string;
  type: string;
  data: string; // base64 DataURL
}

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  attachment?: Attachment;
}

interface JobInfo {
  id: bigint;
  title: string;
  client: string;
  selectedFreelancer: string;
  status: number;
  budget: bigint;
}

function loadMessages(jobId: string): Message[] {
  try {
    const raw = localStorage.getItem(chatKey(jobId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMessages(jobId: string, msgs: Message[]) {
  try { localStorage.setItem(chatKey(jobId), JSON.stringify(msgs)); } catch {}
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
  const [messages, setMessages] = useState<Message[]>(() => jobId ? loadMessages(jobId) : []);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derived state
  const canFetch = !!(provider || signer) && !!jobId && !!CONTRACT_ADDRESSES.JobMarket;
  const loadingJob = canFetch && !jobLoaded;
  const accessDenied = !!(job && address &&
    job.client.toLowerCase() !== address.toLowerCase() &&
    job.selectedFreelancer.toLowerCase() !== address.toLowerCase());

  // Load job info (and keep it fresh so we notice completion)
  useEffect(() => {
    const reader = provider || signer;
    if (!reader || !jobId || !CONTRACT_ADDRESSES.JobMarket) return;

    const fetchJob = () => {
      getJobMarket(reader).getJob(BigInt(jobId)).then((j) => {
        const newStatus = Number(j.status);
        setJob({
          id: j.id, title: j.title, client: j.client,
          selectedFreelancer: j.selectedFreelancer,
          status: newStatus, budget: j.budget,
        });
        setJobLoaded(true);
      }).catch(() => setJobLoaded(true));
    };

    fetchJob();
    if (provider) {
      let timer: ReturnType<typeof setTimeout>;
      const debouncedFetch = () => { clearTimeout(timer); timer = setTimeout(fetchJob, 2000); };
      provider.on("block", debouncedFetch);
      return () => { clearTimeout(timer); provider.off("block", debouncedFetch); };
    }
  }, [provider, signer, jobId]);

  // Poll messages from localStorage every 1.5s + cross-tab sync
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(() => {
      const fresh = loadMessages(jobId);
      setMessages((prev) => fresh.length !== prev.length ? fresh : prev);
    }, 1500);
    const onStorage = (e: StorageEvent) => {
      if (e.key === chatKey(jobId)) setMessages(loadMessages(jobId));
    };
    window.addEventListener("storage", onStorage);
    return () => { clearInterval(interval); window.removeEventListener("storage", onStorage); };
  }, [jobId]);

  // Mark messages as read
  useEffect(() => {
    if (!jobId || !address || messages.length === 0) return;
    localStorage.setItem(chatReadKey(jobId, address), String(messages.length));
  }, [jobId, address, messages]);

  // Scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) { alert("Max file size is 1 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({ name: file.name, type: file.type, data: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const sendMessage = useCallback(() => {
    if (!address || (!text.trim() && !attachment)) return;
    setSending(true);
    const msg: Message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sender: address,
      text: text.trim(),
      timestamp: Date.now(),
      attachment: attachment ?? undefined,
    };
    const current = loadMessages(jobId);
    const updated = [...current, msg];
    setMessages(updated);
    saveMessages(jobId, updated);
    setText("");
    setAttachment(null);
    setSending(false);
  }, [address, text, attachment, messages, jobId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  /* ── Early-return states ── */
  if (!address) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-xl" style={{ color: colors.muted }}>Connect your wallet to access chat.</p>
      </div>
    );
  }

  if (loadingJob) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse" style={{ color: colors.muted }}>Loading job info…</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="mb-4" style={{ color: colors.muted }}>Job not found.</p>
          <Link href="/jobs" className="hover:underline" style={{ color: colors.primaryFg }}>Back to Jobs</Link>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-2xl mb-2" style={{ color: colors.dangerText }}>Access Denied</p>
          <p className="mb-4" style={{ color: colors.muted }}>Only the client and assigned freelancer can view this chat.</p>
          <Link href="/jobs" className="hover:underline" style={{ color: colors.primaryFg }}>Back to Jobs</Link>
        </div>
      </div>
    );
  }

  const statusLabel = ["Open", "In Progress", "Completed", "Cancelled", "Disputed", "Delivered"][job.status] ?? "Unknown";
  const otherParty = job.client.toLowerCase() === address.toLowerCase()
    ? job.selectedFreelancer : job.client;
  const otherRole = job.client.toLowerCase() === address.toLowerCase() ? "Freelancer" : "Client";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-72px)]">

      {/* Header */}
      <div className="mb-4">
        <Link href="/jobs" className="text-sm hover:underline mb-2 inline-block" style={{ color: colors.primaryFg }}>
          ← Back to Jobs
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
              <span className="text-xs" style={{ color: colors.muted }}>
                Budget: {parseFloat(ethers.formatEther(job.budget)).toFixed(1)} ETH
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs" style={{ color: colors.muted }}>{otherRole}</p>
              <Link href={`/profile/${otherParty}`}
                className="text-xs font-mono hover:underline" style={{ color: colors.primaryFg }}>
                {shortenAddress(otherParty)}
              </Link>
            </div>
            <Avatar address={otherParty} size={32} />
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12" style={{ color: colors.muted }}>
            <div className="text-4xl mb-3">💬</div>
            <p className="font-medium">No messages yet</p>
            <p className="text-sm mt-1">Start the conversation below.</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender.toLowerCase() === address.toLowerCase();
          return (
            <div key={msg.id}
              className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
              <Avatar address={msg.sender} size={28} />
              <div className={`max-w-[72%] space-y-1 ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`flex items-center gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                  <span className="text-xs font-mono" style={{ color: colors.muted }}>
                    {isMine ? "You" : shortenAddress(msg.sender)}
                  </span>
                  <span className="text-xs" style={{ color: colors.inputBorder }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {msg.text && (
                  <div className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={isMine
                      ? { background: colors.primary, color: colors.primaryText, borderTopRightRadius: 4 }
                      : { background: colors.cardBg, border: `1px solid ${colors.cardBorder}`, color: colors.pageFg, borderTopLeftRadius: 4 }
                    }>
                    {msg.text}
                  </div>
                )}
                {msg.attachment && (
                  <AttachmentBubble attachment={msg.attachment} isMine={isMine} colors={colors} />
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Attachment preview */}
      {attachment && (
        <div className="mb-2 flex items-center gap-3 rounded-xl px-4 py-2 border"
          style={{ background: colors.primaryLight, borderColor: colors.primary + "33" }}>
          <span style={{ color: colors.primaryFg }} className="text-lg">📎</span>
          <span className="text-sm truncate flex-1" style={{ color: colors.primaryFg }}>{attachment.name}</span>
          <button onClick={() => setAttachment(null)}
            className="text-lg leading-none" style={{ color: colors.muted }}>&times;</button>
        </div>
      )}

      {/* Input bar */}
      {job.status >= 2 ? (
        <div className="rounded-2xl shadow-sm p-4 text-center border"
          style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
          <p className="text-sm" style={{ color: colors.muted }}>
            This chat is read-only — the job is {statusLabel.toLowerCase()}.
          </p>
        </div>
      ) : (
      <div className="rounded-2xl shadow-sm flex items-end gap-2 p-2 border"
        style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2 rounded-xl shrink-0 transition-colors"
          style={{ color: colors.muted }}
          title="Attach file"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none text-sm outline-none py-2 max-h-32 overflow-y-auto bg-transparent"
          style={{ lineHeight: "1.5", color: colors.pageFg }}
        />
        <button
          onClick={sendMessage}
          disabled={sending || (!text.trim() && !attachment)}
          className="disabled:opacity-40 disabled:cursor-not-allowed p-2.5 rounded-xl transition-colors shrink-0"
          style={{ background: colors.primary, color: colors.primaryText }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function AttachmentBubble({ attachment, isMine, colors }: { attachment: Attachment; isMine: boolean; colors: any }) {
  const isImage = attachment.type.startsWith("image/");
  if (isImage) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-sm max-w-[240px] border"
        style={{ borderColor: isMine ? colors.primary : colors.cardBorder }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.data} alt={attachment.name} className="w-full object-cover" />
      </div>
    );
  }
  return (
    <a href={attachment.data} download={attachment.name}
      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm border shadow-sm transition-colors"
      style={isMine
        ? { background: colors.primaryHover, borderColor: colors.primary, color: colors.primaryText }
        : { background: colors.cardBg, borderColor: colors.cardBorder, color: colors.primaryFg }
      }>
      <span>📄</span>
      <span className="truncate max-w-[180px]">{attachment.name}</span>
      <span className="opacity-60 text-xs">↓</span>
    </a>
  );
}
