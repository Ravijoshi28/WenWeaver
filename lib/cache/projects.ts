import { redis } from "@/lib/rate-limiter/redis";

const PROJECT_LIST_TTL_SECONDS = 60 * 5;

export const projectListCacheKey = (userId: string) =>
  `projects:user:${userId}`;

/**
 * Cache failures must never prevent the project list from being served from
 * Postgres. This also makes temporary Upstash outages non-user-facing.
 */
export async function getCachedProjects<T>(userId: string): Promise<T | null> {
  try {
    return await redis.get<T>(projectListCacheKey(userId));
  } catch (error) {
    console.warn("Project-list cache read failed", error);
    return null;
  }
}

export async function cacheProjects<T>(userId: string, projects: T) {
  try {
    await redis.set(projectListCacheKey(userId), projects, {
      ex: PROJECT_LIST_TTL_SECONDS,
    });
  } catch (error) {
    console.warn("Project-list cache write failed", error);
  }
}

export async function invalidateProjectListCache(...userIds: string[]) {
  const keys = [...new Set(userIds.filter(Boolean))].map(projectListCacheKey);

  if (keys.length === 0) return;

  try {
    await redis.del(...keys);
  } catch (error) {
    console.warn("Project-list cache invalidation failed", error);
  }
}
