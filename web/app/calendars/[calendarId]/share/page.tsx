"use client";

import { useParams } from "next/navigation";
import { CalendarSharePanel } from "../../../../components/calendar/CalendarSharePanel";
import { CalendarStates } from "../../../../components/calendar/CalendarStates";

export default function CalendarSharePage() {
  const params = useParams<{ calendarId: string }>();
  if (!params.calendarId) {
    return <CalendarStates state="revoked" action={{ href: "/calendars", label: "Voltar aos calendários" }} />;
  }
  return <CalendarSharePanel calendarId={params.calendarId} />;
}
