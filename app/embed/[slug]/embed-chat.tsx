"use client";

import { useEffect } from "react";
import { AgentChat } from "@/app/_components/agent-chat";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { track } from "@/lib/analytics-client";
import { resolveChatBranding } from "@/lib/chat-branding";
import type { AppLocale } from "@/lib/locale";
import type { PublicBookingWorkspace } from "@/lib/workspace";

export function EmbedChat({
  workspace,
  initialLocale,
}: {
  workspace: PublicBookingWorkspace;
  initialLocale: AppLocale;
}) {
  useEffect(() => {
    track(ANALYTICS_EVENT.EMBED_LOADED, {
      workspaceId: workspace.id,
      slug: workspace.slug,
    });
  }, [workspace.id, workspace.slug]);

  const chatBranding = resolveChatBranding({
    assistantLabel: workspace.chatAssistantLabel,
    intro: workspace.chatIntro,
    suggestions: workspace.chatSuggestions,
    placeholder: workspace.chatPlaceholder,
  });

  return (
    <div className="flex h-dvh flex-col bg-zinc-950">
      <AgentChat
        chatBranding={chatBranding}
        initialLocale={initialLocale}
        user={null}
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        workspaceTagline={workspace.tagline}
      />
    </div>
  );
}

