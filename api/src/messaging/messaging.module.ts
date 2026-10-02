import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { FoundationModule } from "../foundation/foundation.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { MessagingAccess } from "./messaging.access";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [ConversationsController, MessagesController],
  providers: [MessagingAccess, ConversationsService, MessagesService],
  exports: [ConversationsService, MessagesService],
})
export class MessagingModule {}
