import { Injectable } from "@nestjs/common";
import { consumeRateLimit, type RateBucket } from "@amber/shared";

/**
 * Process-local in-memory login/reset limiter.
 * Safe for a single API instance (foundation). Horizontal scaling needs shared
 * state (for example Redis) — do not introduce that store solely for PF-1.1R.
 */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, RateBucket>();

  consume(key: string): void {
    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    consumeRateLimit(bucket);
    this.buckets.set(key, bucket);
  }
}
