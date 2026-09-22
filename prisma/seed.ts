import { PrismaClient } from "@prisma/client";
import {
  FORBIDDEN_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_TEMPLATES,
  assertClosedCatalog,
} from "../packages/shared/src/index.ts";

const prisma = new PrismaClient();

async function main() {
  for (const forbidden of FORBIDDEN_PERMISSIONS) {
    if ((PERMISSIONS as readonly string[]).includes(forbidden)) {
      throw new Error(`Closed catalog must not include ${forbidden}`);
    }
  }

  for (const code of PERMISSIONS) {
    assertClosedCatalog(code);
    const meta = PERMISSION_DESCRIPTIONS[code];
    await prisma.permissionDefinition.upsert({
      where: { code },
      create: { code, module: meta.module, description: meta.description },
      update: { module: meta.module, description: meta.description },
    });
  }

  const all = await prisma.permissionDefinition.findMany();
  const byCode = new Map(all.map((p) => [p.code, p]));

  if (all.some((p) => (FORBIDDEN_PERMISSIONS as readonly string[]).includes(p.code))) {
    throw new Error("Seed refused: closed catalog must not include a forbidden permission");
  }

  for (const template of ROLE_TEMPLATES) {
    for (const code of template.permissions) {
      assertClosedCatalog(code);
    }
    const existing = await prisma.roleDefinition.findFirst({
      where: { organizationId: null, templateKey: template.key },
    });
    const role = existing
      ? await prisma.roleDefinition.update({
          where: { id: existing.id },
          data: {
            name: template.name,
            description: template.description,
            sourceTemplateKey: template.key,
            isSystemTemplate: true,
          },
        })
      : await prisma.roleDefinition.create({
          data: {
            organizationId: null,
            templateKey: template.key,
            sourceTemplateKey: template.key,
            name: template.name,
            description: template.description,
            isSystemTemplate: true,
          },
        });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: template.permissions.map((code) => {
        const permission = byCode.get(code);
        if (!permission) {
          throw new Error(`Missing permission row for ${code}`);
        }
        return { roleId: role.id, permissionId: permission.id };
      }),
    });
  }

  const organizations = await prisma.organization.findMany({ select: { id: true } });
  const templates = await prisma.roleDefinition.findMany({
    where: { organizationId: null, isSystemTemplate: true },
    include: { rolePermissions: true },
  });
  for (const organization of organizations) {
    for (const template of templates) {
      const existing = await prisma.roleDefinition.findFirst({
        where: { organizationId: organization.id, templateKey: template.templateKey },
      });
      if (existing) {
        continue;
      }
      await prisma.roleDefinition.create({
        data: {
          organizationId: organization.id,
          templateKey: template.templateKey,
          sourceTemplateKey: template.sourceTemplateKey || template.templateKey,
          name: template.name,
          description: template.description,
          isSystemTemplate: false,
          rolePermissions: {
            create: template.rolePermissions.map((row) => ({ permissionId: row.permissionId })),
          },
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
