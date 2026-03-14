import { NextRequest, NextResponse } from "next/server";
import { Contract, ethers } from "ethers";
import { JOB_MARKET_ABI, SUB_CONTRACTING_ABI } from "@/lib/abis";
import { streamServerClient } from "@/lib/realtime";

const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase();

function getServerProvider() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  if (!rpcUrl) return null;
  return new ethers.JsonRpcProvider(rpcUrl);
}

function canonicalPairKey(a: string, b: string) {
  return [a.toLowerCase(), b.toLowerCase()].sort().join(":");
}

function buildChatNamespace() {
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || "0";
  const jm = (process.env.NEXT_PUBLIC_JOB_MARKET || "0x0").toLowerCase();
  const sc = (process.env.NEXT_PUBLIC_SUB_CONTRACTING || "0x0").toLowerCase();
  return `${chainId}:${jm}:${sc}`;
}

function buildPairChannelId(pairKey: string, isSub: boolean) {
  const digest = ethers.keccak256(ethers.toUtf8Bytes(`${buildChatNamespace()}:${pairKey}`)).slice(2, 34);
  return `${isSub ? "subpair" : "pair"}-${digest}`;
}

async function resolveJobParticipants(jobId: string, isSub: boolean) {
  const provider = getServerProvider();
  if (!provider) {
    throw new Error("Missing NEXT_PUBLIC_RPC_URL for server-side participant resolution.");
  }

  if (isSub) {
    const scAddress = process.env.NEXT_PUBLIC_SUB_CONTRACTING;
    if (!scAddress) throw new Error("Missing NEXT_PUBLIC_SUB_CONTRACTING address.");

    const sc = new Contract(scAddress, SUB_CONTRACTING_ABI, provider);
    const sub = await sc.getSubContract(BigInt(jobId));

    const primary = String(sub.primaryFreelancer || "").toLowerCase();
    const subContractor = String(sub.subContractor || "").toLowerCase();

    if (!primary || primary === ZERO_ADDRESS || !subContractor || subContractor === ZERO_ADDRESS) {
      throw new Error("Sub-contract participants are not finalized yet.");
    }

    return { a: primary, b: subContractor };
  }

  const jmAddress = process.env.NEXT_PUBLIC_JOB_MARKET;
  if (!jmAddress) throw new Error("Missing NEXT_PUBLIC_JOB_MARKET address.");

  const jm = new Contract(jmAddress, JOB_MARKET_ABI, provider);
  const job = await jm.getJob(BigInt(jobId));

  const client = String(job.client || "").toLowerCase();
  const freelancer = String(job.selectedFreelancer || "").toLowerCase();

  if (!client || client === ZERO_ADDRESS || !freelancer || freelancer === ZERO_ADDRESS) {
    throw new Error("Job participants are not finalized yet.");
  }

  return { a: client, b: freelancer };
}

/**
 * GET /api/chat/token?jobId=123
 *
 * Issues a Stream Chat user token for the current wallet address and ensures
 * a 1:1 channel exists for the given job (or sub-contract).
 *
 * Assumptions:
 * - There is middleware or a header that provides the user's wallet address
 *   as X-Wallet-Address (you can wire this to your actual auth later).
 */
export async function GET(req: NextRequest) {
  if (!streamServerClient || !process.env.STREAM_API_KEY) {
    return NextResponse.json(
      { error: "Stream Chat is not configured on the server." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const isSub = searchParams.get("isSub") === "1";

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId in query string." },
      { status: 400 },
    );
  }

  // TODO: Replace this with your real auth (e.g. session or signature).
  const wallet = req.headers.get("x-wallet-address");
  if (!wallet) {
    return NextResponse.json(
      { error: "Missing wallet address. Add auth and pass X-Wallet-Address." },
      { status: 401 },
    );
  }

  const userId = wallet.toLowerCase();

  try {
    const { a, b } = await resolveJobParticipants(jobId, isSub);
    if (userId !== a && userId !== b) {
      return NextResponse.json(
        { error: "You are not a participant in this chat." },
        { status: 403 },
      );
    }

    const pairKey = canonicalPairKey(a, b);
    const channelId = buildPairChannelId(pairKey, isSub);

    // Upsert user in Stream
    await streamServerClient.upsertUsers([
      { id: a },
      { id: b },
    ]);

    // Ensure the pair-scoped channel exists and both participants are members.
    const channel = streamServerClient.channel("messaging", channelId, {
      members: [a, b],
    });

    try {
      await channel.create({
        created_by_id: userId,
      });
    } catch {
      // Channel may already exist.
    }

    try {
      await channel.addMembers([a, b]);
    } catch {
      // Members may already exist.
    }

    const token = streamServerClient.createToken(userId);

    return NextResponse.json({
      apiKey: process.env.STREAM_API_KEY,
      token,
      userId,
      channelId,
    });
  } catch (err) {
    console.error("Stream token route error:", err);
    return NextResponse.json(
      { error: "Failed to create chat token." },
      { status: 500 },
    );
  }
}

