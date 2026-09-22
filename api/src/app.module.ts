import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { CatalogModule } from "./catalog/catalog.module";
import { FilesModule } from "./files/files.module";
import { FoundationModule } from "./foundation/foundation.module";
import { HealthModule } from "./health/health.module";
import { CorrelationMiddleware } from "./observability/correlation";
import { PrismaModule } from "./prisma/prisma.module";
import { TenancyModule } from "./tenancy/tenancy.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    TenancyModule,
    CatalogModule,
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
