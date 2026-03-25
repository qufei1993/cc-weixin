/**
 * CDN upload/download with AES-128-ECB encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { getUploadUrl } from "./api.js";
import { UploadMediaType } from "./types.js";

// --- AES-128-ECB ---

export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Calculate AES-128-ECB padded size (PKCS7) */
export function aesEcbPaddedSize(size: number): number {
  return size + (16 - (size % 16));
}

// --- CDN URL ---

export function buildCdnDownloadUrl(encryptedQueryParam: string, cdnBaseUrl: string): string {
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
}

export function buildCdnUploadUrl(cdnBaseUrl: string, uploadParam: string, filekey: string): string {
  return `${cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;
}

// --- AES Key parsing ---

/**
 * Parse aes_key from CDNMedia into a raw 16-byte Buffer.
 * Two encodings exist:
 *   - base64(raw 16 bytes) → images
 *   - base64(hex string of 16 bytes) → file/voice/video
 */
export function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, "base64");
  if (decoded.length === 16) {
    return decoded;
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  throw new Error(`Invalid aes_key: expected 16 raw bytes or 32 hex chars, got ${decoded.length} bytes`);
}

// --- CDN Download ---

export async function downloadAndDecrypt(params: {
  encryptQueryParam: string;
  aesKey: string;
  cdnBaseUrl: string;
}): Promise<Buffer> {
  const { encryptQueryParam, aesKey, cdnBaseUrl } = params;
  const url = buildCdnDownloadUrl(encryptQueryParam, cdnBaseUrl);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`CDN download failed: HTTP ${resp.status}`);
  }

  const ciphertext = Buffer.from(await resp.arrayBuffer());
  const keyBuf = parseAesKey(aesKey);
  return decryptAesEcb(ciphertext, keyBuf);
}

// --- CDN Upload ---

export interface UploadedFileInfo {
  encryptQueryParam: string;
  aesKey: string;
  fileSize: number;
  rawSize: number;
  fileName: string;
}

export async function uploadFile(params: {
  filePath: string;
  toUserId: string;
  mediaType: number;
  apiBaseUrl: string;
  token: string;
  cdnBaseUrl: string;
}): Promise<UploadedFileInfo> {
  const { filePath, toUserId, mediaType, apiBaseUrl, token, cdnBaseUrl } = params;

  // Read file
  const plaintext = readFileSync(filePath);
  const rawSize = plaintext.length;
  const rawMd5 = createHash("md5").update(plaintext).digest("hex");

  // Generate random AES key and filekey
  const aesKey = randomBytes(16);
  const filekey = randomBytes(16).toString("hex");

  // Encrypt
  const ciphertext = encryptAesEcb(plaintext, aesKey);
  const fileSize = ciphertext.length;

  // Get upload URL
  const uploadResp = await getUploadUrl(apiBaseUrl, token, {
    filekey,
    media_type: mediaType,
    to_user_id: toUserId,
    rawsize: rawSize,
    rawfilemd5: rawMd5,
    filesize: fileSize,
    no_need_thumb: true,
    aeskey: aesKey.toString("hex"),
  });

  if (!uploadResp.upload_param) {
    throw new Error("No upload_param in response");
  }

  // Upload ciphertext to CDN
  const uploadUrl = buildCdnUploadUrl(cdnBaseUrl, uploadResp.upload_param, filekey);
  const uploadResult = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(ciphertext),
  });

  if (!uploadResult.ok) {
    throw new Error(`CDN upload failed: HTTP ${uploadResult.status}`);
  }

  // Get encrypted param from response header
  const encryptQueryParam = uploadResult.headers.get("x-encrypted-param") || "";

  return {
    encryptQueryParam,
    aesKey: Buffer.from(aesKey.toString("hex")).toString("base64"),
    fileSize,
    rawSize,
    fileName: basename(filePath),
  };
}

/** Determine upload media type from MIME or extension */
export function guessMediaType(filePath: string): number {
  const ext = extname(filePath).toLowerCase();
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic"];
  const videoExts = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

  if (imageExts.includes(ext)) return UploadMediaType.IMAGE;
  if (videoExts.includes(ext)) return UploadMediaType.VIDEO;
  return UploadMediaType.FILE;
}

/** Download a remote URL to a local temp file */
export async function downloadRemoteToTemp(url: string, destDir?: string): Promise<string> {
  const dir = destDir || join(tmpdir(), "weixin-downloads");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);

  const buf = Buffer.from(await resp.arrayBuffer());
  // Try to extract filename from URL
  const urlPath = new URL(url).pathname;
  const name = basename(urlPath) || `file_${Date.now()}`;
  const dest = join(dir, name);
  writeFileSync(dest, buf);
  return dest;
}
