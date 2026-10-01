# MinIO live adapter — Local RC evidence

LOCAL ONLY. Bytes in Local RC go through the S3-compatible MinIO service using the existing env contract. `OBJECT_STORAGE_DIR` is not the live adapter when `S3_ENDPOINT` + bucket + keys are set. `AMBER_REQUIRE_S3=1` fail-closes if that contract is incomplete.

## Contract

| Variable | Local value |
| --- | --- |
| `S3_ENDPOINT` | `http://localhost:9000` (compose service `minio`, image `bitnamilegacy/minio`) |
| `S3_REGION` | `us-east-1` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `amberminio` (placeholder, not a cloud secret) |
| `S3_BUCKET` | `amber-files` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `AMBER_REQUIRE_S3` | `1` |

Implementation: `api/src/files/object-storage.ts` (`PutObject` / `GetObject` / `HeadObject`, tenant-bound keys unchanged, signed upload/download tokens unchanged, checksum + scan-status still fail-closed in `FilesService`).

Startup: `assertLiveObjectStorageReady()` in `api/src/main.ts` logs `objectStorage: "s3"` (or refuses to boot if S3 is required and missing).

## Proof (automated)

Images: `bitnamilegacy/minio:2025.7.23-debian-12-r5` (MinIO server). Docker Hub `minio/minio` + `minio/mc` were removed in 2026-09; anonymous Quay pulls were unauthorized from this agent, so Local RC uses the public Bitnami-legacy MinIO image. Bucket `amber-files` is created with `MINIO_DEFAULT_BUCKETS` (and again by the adapter’s `CreateBucket` if missing).

1. **Foundation CI / Testcontainers** — `api/test/integration/object-storage-minio.integration.test.ts`
   - Starts MinIO from Quay.
   - Puts a tenant-bound key.
   - Reads it back through the adapter.
   - Independent `@aws-sdk/client-s3` `GetObject` against the bucket (not the filesystem).
   - Asserts `OBJECT_STORAGE_DIR` stayed empty.
2. **Local RC job** — GitHub Actions starts MinIO on `:9000`, sets the env contract, `AMBER_REQUIRE_S3=1`. API process therefore cannot silently use disk.

## Manual curl (optional on a live stack)

After `pnpm local-rc:up`, redeem a signed upload URL from Documents (PF-1.3) or call the adapter in a REPL. Reviewer should prefer the integration test log over a narrative.

## Preserved floors

Private bucket (MinIO local only; no public policy). Keys `org/{organizationId}/project/{projectId}/documents/...`. Signed tokens still HMAC + expiry. Scanner PENDING/BLOCKED still deny download.
