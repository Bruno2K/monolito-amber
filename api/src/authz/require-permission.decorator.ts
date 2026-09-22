import { SetMetadata } from "@nestjs/common";
import type { PermissionCode } from "@amber/shared";

export const REQUIRED_PERMISSION = "amber:required_permission";

export const RequirePermission = (permission: PermissionCode) => SetMetadata(REQUIRED_PERMISSION, permission);
