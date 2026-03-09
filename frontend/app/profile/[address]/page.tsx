"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { getUserProfile, getVRTToken, getJobMarket, shortenAddress, CONTRACT_ADDRESSES, formatDate } from "@/lib/contracts";
import { resolveIpfsUrl, isIpfsReference } from "@/lib/ipfs";
import { ethers } from "ethers";
import Link from "next/link";
import LinkifyText from "@/components/LinkifyText";
import IpfsFileUpload from "@/components/IpfsFileUpload";
import { Input } from "@/components/reactbits/Input";
import { Label } from "@/components/reactbits/Label";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Profile {
  name: string; bio: string; ipfsAvatar: string; skills: string[];
  createdAt: bigint; exists: boolean;
}
interface Review {
  id: bigint; jobId: bigint; reviewer: string; reviewee: string;
  rating: number; comment: string; timestamp: bigint;
}
interface Stats {
  jobsCompleted: bigint; totalEarned: bigint; totalSpent: bigint;
  averageRating: bigint; exists: boolean;
}

function StarRating({ rating, size = "sm", color }: { rating: number; size?: "sm" | "md"; color: string }) {
  return (
    <span className={`flex gap-0.5 ${size === "md" ? "text-xl" : "text-sm"}`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ color: s <= rating ? "#facc15" : color }}>★</span>
      ))}
    </span>
  );
}

