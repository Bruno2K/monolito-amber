import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { FORBIDDEN_PERMISSIONS, PERMISSIONS, ROLE_TEMPLATES } from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("permissions")
  @ApiOperation({
    summary: "Closed 0.2A permission catalog (Formal Exception is the sole Gate bypass)",
  })
  async listPermissions() {
    const rows = process.env.SKIP_DB === "1"
      ? PERMISSIONS.map((code) => ({ code }))
      : await this.prisma.permissionDefinition.findMany({ orderBy: { code: "asc" } });
    if (rows.some((row) => (FORBIDDEN_PERMISSIONS as readonly string[]).includes(row.code))) {
      throw new Error("Closed catalog response refused: forbidden permission present");
    }
    return {
      source: "0.2A",
      permissions: rows.map((row) => row.code),
    };
  }

  @Get("role-templates")
  @ApiOperation({ summary: "Default Role templates from 0.2A §2" })
  listTemplates() {
    return {
      templates: ROLE_TEMPLATES.map((t) => ({
        key: t.key,
        name: t.name,
        permissions: t.permissions,
      })),
    };
  }
}
