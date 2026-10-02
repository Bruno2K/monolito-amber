import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { FoundationModule } from "../foundation/foundation.module";
import { CalendarAccess } from "./calendar.access";
import { CalendarsController } from "./calendars.controller";
import { CalendarsService } from "./calendars.service";
import { EventsService } from "./events.service";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [CalendarsController, ScheduleController],
  providers: [CalendarAccess, CalendarsService, EventsService, ScheduleService],
  exports: [CalendarsService, EventsService, ScheduleService],
})
export class CalendarModule {}
