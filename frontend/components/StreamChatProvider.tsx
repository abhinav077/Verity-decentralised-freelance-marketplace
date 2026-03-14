"use client";

import { useEffect, useState } from "react";
import { StreamChat, Channel as StreamChannel } from "stream-chat";
import {
  Chat,
  Channel,
  Window,
  MessageList,
  MessageInput,
} from "stream-chat-react";
import { useTheme } from "@/context/ThemeContext";
import "stream-chat-react/dist/css/v2/index.css";

interface Props {
  jobId: string;
  isSubContract?: boolean;
  walletAddress: string;
  onMessagesCountChange?: (count: number) => void;
}

export function JobChat({ jobId, isSubContract, walletAddress, onMessagesCountChange }: Props) {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const { colors, theme } = useTheme();

  const useDarkChat = theme === "dark" || theme === "midnight" || theme === "ocean";
  const chatBackground = useDarkChat ? colors.cardBg : "#FFFFFF";
  const chatSurface = useDarkChat ? colors.inputBg : "#FFFFFF";
  const chatSurfaceLow = useDarkChat ? colors.surfaceBg : "#F8FAFC";
  const chatText = useDarkChat ? colors.pageFg : "#0F172A";
  const chatMuted = useDarkChat ? colors.mutedFg : "#475569";
  const chatBorder = useDarkChat ? colors.cardBorder : "#E2E8F0";
  const chatMessageOther = useDarkChat ? colors.inputBg : "#F1F5F9";
  const chatMessageMine = useDarkChat ? colors.primary : colors.primary;

  useEffect(() => {
    let chat: StreamChat | null = null;

    (async () => {
      try {
        const res = await fetch(
          `/api/chat/token?jobId=${encodeURIComponent(
            isSubContract ? jobId.replace(/^sc-/, "") : jobId,
          )}&isSub=${isSubContract ? "1" : "0"}`,
          {
            headers: {
              "x-wallet-address": walletAddress,
            },
          },
        );
        if (!res.ok) return;
        const { apiKey, token, userId, channelId } = await res.json();

        chat = StreamChat.getInstance(apiKey);
        await chat.connectUser({ id: userId }, token);

        const c = chat.channel("messaging", channelId);
        await c.watch();

        onMessagesCountChange?.(c.state.messages.length);
        c.on("message.new", () => {
          onMessagesCountChange?.(c.state.messages.length);
        });

        setClient(chat);
        setChannel(c);
      } catch (e) {
        console.error("Stream chat init error", e);
      }
    })();

    return () => {
      if (chat) {
        chat.disconnectUser().catch(() => {});
      }
    };
  }, [jobId, isSubContract, walletAddress]);

  if (!client || !channel) return null;

  return (
    <div
      className="rounded-2xl border p-2 verity-stream-chat"
      style={{
        background: chatBackground,
        borderColor: chatBorder,
        color: chatText,
        ["--str-chat__background-color" as string]: chatBackground,
        ["--str-chat__primary-color" as string]: colors.primary,
        ["--str-chat__active-primary-color" as string]: colors.primary,
        ["--str-chat__on-primary-color" as string]: colors.primaryText,
        ["--str-chat__surface-color" as string]: chatSurface,
        ["--str-chat__surface-color-low" as string]: chatSurfaceLow,
        ["--str-chat__secondary-surface-color" as string]: chatSurfaceLow,
        ["--str-chat__text-color" as string]: chatText,
        ["--str-chat__secondary-text-color" as string]: chatMuted,
        ["--str-chat__border-color" as string]: chatBorder,
        ["--str-chat__message-bubble-color" as string]: chatMessageOther,
        ["--str-chat__message-bubble-color-me" as string]: chatMessageMine,
      }}
    >
      <Chat client={client} theme={useDarkChat ? "str-chat__theme-dark" : "str-chat__theme-light"}>
        <Channel channel={channel}>
          <Window>
            <MessageList />
            <MessageInput />
          </Window>
        </Channel>
      </Chat>
    </div>
  );
}

