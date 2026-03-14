import { NextRequest, NextResponse } from "next/server";
import { Contract, ethers } from "ethers";
import { JOB_MARKET_ABI, SUB_CONTRACTING_ABI } from "@/lib/abis";
import { liveblocksServerClient } from "@/lib/realtime";

const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase();

function getServerProvider() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  if (!rpcUrl) return null;
  return new ethers.JsonRpcProvider(rpcUrl);
}

function parseBoardScope(jobId: string) {
  const isSub = jobId.startsWith("sc-");
  const scopedId = isSub ? jobId.slice(3) : jobId;
  return { isSub, scopedId };
}

function buildBoardNamespace(isSub: boolean) {
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || "0";
  const contractAddress = isSub
    ? (process.env.NEXT_PUBLIC_SUB_CONTRACTING || "0x0")
    : (process.env.NEXT_PUBLIC_JOB_MARKET || "0x0");
  return `${chainId}-${contractAddress.toLowerCase()}`;
}

function buildBoardRoomId(jobId: string, isSub: boolean) {
  return `board-${buildBoardNamespace(isSub)}-${isSub ? "sc" : "job"}-${jobId}`;
}

async function resolveParticipants(jobId: string, isSub: boolean) {
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

    return [primary, subContractor];
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

  return [client, freelancer];
}

/**
 * GET /api/board/token?jobId=123
 *
 * Issues a Liveblocks room token so the current wallet can read/write the
 * board document for the given job.
 *
 * Assumptions:
 * - Wallet address is provided via X-Wallet-Address header (replace this
 *   with your real auth/session integration later).
 */
export async function GET(req: NextRequest) {
  if (!liveblocksServerClient) {
    return NextResponse.json(
      { error: "Liveblocks is not configured on the server." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId in query string." },
      { status: 400 },
    );
  }

  // TODO: Replace this with your actual auth/session.
  const wallet = req.headers.get("x-wallet-address");
  if (!wallet) {
    return NextResponse.json(
      { error: "Missing wallet address. Add auth and pass X-Wallet-Address." },
      { status: 401 },
    );
  }

  const userId = wallet.toLowerCase();

  try {
    const { isSub, scopedId } = parseBoardScope(jobId);
    const participants = await resolveParticipants(scopedId, isSub);
    if (!participants.includes(userId)) {
      return NextResponse.json(
        { error: "You are not a participant in this task board." },
        { status: 403 },
      );
    }

    const roomId = buildBoardRoomId(scopedId, isSub);

    const session = liveblocksServerClient.prepareSession(userId, {
      userInfo: { wallet: userId },
    });

    // Grant access to the room with full read/write permissions.
    session.allow(roomId, session.FULL_ACCESS);

    const { body, status } = await session.authorize();
    return new NextResponse(body, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Liveblocks token route error:", err);
    return NextResponse.json(
      { error: "Failed to authorize Liveblocks room." },
      { status: 500 },
    );
  }
}

