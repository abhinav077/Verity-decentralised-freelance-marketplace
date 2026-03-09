import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/upload-json
 *
 * Pins a JSON object to IPFS via Pinata.
 * Useful for storing metadata (job descriptions, profile data, etc.) on IPFS.
 * Accepts JSON body: { name?: string, content: object }
 * Returns { cid, url } on success.
 */
export async function POST(req: NextRequest) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      return NextResponse.json(
        { error: "PINATA_JWT is not configured on the server." },
        { status: 500 },
      );
    }

    const body = await req.json();
    const { name, content } = body;

    if (!content || typeof content !== "object") {
      return NextResponse.json(
        { error: "Request body must include a 'content' object." },
        { status: 400 },
      );
    }

    const pinataRes = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pinataContent: content,
          pinataMetadata: {
            name: name || "dfm-metadata",
            keyvalues: { app: "verity-dfm" },
          },
        }),
      },
    );

    if (!pinataRes.ok) {
      const text = await pinataRes.text();
      console.error("Pinata JSON pin error:", pinataRes.status, text);
      return NextResponse.json(
        { error: "Pinata JSON upload failed.", details: text },
        { status: pinataRes.status },
      );
    }

    const data = await pinataRes.json();
    const cid: string = data.IpfsHash;

    const gateway =
      process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
      process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
      "https://gateway.pinata.cloud/ipfs";

    return NextResponse.json({
      cid,
      url: `${gateway}/${cid}`,
      timestamp: data.Timestamp,
    });
  } catch (err) {
    console.error("Upload JSON route error:", err);
    return NextResponse.json(
      { error: "Internal server error during JSON upload." },
      { status: 500 },
    );
  }
}
