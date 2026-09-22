import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SessionExpiredError, SessionRevokedError } from "@amber/shared";
import { AuthService } from "./auth.service";
import { CurrentSession } from "./current-session.decorator";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session.cookie";
import { SessionGuard } from "./session.guard";
import type { AuthenticatedRequest, RequestSession } from "./session.types";

class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  displayName!: string;
}

class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

class SwitchOrganizationDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  organizationId!: string;
}

class PasswordResetRequestDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

class PasswordResetDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

class MfaChallengeDto {
  @ApiProperty()
  @IsString()
  mfaToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  totp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recoveryCode?: string;
}

class MfaEnrollVerifyDto {
  @ApiProperty()
  @IsString()
  challengeToken!: string;

  @ApiProperty()
  @IsString()
  totp!: string;
}

class ReauthDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  totp?: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Create a global User + EMAIL_PASSWORD AuthenticationIdentity" })
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const issued = await this.auth.register(body);
    setSessionCookie(res, issued.token);
    return this.auth.sessionView(issued.session);
  }

  @Post("login")
  @ApiOperation({ summary: "Email/password login with lockout, rate limit, and MFA challenge" })
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login({
      email: body.email,
      password: body.password,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
    if (result.status === "mfa_required") {
      return { status: result.status, mfaToken: result.mfaToken };
    }
    setSessionCookie(res, result.token);
    const view = await this.auth.sessionView(result.session);
    return { status: result.status, ...view };
  }

  @Post("mfa/challenge")
  @ApiOperation({ summary: "Complete a TOTP or recovery-code MFA login challenge" })
  async mfaChallenge(@Body() body: MfaChallengeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const issued = await this.auth.completeMfaLogin({
      mfaToken: body.mfaToken,
      totp: body.totp,
      recoveryCode: body.recoveryCode,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
    setSessionCookie(res, issued.token);
    return this.auth.sessionView(issued.session);
  }

  @Post("mfa/enroll")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Start TOTP enrollment; returns otpauth URI (secret is not logged)" })
  startMfaEnroll(@CurrentSession() session: RequestSession) {
    return this.auth.startMfaEnroll(this.auth.requireSession(session));
  }

  @Post("mfa/enroll/verify")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Verify TOTP enrollment and issue hashed recovery codes once" })
  verifyMfaEnroll(@CurrentSession() session: RequestSession, @Body() body: MfaEnrollVerifyDto) {
    return this.auth.verifyMfaEnroll(this.auth.requireSession(session), body);
  }

  @Post("mfa/recovery-codes")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Regenerate recovery codes after password or TOTP re-authentication" })
  regenerateRecovery(@CurrentSession() session: RequestSession, @Body() body: ReauthDto) {
    return this.auth.regenerateRecoveryCodes(this.auth.requireSession(session), body);
  }

  @Post("reauthenticate")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Refresh high-risk action freshness (password or TOTP)" })
  async reauthenticate(@CurrentSession() session: RequestSession, @Body() body: ReauthDto) {
    await this.auth.reauthenticate(this.auth.requireSession(session), body);
    return { ok: true };
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Revoke the current opaque session" })
  async logout(@CurrentSession() session: RequestSession, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.auth.requireSession(session));
    clearSessionCookie(res);
    return { ok: true };
  }

  @Post("logout-all")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Revoke every session for the authenticated User" })
  async logoutAll(@CurrentSession() session: RequestSession, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(this.auth.requireSession(session));
    clearSessionCookie(res);
    return { ok: true };
  }

  @Get("session")
  @ApiOperation({ summary: "Return the session-bound active Organization (never trust client orgId)" })
  @ApiCookieAuth()
  async getSession(@Req() req: Request & AuthenticatedRequest) {
    const token = readSessionToken(req.cookies, req.header("x-session-token") ?? undefined);
    try {
      const session = await this.auth.loadSessionByToken(token);
      return this.auth.sessionView(session);
    } catch (error) {
      if (error instanceof SessionRevokedError || error instanceof SessionExpiredError) {
        return this.auth.sessionView(null);
      }
      throw error;
    }
  }

  @Post("active-organization")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: "Org-switch: re-validates ACTIVE membership then binds session org server-side",
  })
  async switchOrg(@CurrentSession() session: RequestSession, @Body() body: SwitchOrganizationDto) {
    return this.auth.switchOrganization({
      session: this.auth.requireSession(session),
      targetOrganizationId: body.organizationId,
    });
  }

  @Post("password/forgot")
  @ApiOperation({ summary: "Request a hashed 30-minute password reset token (no email enumeration)" })
  async forgotPassword(@Body() body: PasswordResetRequestDto) {
    await this.auth.requestPasswordReset(body.email);
    return { ok: true };
  }

  @Post("password/reset")
  @ApiOperation({ summary: "Consume a reset token, set a new password, and revoke all sessions" })
  async resetPassword(@Body() body: PasswordResetDto) {
    await this.auth.resetPassword(body);
    return { ok: true };
  }
}
