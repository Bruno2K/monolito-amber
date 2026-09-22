import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { AuthzModule } from "./authz/authz.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CoordinationModule } from "./coordination/coordination.module";
import { DocumentModule } from "./document/document.module";
import { FilesModule } from "./files/files.module";
import { FoundationModule } from "./foundation/foundation.module";
import { HealthModule } from "./health/health.module";
import { CorrelationMiddleware } from "./observability/correlation";
import { OrgModule } from "./org/org.module";
import { PrismaModule } from "./prisma/prisma.module";
import { GovernanceModule } from "./governance/governance.module";
import { PlanningModule } from "./planning/planning.module";
import { ProjectModule } from "./project/project.module";
import { TenancyModule } from "./tenancy/tenancy.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    AuthzModule,
    OrgModule,
    ProjectModule,
    TenancyModule,
    CatalogModule,
    DocumentModule,
    CoordinationModule,
    PlanningModule,
    GovernanceModule,
    FilesModule,
    AuditModule,
    FoundationModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
