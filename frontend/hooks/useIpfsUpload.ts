"use client";

import { useState, useCallback } from "react";

interface UploadResult {
  cid: string;
  url: string;
  size?: number;
}

interface UseIpfsUploadReturn {
  /** Upload a File to IPFS via the /api/upload route */
  uploadFile: (file: File) => Promise<UploadResult>;
  /** Upload a JSON object to IPFS via the /api/upload-json route */
  uploadJson: (content: object, name?: string) => Promise<UploadResult>;
  /** Whether an upload is currently in progress */
  uploading: boolean;
  /** The last error message, or null */
  error: string | null;
  /** Clear any stored error */
  clearError: () => void;
}

/**
 * React hook for uploading files and JSON to IPFS via the server-side
 * Pinata proxy routes.
 *
 * Usage:
 *   const { uploadFile, uploading, error } = useIpfsUpload();
 *   const { cid, url } = await uploadFile(selectedFile);
 */
export function useIpfsUpload(): UseIpfsUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      return { cid: data.cid, url: data.url, size: data.size };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const uploadJson = useCallback(
    async (content: object, name?: string): Promise<UploadResult> => {
      setUploading(true);
      setError(null);
      try {
        const res = await fetch("/api/upload-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, name }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `JSON upload failed (${res.status})`);
        }
        return { cid: data.cid, url: data.url };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { uploadFile, uploadJson, uploading, error, clearError };
}
