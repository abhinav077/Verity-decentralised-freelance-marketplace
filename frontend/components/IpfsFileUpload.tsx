"use client";

import { useRef, useState, useCallback } from "react";
import { useIpfsUpload } from "@/hooks/useIpfsUpload";
import { resolveIpfsUrl } from "@/lib/ipfs";

interface IpfsFileUploadProps {
  /** Called with the CID after a successful upload */
  onUpload: (cid: string, url: string) => void;
  /** Accepted file types, e.g. "image/*" or "image/*,.pdf" */
  accept?: string;
  /** Label shown on the drop zone */
  label?: string;
  /** Optional: show a preview of an existing CID */
  existingCid?: string;
  /** Max file size in bytes (default 10 MB) */
  maxSize?: number;
  /** If true, renders a compact inline version */
  compact?: boolean;
  /** If true, disables the upload */
  disabled?: boolean;
}

/**
 * Drag-and-drop + click-to-browse file uploader that pins to IPFS
 * via the server-side Pinata route.
 */
export default function IpfsFileUpload({
  onUpload,
  accept = "*",
  label = "Upload to IPFS",
  existingCid,
  maxSize = 10 * 1024 * 1024,
  compact = false,
  disabled = false,
}: IpfsFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading, error, clearError } = useIpfsUpload();
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedCid, setUploadedCid] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      clearError();
      if (file.size > maxSize) {
        alert(`File too large. Max size: ${(maxSize / 1024 / 1024).toFixed(0)} MB`);
        return;
      }

      // Show image preview immediately
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      }

      try {
        const { cid, url } = await uploadFile(file);
        setUploadedCid(cid);
        onUpload(cid, url);
      } catch {
        setPreview(null);
      }
    },
    [uploadFile, onUpload, maxSize, clearError],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be selected again
      e.target.value = "";
    },
    [handleFile],
  );

  const displayCid = uploadedCid || existingCid;
  const displayUrl = displayCid ? resolveIpfsUrl(displayCid) : null;
  const isImage = accept?.includes("image");

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--border, #333)",
            background: "var(--muted, #1a1a2e)",
            color: "var(--foreground, #e0e0e0)",
            cursor: disabled || uploading ? "not-allowed" : "pointer",
            fontSize: 13,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {uploading ? "Uploading…" : label}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          style={{ display: "none" }}
        />
        {displayCid && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            ✓ {displayCid.slice(0, 8)}…
          </span>
        )}
        {error && (
          <span style={{ fontSize: 12, color: "var(--danger, #ef4444)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        style={{
          border: `2px dashed ${
            dragOver
              ? "var(--primary, #6366f1)"
              : "var(--border, #333)"
          }`,
          borderRadius: 10,
          padding: "20px 16px",
          textAlign: "center",
          cursor: disabled || uploading ? "not-allowed" : "pointer",
          background: dragOver
            ? "var(--primary-light, rgba(99,102,241,0.08))"
            : "var(--muted, #0d0d1a)",
          transition: "all 0.2s ease",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {uploading ? (
          <p style={{ margin: 0, color: "var(--foreground, #e0e0e0)" }}>
            ⏳ Uploading to IPFS…
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 500, color: "var(--foreground, #e0e0e0)" }}>
              {label}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.6, color: "var(--foreground, #e0e0e0)" }}>
              Drag & drop or click to browse ({(maxSize / 1024 / 1024).toFixed(0)} MB max)
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onChange}
        style={{ display: "none" }}
      />

      {error && (
        <p style={{ color: "var(--danger, #ef4444)", fontSize: 13, marginTop: 6 }}>
          ⚠ {error}
        </p>
      )}

      {displayCid && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--success-bg, rgba(34,197,94,0.1))",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--success, #22c55e)" }}>✓ Pinned to IPFS</span>
          <br />
          <code style={{ fontSize: 11, wordBreak: "break-all", opacity: 0.8 }}>
            {displayCid}
          </code>
        </div>
      )}

      {/* Image preview */}
      {isImage && (preview || displayUrl) && (
        <div style={{ marginTop: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview || displayUrl || ""}
            alt="Preview"
            style={{
              maxWidth: 120,
              maxHeight: 120,
              borderRadius: 8,
              objectFit: "cover",
              border: "1px solid var(--border, #333)",
            }}
          />
        </div>
      )}
    </div>
  );
}
