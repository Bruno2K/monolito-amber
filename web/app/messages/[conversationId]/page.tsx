"use client";

import { useParams } from "next/navigation";
import { MessagingWorkspace } from "../../../components/messaging/MessagingWorkspace";

export default function MessageThreadPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = typeof params.conversationId === "string" ? params.conversationId : null;
  return <MessagingWorkspace conversationId={conversationId} />;
}
