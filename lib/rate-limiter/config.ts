export const RATE_LIMITS = {
  general: {
    requests: 10,
    window: "1 m",
  },

  auth: {
    requests: 10,
    window: "1 m",
  },

  save: {
    requests: 10,
    window: "1 m",
  },

  preview: {
    requests: 5,
    window: "1 m",
  },

  createProject: {
    requests: 5,
    window: "1 h",
  },
} as const;