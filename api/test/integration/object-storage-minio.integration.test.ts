import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import {
  objectHead,
  objectStorageBackend,
  putObjectBytes,
  readObjectBytes,
  resetObjectStorageClientForTests,
} from "../../src/files/object-storage";

const previous = {
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  bucket: process.env.S3_BUCKET,
  access: process.env.S3_ACCESS_KEY,
  secret: process.env.S3_SECRET_KEY,
  pathStyle: process.env.S3_FORCE_PATH_STYLE,
  require: process.env.AMBER_REQUIRE_S3,
  dir: process.env.OBJECT_STORAGE_DIR,
  testMinio: process.env.AMBER_TEST_MINIO,
};

let container: StartedTestContainer | undefined;
let unusedDir: string;

function restoreEnv(): void {
  const map: Record<string, string | undefined> = {
    S3_ENDPOINT: previous.endpoint,
    S3_REGION: previous.region,
    S3_BUCKET: previous.bucket,
    S3_ACCESS_KEY: previous.access,
    S3_SECRET_KEY: previous.secret,
    S3_FORCE_PATH_STYLE: previous.pathStyle,
    AMBER_REQUIRE_S3: previous.require,
    OBJECT_STORAGE_DIR: previous.dir,
    AMBER_TEST_MINIO: previous.testMinio,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetObjectStorageClientForTests();
}

beforeAll(async () => {
  unusedDir = await mkdtemp(join(tmpdir(), "amber-not-minio-"));
  container = await new GenericContainer("bitnamilegacy/minio:2025.7.23-debian-12-r5")
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: "amberminio",
      MINIO_ROOT_PASSWORD: "amberminio",
      MINIO_DEFAULT_BUCKETS: "amber-files",
    })
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000).forStatusCode(200))
    .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  process.env.AMBER_TEST_MINIO = "1";
  process.env.S3_ENDPOINT = endpoint;
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ACCESS_KEY = "amberminio";
  process.env.S3_SECRET_KEY = "amberminio";
  process.env.S3_BUCKET = "amber-files";
  process.env.S3_FORCE_PATH_STYLE = "true";
  process.env.AMBER_REQUIRE_S3 = "1";
  process.env.OBJECT_STORAGE_DIR = unusedDir;
  resetObjectStorageClientForTests();
}, 120_000);

afterAll(async () => {
  await container?.stop();
  restoreEnv();
  await rm(unusedDir, { recursive: true, force: true });
});

describe("MinIO live object storage adapter", () => {
  it("writes and reads tenant-bound bytes through MinIO, not OBJECT_STORAGE_DIR", async () => {
    expect(objectStorageBackend()).toBe("s3");
    const storageKey = `org/org-a/project/proj-a/documents/doc-a/revisions/rev-a/minio-rc1.bin`;
    const payload = Buffer.from(`minio-live-${Date.now()}`);
    await putObjectBytes(storageKey, payload);
    await expect(readObjectBytes(storageKey)).resolves.toEqual(payload);
    await expect(objectHead(storageKey)).resolves.toEqual({ byteSize: payload.length });

    const leftover = await readdir(unusedDir).catch(() => []);
    expect(leftover).toEqual([]);

    const independent = new S3Client({
      region: "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: "amberminio", secretAccessKey: "amberminio" },
    });
    const got = await independent.send(
      new GetObjectCommand({
        Bucket: "amber-files",
        Key: storageKey,
      }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of got.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks)).toEqual(payload);
    independent.destroy();
  });
});
