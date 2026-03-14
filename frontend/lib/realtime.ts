import { StreamChat } from "stream-chat";
import { Liveblocks } from "@liveblocks/node";

// Chat: initialized on the server when issuing tokens.
export const streamServerClient = process.env.STREAM_API_KEY && process.env.STREAM_API_SECRET
  ? StreamChat.getInstance(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET)
  : null;

// Liveblocks: used only via server-side secret key for rooms/documents.
export const liveblocksServerClient = process.env.LIVEBLOCKS_SECRET_KEY
  ? new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY })
  : null;

