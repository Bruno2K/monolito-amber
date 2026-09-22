import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { FilesService } from "./files.service";

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get(":objectId/access")
  @ApiOperation({
    summary:
      "Evaluate fail-closed file access (F-08). Does not stream binaries. Vendor OPEN.",
  })
  @ApiParam({ name: "objectId", required: true, format: "uuid" })
  @ApiQuery({ name: "intent", required: false, enum: ["download", "preview"] })
  async access(
    @Param("objectId") objectId: string,
    @Query("intent") intent: "download" | "preview" = "download",
  ) {
    await this.files.authorizeDownload(objectId, intent);
    return { allowed: true, objectId, intent };
  }
}
