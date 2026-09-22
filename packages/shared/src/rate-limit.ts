import { RateLimitedError } from "./errors.js";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from "./session.js";

/**
 * In-memory sliding window. The API RateLimitService keeps buckets in process
 * memory — sufficient for a single instance. Multi-instance deployments need a
 * shared store later; PF-1.1R does not introduce Redis for this limiter.
 */

export interface RateBucket {
  timestamps: number[];
}

export function consumeRateLimit(
  bucket: RateBucket,
  now = Date.now(),
  max = LOGIN_RATE_LIMIT_MAX,
  windowMs = LOGIN_RATE_LIMIT_WINDOW_MS,
): void {
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);
  if (bucket.timestamps.length >= max) {
    throw new RateLimitedError();
  }
  bucket.timestamps.push(now);
}
