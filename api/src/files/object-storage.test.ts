import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileIntegrityError } from "@amber/shared";
import {
  assertObjectStorageContract,
  objectHead,
  objectStorageBackend,
  putObjectBytes,
  readObjectBytes,
  resetObjectStorageClientForTests,
  s3Required,
} from "./object-storage";

const original = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET,
  access: process.env.S3_ACCESS_KEY,
  secret: process.env.S3_SECRET_KEY,
  require: process.env.AMBER_REQUIRE_S3,
  dir: process.env.OBJECT_STORAGE_DIR,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries({
    S3_ENDPOINT: original.endpoint,
    S3_BUCKET: original.bucket,
    S3_ACCESS_KEY: original.access,
    S3_SECRET_KEY: original.secret,
    AMBER_REQUIRE_S3: original.require,
    OBJECT_STORAGE_DIR: original.dir,
  })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetObjectStorageClientForTests();
}

afterEach(() => {
  restoreEnv();
});

describe("object storage adapter selection", () => {
  it("uses the filesystem fallback when S3 is not configured", async () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.AMBER_REQUIRE_S3;
    const dir = await mkdtemp(join(tmpdir(), "amber-fs-"));
    process.env.OBJECT_STORAGE_DIR = dir;
    resetObjectStorageClientForTests();
    expect(objectStorageBackend()).toBe("filesystem");
    expect(s3Required()).toBe(false);
    await putObjectBytes("org/a/project/p/documents/d/revisions/r/note.txt", Buffer.from("hello-fs"));
    await expect(readObjectBytes("org/a/project/p/documents/d/revisions/r/note.txt")).resolves.toEqual(
      Buffer.from("hello-fs"),
    );
    await expect(objectHead("org/a/project/p/documents/d/revisions/r/note.txt")).resolves.toEqual({ byteSize: 8 });
    await rm(dir, { recursive: true, force: true });
  });

  it("fail-closes Local RC when S3 is required but incomplete", () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    process.env.AMBER_REQUIRE_S3 = "1";
    resetObjectStorageClientForTests();
    expect(() => assertObjectStorageContract()).toThrow(FileIntegrityError);
  });

  it("selects s3 when the existing env contract is complete", () => {
    process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.S3_BUCKET = "amber-files";
    process.env.S3_ACCESS_KEY = "amberminio";
    process.env.S3_SECRET_KEY = "amberminio";
    delete process.env.AMBER_REQUIRE_S3;
    resetObjectStorageClientForTests();
    expect(objectStorageBackend()).toBe("s3");
  });

  it("does not treat OBJECT_STORAGE_DIR as live when S3 is configured", async () => {
    process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.S3_BUCKET = "amber-files";
    process.env.S3_ACCESS_KEY = "amberminio";
    process.env.S3_SECRET_KEY = "amberminio";
    const dir = await mkdtemp(join(tmpdir(), "amber-unused-"));
    process.env.OBJECT_STORAGE_DIR = dir;
    resetObjectStorageClientForTests();
    expect(objectStorageBackend()).toBe("s3");
    await expect(readFile(join(dir, "should-not-exist"), "utf8")).rejects.toThrow();
    await rm(dir, { recursive: true, force: true });
  });
});
