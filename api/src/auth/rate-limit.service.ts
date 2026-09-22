import { Injectable } from "@nestjs/common";
import { consumeRateLimit, type RateBucket } from "@amber/shared";

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, RateBucket>();

  consume(key: string): void {
    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    consumeRateLimit(bucket);
    this.buckets.set(key, bucket);
  }
}
