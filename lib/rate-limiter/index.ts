import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";
import { RATE_LIMITS } from "./config";

export const generalRateLimit =
  new Ratelimit({
    redis,

    limiter: Ratelimit.slidingWindow(
      RATE_LIMITS.general.requests,
      RATE_LIMITS.general.window
    ),

    analytics: true,
  });

export const authRateLimit =
  new Ratelimit({
    redis,

    limiter: Ratelimit.slidingWindow(
      RATE_LIMITS.auth.requests,
      RATE_LIMITS.auth.window
    ),

    analytics: true,
  });

export const saveRateLimit =
  new Ratelimit({
    redis,

    limiter: Ratelimit.slidingWindow(
      RATE_LIMITS.save.requests,
      RATE_LIMITS.save.window
    ),

    analytics: true,
  });

export const previewRateLimit =
  new Ratelimit({
    redis,

    limiter: Ratelimit.slidingWindow(
      RATE_LIMITS.preview.requests,
      RATE_LIMITS.preview.window
    ),

    analytics: true,
  });

export const createProjectRateLimit =
  new Ratelimit({
    redis,

    limiter: Ratelimit.slidingWindow(
      RATE_LIMITS.createProject.requests,
      RATE_LIMITS.createProject.window
    ),

    analytics: true,
  });