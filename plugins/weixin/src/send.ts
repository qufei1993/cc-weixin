/**
 * Send messages to WeChat users.
 */

import { randomUUID } from "node:crypto";
import { sendMessage } from "./api.js";
import { MessageType, MessageState, MessageItemType } from "./types.js";
import { uploadFile, guessMediaType } from "./media.js";
import type { MessageItem, CDNMedia } from "./types.js";

/** Convert markdown to plain text (WeChat doesn't support markdown) */
export function markdownToPlainText(text: string): string {
  return (
    text
      // Code blocks → content only
      .replace(/```[\s\S]*?\n([\s\S]*?)```/g, "$1")
      // Inline code
      .replace(/`([^`]+)`/g, "$1")
      // Bold/italic
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/___(.+?)___/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      // Strikethrough
      .replace(/~~(.+?)~~/g, "$1")
      // Headers → text
      .replace(/^#{1,6}\s+/gm, "")
      // Links → text (URL)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      // Images → [image: alt]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[$1]")
      // Blockquotes
      .replace(/^>\s+/gm, "")
      // Horizontal rules
      .replace(/^[-*_]{3,}$/gm, "---")
      // Unordered lists
      .replace(/^[\s]*[-*+]\s+/gm, "- ")
      // Ordered lists (preserve)
      .replace(/^[\s]*(\d+)\.\s+/gm, "$1. ")
      // Clean up extra blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Send a text message */
export async function sendText(params: {
  to: string;
  text: string;
  baseUrl: string;
  token: string;
  contextToken: string;
}): Promise<{ messageId: string }> {
  const { to, text, baseUrl, token, contextToken } = params;
  const clientId = randomUUID();
  const plainText = markdownToPlainText(text);

  await sendMessage(baseUrl, token, {
    to_user_id: to,
    from_user_id: "",
    client_id: clientId,
    message_type: MessageType.BOT,
    message_state: MessageState.FINISH,
    context_token: contextToken,
    item_list: [{ type: MessageItemType.TEXT, text_item: { text: plainText } }],
  });

  return { messageId: clientId };
}

/** Send a media file */
export async function sendMediaFile(params: {
  filePath: string;
  to: string;
  text: string;
  baseUrl: string;
  token: string;
  contextToken: string;
  cdnBaseUrl: string;
}): Promise<{ messageId: string }> {
  const { filePath, to, text, baseUrl, token, contextToken, cdnBaseUrl } = params;
  const clientId = randomUUID();
  const mediaType = guessMediaType(filePath);

  // Upload file to CDN
  const uploaded = await uploadFile({
    filePath,
    toUserId: to,
    mediaType,
    apiBaseUrl: baseUrl,
    token,
    cdnBaseUrl,
  });

  const cdnMedia: CDNMedia = {
    encrypt_query_param: uploaded.encryptQueryParam,
    aes_key: uploaded.aesKey,
    encrypt_type: 1,
  };

  // Build item list
  const items: MessageItem[] = [];

  // Add text if present
  if (text) {
    items.push({
      type: MessageItemType.TEXT,
      text_item: { text: markdownToPlainText(text) },
    });
  }

  // Add media item based on type
  switch (mediaType) {
    case 1: // IMAGE
      items.push({
        type: MessageItemType.IMAGE,
        image_item: { media: cdnMedia, mid_size: uploaded.fileSize },
      });
      break;
    case 2: // VIDEO
      items.push({
        type: MessageItemType.VIDEO,
        video_item: { media: cdnMedia, video_size: uploaded.fileSize },
      });
      break;
    default: // FILE
      items.push({
        type: MessageItemType.FILE,
        file_item: { media: cdnMedia, file_name: uploaded.fileName, len: String(uploaded.rawSize) },
      });
      break;
  }

  await sendMessage(baseUrl, token, {
    to_user_id: to,
    from_user_id: "",
    client_id: clientId,
    message_type: MessageType.BOT,
    message_state: MessageState.FINISH,
    context_token: contextToken,
    item_list: items,
  });

  return { messageId: clientId };
}
