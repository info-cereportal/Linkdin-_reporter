export const SERVER_NAME = "linkedin-neuro-draft-server";
export const SERVER_VERSION = "0.1.0";

export const POST_LENGTH = {
  short: { min: 200, max: 500 },
  medium: { min: 500, max: 1000 },
  long: { min: 1000, max: 1500 },
} as const;

export const RISK_THRESHOLDS = {
  low: 30,
  medium: 60,
  high: 80,
} as const;

export const LINKEDIN_FORMAT = {
  maxHashtags: 5,
  seeMoreThreshold: 210,
} as const;
