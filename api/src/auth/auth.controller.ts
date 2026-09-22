import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import type { RequestSession } from "./session.types";

class SwitchOrganizationDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  organizationId!: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("session")
  @ApiOperation({
    summary: "Return the session-bound active Organization (never trust client orgId)",
  })
  @ApiHeader({ name: "x-session-token-hash", required: false })
  async getSession(@Req() req: Request) {
    const session = await this.load(req);
    return {
      authenticated: Boolean(session),
      userId: session?.userId ?? null,
      activeOrganizationId: session?.activeOrganizationId ?? null,
    };
  }

  @Post("active-organization")
  @ApiOperation({
    summary: "Org-switch stub: re-validates ACTIVE membership then binds session org server-side",
  })
  @ApiHeader({ name: "x-session-token-hash", required: true })
  async switchOrg(@Req() req: Request, @Body() body: SwitchOrganizationDto) {
    const session = this.auth.requireSession(await this.load(req));
    return this.auth.switchOrganization({
      session,
      targetOrganizationId: body.organizationId,
    });
  }

  private load(req: Request): Promise<RequestSession | null> {
    return this.auth.loadSession(req.header("x-session-token-hash") ?? undefined);
  }
}
