/**
 * Socket.IO Rate Limiter
 * Prevents clients from spamming messages
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class SocketRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();

  private readonly maxRequests: number;

  private readonly windowMs: number;

  private cleanupIntervalId: NodeJS.Timeout | null = null;

  /**
   * Create a new rate limiter
   * @param maxRequests - Maximum number of requests allowed in the time window
   * @param windowMs - Time window in milliseconds
   */
  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Clean up expired entries every minute
    this.cleanupIntervalId = setInterval(() => this.cleanup(), 60000);
    // Prevent the interval from keeping the process alive during shutdown
    if (this.cleanupIntervalId.unref) {
      this.cleanupIntervalId.unref();
    }
  }

  /**
   * Check if a socket has exceeded the rate limit
   * @param socketId - The socket ID to check
   * @returns true if rate limit exceeded, false otherwise
   */
  isRateLimited(socketId: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(socketId);

    if (!entry || now > entry.resetTime) {
      // No entry or expired - create new entry
      this.limits.set(socketId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return false;
    }

    // Increment count
    entry.count += 1;

    // Check if limit exceeded
    return entry.count > this.maxRequests;
  }

  /**
   * Get remaining requests for a socket
   * @param socketId - The socket ID to check
   * @returns Number of remaining requests
   */
  getRemaining(socketId: string): number {
    const entry = this.limits.get(socketId);
    if (!entry || Date.now() > entry.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - entry.count);
  }

  /**
   * Get time until reset for a socket
   * @param socketId - The socket ID to check
   * @returns Milliseconds until reset
   */
  getResetTime(socketId: string): number {
    const entry = this.limits.get(socketId);
    if (!entry || Date.now() > entry.resetTime) {
      return 0;
    }
    return entry.resetTime - Date.now();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [socketId, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(socketId);
      }
    }
  }

  /**
   * Reset rate limit for a specific socket
   * @param socketId - The socket ID to reset
   */
  reset(socketId: string): void {
    this.limits.delete(socketId);
  }

  /**
   * Clear all rate limits
   */
  clear(): void {
    this.limits.clear();
  }

  /**
   * Destroy the rate limiter and clean up resources
   * Call this during graceful shutdown to prevent memory leaks
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.limits.clear();
  }
}

// Create rate limiters for different event types
export const messageRateLimiter = new SocketRateLimiter(10, 60000); // 10 messages per minute
export const joinRateLimiter = new SocketRateLimiter(5, 60000); // 5 joins per minute

/**
 * Cleanup function to be called during graceful shutdown
 */
export function destroyRateLimiters(): void {
  messageRateLimiter.destroy();
  joinRateLimiter.destroy();
}