function Avatar({ address, size = 48 }: { address: string; size?: number }) {
  const c = "#" + address.slice(2, 8);
  return (
    <div style={{ width: size, height: size, background: c, borderRadius: "50%" }}
      className="flex items-center justify-center shrink-0">
      <span style={{ fontSize: size * 0.35, color: "white", fontWeight: 700 }}>{address.slice(2, 4).toUpperCase()}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { address: paramAddress } = useParams<{ address: string }>();
  const { address: currentAddress, signer, provider } = useWallet();
  const { colors } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [vrtBalance, setVrtBalance] = useState<string>("—");
  const [avgRating, setAvgRating] = useState<number>(0);
  const [profileExists, setProfileExists] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editSkills, setEditSkills] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // B10: Endorsements
  const [endorsements, setEndorsements] = useState<{ endorser: string; skill: string; jobId: bigint; timestamp: bigint }[]>([]);
  const [endorseSkill, setEndorseSkill] = useState("");
  const [endorseJobId, setEndorseJobId] = useState("");
  const [endorsing, setEndorsing] = useState(false);

  // B11: Portfolio
  const [portfolio, setPortfolio] = useState<{ title: string; ipfsHash: string; jobId: bigint; timestamp: bigint }[]>([]);
  const [showPortfolioForm, setShowPortfolioForm] = useState(false);
  const [portfolioTitle, setPortfolioTitle] = useState("");
  const [portfolioIpfs, setPortfolioIpfs] = useState("");
  const [portfolioJobId, setPortfolioJobId] = useState("");
  const [addingPortfolio, setAddingPortfolio] = useState(false);

  // B12: Avatar
  const [avatarIpfs, setAvatarIpfs] = useState("");

  // B13: Achievements
  const [achievements, setAchievements] = useState<{ name: string; description: string; icon: string; unlockedAt: bigint }[]>([]);

  const targetAddress = paramAddress as string;
  const isOwnProfile = currentAddress?.toLowerCase() === targetAddress?.toLowerCase();
  const isValidAddress = ethers.isAddress(targetAddress);

  const loadProfile = useCallback(async () => {
    if (!targetAddress || !CONTRACT_ADDRESSES.UserProfile) { setLoading(false); return; }
    if (!ethers.isAddress(targetAddress)) { setLoading(false); setLoadError("Invalid Ethereum address"); return; }
    const reader = provider || signer;
    if (!reader) { setLoading(false); return; }
    setLoading(true); setLoadError(null);
    try {
      const up = getUserProfile(reader);
      const [p, revs, avgRaw] = await Promise.all([
        up.getProfile(targetAddress),
        up.getReviews(targetAddress),
        up.getAverageRating(targetAddress),
      ]);

      const exists = !!p.exists;
      setProfileExists(exists);
      if (exists) {
        const prof: Profile = {
          name: p.name, bio: p.bio ?? "", ipfsAvatar: p.ipfsAvatar ?? "",
          skills: Array.isArray(p.skills) ? [...p.skills] : [],
          createdAt: p.createdAt, exists: true,
        };
        setProfile(prof);
        setEditName(prof.name);
        setEditBio(prof.bio);
        setEditSkills(prof.skills.join(", "));
      }

      setReviews(revs.map((r: any) => ({
        id: r.id, jobId: r.jobId, reviewer: r.reviewer, reviewee: r.reviewee,
        rating: Number(r.rating), comment: r.comment, timestamp: r.timestamp,
      })));
      setAvgRating(Number(avgRaw) / 100);

      getVRTToken(reader).balanceOf(targetAddress).then((b: bigint) => {
        setVrtBalance(parseFloat(ethers.formatEther(b)).toFixed(1));
      }).catch(() => {});

      getJobMarket(reader).getUserProfile(targetAddress).then((s: Stats) => { setStats(s); }).catch(() => {});

      // Load endorsements, portfolio, achievements
      up.getEndorsements(targetAddress).then((endsRaw: any[]) => {
        setEndorsements(endsRaw.map((e: any) => ({ endorser: e.endorser, skill: e.skill, jobId: e.jobId, timestamp: e.timestamp })));
      }).catch(() => {});
      up.getPortfolio(targetAddress).then((items: any[]) => {
        setPortfolio(items.map((p: any) => ({ title: p.title, ipfsHash: p.ipfsHash, jobId: p.jobId, timestamp: p.timestamp })));
      }).catch(() => {});
      up.getAchievements(targetAddress).then((achs: any[]) => {
        setAchievements(achs.map((a: any) => ({ name: a.name, description: a.description, icon: a.icon, unlockedAt: a.unlockedAt })));
      }).catch(() => {});
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("BAD_DATA") || msg.includes("0x") || msg.includes("could not decode")) {
        setLoadError("Contracts not found. Make sure the node is running and contracts are deployed.");
      } else {
        setLoadError("Failed to load profile: " + msg.split("(")[0].trim());
      }
    } finally { setLoading(false); }
  }, [targetAddress, provider, signer]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveProfile = async () => {
    if (!signer || !currentAddress) return;
    if (!editName.trim()) { setSaveError("Name is required."); return; }
    setSaving(true); setSaveError(null);
    try {
      const up = getUserProfile(signer);
      const skillsArr = editSkills.split(",").map(s => s.trim()).filter(Boolean);
      const fn = profileExists ? "updateProfile" : "createProfile";
      const tx = await up[fn](editName.trim(), editBio, skillsArr);
      await tx.wait();
      // If avatar was set/changed, save it too (separate on-chain call)
      if (avatarIpfs.trim() && avatarIpfs.trim() !== (profile?.ipfsAvatar || "")) {
        const avatarTx = await up.setAvatar(avatarIpfs.trim());
        await avatarTx.wait();
      }
      await loadProfile(); setEditing(false);
    } catch (e: any) { setSaveError(e?.reason || e?.message?.split("(")[0] || "Save failed"); }
    finally { setSaving(false); }
  };

  // B10: Endorse skill
  const handleEndorseSkill = async () => {
    if (!signer || !endorseSkill.trim()) return;
    setEndorsing(true);
    try {
      const up = getUserProfile(signer);
      const tx = await up.endorseSkill(targetAddress, endorseSkill.trim(), endorseJobId ? parseInt(endorseJobId) : 0);
      await tx.wait();
      setEndorseSkill(""); setEndorseJobId("");
      loadProfile();
    } catch (e: any) { alert(e?.reason || "Endorse failed"); }
    finally { setEndorsing(false); }
  };

  // B11: Add portfolio item
  const handleAddPortfolio = async () => {
    if (!signer || !portfolioTitle.trim() || !portfolioIpfs.trim()) return;
    setAddingPortfolio(true);
    try {
      const up = getUserProfile(signer);
      const tx = await up.addPortfolioItem(portfolioTitle.trim(), portfolioIpfs.trim(), portfolioJobId ? parseInt(portfolioJobId) : 0);
      await tx.wait();
      setPortfolioTitle(""); setPortfolioIpfs(""); setPortfolioJobId(""); setShowPortfolioForm(false);
      loadProfile();
    } catch (e: any) { alert(e?.reason || "Add portfolio failed"); }
    finally { setAddingPortfolio(false); }
  };

  const skillList = profile?.skills ?? [];

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link href="/" className="text-sm hover:underline" style={{ color: colors.primaryFg }}>← Back to Jobs</Link>

      {loading ? (
        <div className="rounded-2xl p-8 text-center animate-pulse" style={{ background: colors.cardBg, color: colors.muted }}>Loading profile…</div>
      ) : loadError ? (
        <div className="rounded-2xl p-8 text-center space-y-2" style={{ background: colors.cardBg }}>
          <p className="text-2xl">⚠️</p>
          <p className="font-medium" style={{ color: colors.pageFg }}>{loadError}</p>
          <button onClick={loadProfile} className="mt-2 text-sm hover:underline" style={{ color: colors.primaryFg }}>Try again</button>
        </div>
      ) : (
        <div className="rounded-2xl shadow-sm border overflow-hidden" style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
          {/* Profile header */}
          <div className="px-6 py-8 flex items-center gap-5" style={{ background: colors.primary }}>
            {profile?.ipfsAvatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={resolveIpfsUrl(profile.ipfsAvatar)}
                alt="Profile Photo" className="w-[72px] h-[72px] rounded-full object-cover border-2 border-white/30 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Avatar address={targetAddress} size={72} />
            )}
            <div className="text-white">
              <h1 className="text-2xl font-bold">
                {profileExists && profile?.name ? profile.name : shortenAddress(targetAddress)}
              </h1>
              <p className="text-sm font-mono mt-0.5" style={{ opacity: 0.7 }}>{targetAddress}</p>
              {avgRating > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <StarRating rating={Math.round(avgRating)} color="rgba(255,255,255,0.3)" />
                  <span className="text-sm" style={{ opacity: 0.85 }}>{avgRating.toFixed(1)} / 5 ({reviews.length} review{reviews.length !== 1 ? "s" : ""})</span>
                </div>
              )}
            </div>
            {isOwnProfile && !editing && (
              <button onClick={() => { setEditing(true); setAvatarIpfs(profile?.ipfsAvatar || ""); }}
                className="ml-auto text-white text-sm px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(255,255,255,0.2)" }}>
                {profileExists ? "Edit Profile" : "Set Up Profile"}
              </button>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Edit form */}
            {editing && isOwnProfile && (
              <div className="border rounded-xl p-5 space-y-3" style={{ background: colors.primaryLight, borderColor: colors.primary + "33" }}>
                <h3 className="font-semibold" style={{ color: colors.pageFg }}>{profileExists ? "Edit Profile" : "Set Up Profile"}</h3>
                {saveError && <p className="text-sm" style={{ color: colors.dangerText }}>{saveError}</p>}
                <div>
                  <Label className="text-xs font-medium">Profile Photo</Label>
                  <div className="mt-1 flex items-center gap-4">
                    {avatarIpfs ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={resolveIpfsUrl(avatarIpfs)}
                        alt="Preview" className="w-16 h-16 rounded-full object-cover border"
                        style={{ borderColor: colors.cardBorder }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <Avatar address={targetAddress} size={64} />
                    )}
                    <div className="flex-1 space-y-2">
                      <IpfsFileUpload
                        accept="image/*"
                        label="Upload Photo"
                        existingCid={avatarIpfs || undefined}
                        onUpload={(cid) => setAvatarIpfs(cid)}
                      />
                      <Input value={avatarIpfs} onChange={e => setAvatarIpfs(e.target.value)}
                        placeholder="Or paste IPFS hash / URL"
                        className="text-xs" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Name</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Alice Dev"
                    className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Bio</Label>
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={2}
                    placeholder="Short introduction…"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    style={{ background: colors.inputBg, borderColor: colors.inputBorder, color: colors.pageFg }} />
                </div>
                <div>
                  <Label className="text-xs font-medium">Skills (comma-separated)</Label>
                  <Input value={editSkills} onChange={e => setEditSkills(e.target.value)} placeholder="e.g. Solidity, React"
                    className="mt-1" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(false)}
                    className="flex-1 border rounded-lg py-2 text-sm"
                    style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>Cancel</button>
                  <button onClick={saveProfile} disabled={saving || !editName}
                    className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
                    style={{ background: colors.primary, color: colors.primaryText }}>
                    {saving ? "Saving…" : "Save Profile"}
                  </button>
                </div>
                <p className="text-xs text-center" style={{ color: colors.warningText }}>
                  🦊 Profile is stored on-chain — one wallet transaction saves your info{avatarIpfs.trim() && avatarIpfs.trim() !== (profile?.ipfsAvatar || "") ? " (+ a second for your photo)" : ""}
                </p>
              </div>
            )}

            {/* Bio & skills */}
            {profileExists && !editing && (
              <div className="space-y-3">
                {profile?.bio && <LinkifyText text={profile.bio} className="text-sm leading-relaxed" style={{ color: colors.pageFg }} />}
                {skillList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skillList.map(s => (
                      <span key={s} className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: colors.primaryLight, color: colors.primaryFg }}>{s}</span>
                    ))}
                  </div>
                )}
                {profile?.createdAt && Number(profile.createdAt) > 0 && (
                  <p className="text-xs" style={{ color: colors.muted }}>Member since {formatDate(profile.createdAt)}</p>
                )}
              </div>
            )}

            {!profileExists && !editing && (
              <p className="text-sm italic" style={{ color: colors.muted }}>
                {isOwnProfile
                  ? "You haven't set up your profile yet. Click 'Set Up Profile' to add your details."
                  : "This user hasn't set up their profile yet."}
              </p>
            )}

            {/* Stats */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[90px] rounded-xl p-3 text-center" style={{ background: colors.surfaceBg }}>
                <p className="text-2xl font-bold" style={{ color: colors.pageFg }}>
                  {stats ? Number(stats.jobsCompleted).toString() : "—"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: colors.muted }}>Jobs Done</p>
              </div>
              <div className="flex-1 min-w-[90px] rounded-xl p-3 text-center" style={{ background: colors.primaryLight }}>
                <p className="text-2xl font-bold" style={{ color: colors.primaryFg }}>{vrtBalance}</p>
                <p className="text-xs mt-0.5" style={{ color: colors.primaryFg, opacity: 0.7 }}>VRT Tokens</p>
              </div>
              {stats && Number(stats.totalEarned) > 0 && (
                <div className="flex-1 min-w-[90px] rounded-xl p-3 text-center" style={{ background: colors.successBg }}>
                  <p className="text-2xl font-bold" style={{ color: colors.successText }}>
                    {parseFloat(ethers.formatEther(stats.totalEarned)).toFixed(2)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: colors.successText }}>ETH Earned</p>
                </div>
              )}
              {stats && Number(stats.totalSpent) > 0 && (
                <div className="flex-1 min-w-[90px] rounded-xl p-3 text-center" style={{ background: colors.warningBg }}>
                  <p className="text-2xl font-bold" style={{ color: colors.warningText }}>
                    {parseFloat(ethers.formatEther(stats.totalSpent)).toFixed(2)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: colors.warningText }}>ETH Spent</p>
                </div>
              )}
              <div className="flex-1 min-w-[90px] rounded-xl p-3 text-center" style={{ background: "#fef9c3" }}>
                <p className="text-2xl font-bold" style={{ color: "#a16207" }}>
                  {reviews.length > 0 ? avgRating.toFixed(1) : "—"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#a16207" }}>Avg Rating</p>
              </div>
            </div>

            {/* Reviews */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: colors.mutedFg }}>
                Reviews ({reviews.length})
              </h3>
              {reviews.length === 0 ? (
                <p className="text-sm" style={{ color: colors.muted }}>No reviews yet.</p>
              ) : (
                <div className="space-y-3">
                  {[...reviews].reverse().map((r, i) => (
                    <div key={i} className="border rounded-xl p-4" style={{ borderColor: colors.cardBorder }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <Avatar address={r.reviewer} size={24} />
                          <Link href={`/profile/${r.reviewer}`}
                            className="text-xs font-medium hover:underline" style={{ color: colors.primaryFg }}>
                            {shortenAddress(r.reviewer)}
                          </Link>
                        </div>
                        <StarRating rating={r.rating} color={colors.inputBorder} />
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: colors.pageFg }}>{r.comment}</p>
                      <p className="text-xs mt-1" style={{ color: colors.muted }}>
                        Job #{r.jobId.toString()} · {new Date(Number(r.timestamp) * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* B10: Endorsements */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: colors.mutedFg }}>
                Skill Endorsements ({endorsements.length})
              </h3>
              {endorsements.length === 0 ? (
                <p className="text-sm" style={{ color: colors.muted }}>No endorsements yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-3">
                  {/* Group by skill */}
                  {Object.entries(endorsements.reduce<Record<string, typeof endorsements>>((acc, e) => {
                    (acc[e.skill] = acc[e.skill] || []).push(e); return acc;
                  }, {})).map(([skill, ends]) => (
                    <div key={skill} className="border rounded-xl px-3 py-2" style={{ borderColor: colors.cardBorder }}>
                      <span className="text-xs font-semibold" style={{ color: colors.primaryFg }}>{skill}</span>
                      <span className="text-xs ml-1.5 px-1.5 py-0.5 rounded-full" style={{ background: colors.primaryLight, color: colors.primaryFg }}>
                        {ends.length}
                      </span>
                      <div className="flex gap-1 mt-1">
                        {ends.slice(0, 5).map((e, i) => (
                          <Link key={i} href={`/profile/${e.endorser}`} title={e.endorser}>
                            <Avatar address={e.endorser} size={20} />
                          </Link>
                        ))}
                        {ends.length > 5 && <span className="text-xs" style={{ color: colors.muted }}>+{ends.length - 5}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!isOwnProfile && signer && profileExists && (
                <div className="flex gap-2">
                  <Input value={endorseSkill} onChange={e => setEndorseSkill(e.target.value)}
                    placeholder="Skill to endorse (e.g. Solidity)"
                    containerClassName="flex-1" />
                  <Input value={endorseJobId} onChange={e => setEndorseJobId(e.target.value)}
                    placeholder="Job ID (opt)"
                    containerClassName="w-24" />
                  <button onClick={handleEndorseSkill} disabled={endorsing || !endorseSkill.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                    style={{ background: colors.primary, color: colors.primaryText }}>
                    {endorsing ? "…" : "Endorse"}
                  </button>
                </div>
              )}
            </div>

            {/* B11: Portfolio */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: colors.mutedFg }}>
                  Portfolio ({portfolio.length})
                </h3>
                {isOwnProfile && (
                  <button onClick={() => setShowPortfolioForm(!showPortfolioForm)}
                    className="text-xs px-2 py-1 rounded-lg" style={{ background: colors.primaryLight, color: colors.primaryFg }}>
                    {showPortfolioForm ? "Cancel" : "+ Add Item"}
                  </button>
                )}
              </div>
              {showPortfolioForm && isOwnProfile && (
                <div className="border rounded-xl p-4 mb-3 space-y-2" style={{ borderColor: colors.primary + "33", background: colors.primaryLight }}>
                  <Input value={portfolioTitle} onChange={e => setPortfolioTitle(e.target.value)}
                    placeholder="Portfolio item title"
                    className="w-full" />
                  <IpfsFileUpload
                    label="Upload Portfolio File"
                    existingCid={portfolioIpfs || undefined}
                    onUpload={(cid) => setPortfolioIpfs(cid)}
                  />
                  <p className="text-xs" style={{ color: colors.muted }}>Or paste a link / IPFS hash:</p>
                  <Input value={portfolioIpfs} onChange={e => setPortfolioIpfs(e.target.value)}
                    placeholder="https://github.com/… or IPFS hash"
                    className="w-full" />
                  <Input value={portfolioJobId} onChange={e => setPortfolioJobId(e.target.value)}
                    placeholder="Related Job ID (optional)"
                    className="w-full" />
                  <button onClick={handleAddPortfolio} disabled={addingPortfolio || !portfolioTitle.trim() || !portfolioIpfs.trim()}
                    className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-60"
                    style={{ background: colors.primary, color: colors.primaryText }}>
                    {addingPortfolio ? "Adding…" : "Add Portfolio Item"}
                  </button>
                </div>
              )}
              {portfolio.length === 0 ? (
                <p className="text-sm" style={{ color: colors.muted }}>No portfolio items yet.</p>
              ) : (
                <div className="space-y-2">
                  {[...portfolio].reverse().map((item, i) => (
                    <div key={i} className="border rounded-xl p-3 flex items-center justify-between" style={{ borderColor: colors.cardBorder }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: colors.pageFg }}>{item.title}</p>
                        <a href={resolveIpfsUrl(item.ipfsHash)}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs hover:underline" style={{ color: colors.primaryFg }}>
                          {isIpfsReference(item.ipfsHash) ? "View on IPFS ↗" : "View Link ↗"}
                        </a>
                      </div>
                      <div className="text-right">
                        {Number(item.jobId) > 0 && <span className="text-xs" style={{ color: colors.muted }}>Job #{item.jobId.toString()}</span>}
                        <p className="text-xs" style={{ color: colors.muted }}>
                          {new Date(Number(item.timestamp) * 1000).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* B13: Achievements */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: colors.mutedFg }}>
                Achievements ({achievements.length})
              </h3>
              {achievements.length === 0 ? (
                <p className="text-sm" style={{ color: colors.muted }}>No achievements unlocked yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {achievements.map((a, i) => (
                    <div key={i} className="border rounded-xl p-3 text-center" style={{ borderColor: colors.cardBorder, background: colors.surfaceBg }}>
                      <span className="text-2xl">{a.icon || "🏆"}</span>
                      <p className="text-sm font-semibold mt-1" style={{ color: colors.pageFg }}>{a.name}</p>
                      <p className="text-xs" style={{ color: colors.muted }}>{a.description}</p>
                      {Number(a.unlockedAt) > 0 && (
                        <p className="text-xs mt-1" style={{ color: colors.muted }}>
                          {new Date(Number(a.unlockedAt) * 1000).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
