// Kept behind a separate module so edge builds can retain their in-memory fallback.
export { readCache, writeCache } from '../../server/redis-cache';
