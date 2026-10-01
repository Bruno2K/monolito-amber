import { Injectable } from "@nestjs/common";
import { HUB_CACHE_TTL_MS } from "@amber/shared";

export interface HubCacheRecord<T> {
  payload: T;
  storedAtMs: number;
  generatedAt: string;
  sourceMaxUpdatedAt: string | null;
  userId: string;
  projectId: string;
}

@Injectable()
export class HubCacheService {
  private readonly store = new Map<string, HubCacheRecord<unknown>>();

  key(input: { projectId: string; userId: string; permissionFingerprint: string }): string {
    return `${input.projectId}:${input.userId}:${input.permissionFingerprint}`;
  }

  get<T>(key: string, nowMs = Date.now()): HubCacheRecord<T> | null {
    const row = this.store.get(key) as HubCacheRecord<T> | undefined;
    if (!row) {
      return null;
    }
    if (nowMs - row.storedAtMs > HUB_CACHE_TTL_MS) {
      this.store.delete(key);
      return null;
    }
    return row;
  }

  set<T>(key: string, record: HubCacheRecord<T>): void {
    this.store.set(key, record);
  }

  invalidateProject(projectId: string): void {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(`${projectId}:`)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}
