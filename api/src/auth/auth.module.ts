import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthzModule } from "../authz/authz.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailAdapter } from "./email.adapter";
import { MfaService } from "./mfa.service";
import { PasswordService } from "./password.service";
import { RateLimitService } from "./rate-limit.service";
import { SessionGuard } from "./session.guard";

@Module({
  imports: [AuditModule, AuthzModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, MfaService, EmailAdapter, RateLimitService, SessionGuard],
  exports: [AuthService, PasswordService, EmailAdapter, SessionGuard],
})
export class AuthModule {}
