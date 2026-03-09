import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/upload
 *
 * Proxies file uploads to Pinata so the JWT stays server-side.
 * Accepts multipart/form-data with a single "file" field.
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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "No file provided." },
        { status: 400 },
      );
    }

    // Enforce a 10 MB limit
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB).` },
        { status: 400 },
      );
    }

    // Build the multipart body for Pinata
    const pinataForm = new FormData();
    pinataForm.append("file", file);

    // Optional: attach metadata so files are identifiable in the Pinata dashboard
    const metadata = JSON.stringify({
      name: file.name || "dfm-upload",
      keyvalues: { app: "verity-dfm" },
    });
    pinataForm.append("pinataMetadata", metadata);

    const pinataRes = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: pinataForm,
      },
    );

    if (!pinataRes.ok) {
      const text = await pinataRes.text();
      console.error("Pinata error:", pinataRes.status, text);
      return NextResponse.json(
        { error: "Pinata upload failed.", details: text },
        { status: pinataRes.status },
      );
    }

    const data = await pinataRes.json();
    const cid: string = data.IpfsHash;

    // Use the project's configured gateway, fall back to a public one
    const gateway =
      process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
      process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
      "https://gateway.pinata.cloud/ipfs";

    return NextResponse.json({
      cid,
      url: `${gateway}/${cid}`,
      size: data.PinSize,
      timestamp: data.Timestamp,
    });
  } catch (err) {
    console.error("Upload route error:", err);
    return NextResponse.json(
      { error: "Internal server error during upload." },
      { status: 500 },
    );
  }
}
