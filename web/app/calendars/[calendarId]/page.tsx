"use client";

import { useParams } from "next/navigation";
import { CalendarWorkspace } from "../../../components/calendar/CalendarWorkspace";
import { CalendarStates } from "../../../components/calendar/CalendarStates";

export default function CalendarPage() {
  const params = useParams<{ calendarId: string }>();
  if (!params.calendarId) {
    return <CalendarStates state="revoked" action={{ href: "/calendars", label: "Voltar aos calendários" }} />;
  }
  return <CalendarWorkspace calendarId={params.calendarId} />;
}
