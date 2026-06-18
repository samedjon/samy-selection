import "server-only";

type Attempt = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Attempt>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, attempt] of store) {
    if (now > attempt.resetAt) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(key: string, maxAttempts = 3, windowMs = 15 * 60_000): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  cleanup();
  const now = Date.now();
  const attempt = store.get(key);

  if (!attempt || now > attempt.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetAt: now + windowMs };
  }

  attempt.count += 1;
  const allowed = attempt.count <= maxAttempts;
  return {
    allowed,
    remaining: Math.max(0, maxAttempts - attempt.count),
    resetAt: attempt.resetAt
  };
}
