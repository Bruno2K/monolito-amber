import { Controller, Get, Param, Put, Query, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { FilesService } from "./files.service";

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get(":objectId/access")
  @ApiOperation({
    summary: "Evaluate fail-closed file access (F-08). Does not stream binaries. Vendor OPEN.",
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

  @Put("objects/:token")
  @ApiOperation({ summary: "Redeem a short-lived server-minted upload grant (local/dev object store)" })
  async upload(@Param("token") token: string, @Req() req: Request) {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => resolve());
      req.on("error", reject);
    });
    return this.files.putSignedUpload(token, Buffer.concat(chunks));
  }

  @Get("objects/:token")
  @ApiOperation({ summary: "Redeem a short-lived server-minted download grant" })
  async download(@Param("token") token: string, @Res() res: Response) {
    const file = await this.files.readSignedDownload(token);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    res.send(file.bytes);
  }
}
