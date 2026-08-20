export type PlatformSpec = {
  id: string;
  label: string;
  formats: string[];
  dimensions: Array<{ width: number; height: number }>;
  maxCaptionChars?: number;
  requiresDuration?: boolean;
};

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    id: "instagram_feed",
    label: "Instagram feed",
    formats: ["1:1", "4:5"],
    dimensions: [
      { width: 1080, height: 1080 },
      { width: 1080, height: 1350 },
    ],
    maxCaptionChars: 2200,
  },
  {
    id: "instagram_story",
    label: "Instagram story",
    formats: ["9:16"],
    dimensions: [{ width: 1080, height: 1920 }],
    maxCaptionChars: 2200,
    requiresDuration: true,
  },
  {
    id: "tiktok",
    label: "TikTok",
    formats: ["9:16"],
    dimensions: [{ width: 1080, height: 1920 }],
    maxCaptionChars: 4000,
    requiresDuration: true,
  },
  {
    id: "meta_ad",
    label: "Meta ad",
    formats: ["1:1", "4:5", "9:16", "16:9"],
    dimensions: [
      { width: 1080, height: 1080 },
      { width: 1080, height: 1350 },
      { width: 1080, height: 1920 },
      { width: 1920, height: 1080 },
    ],
    maxCaptionChars: 125,
  },
  {
    id: "youtube_short",
    label: "YouTube Short",
    formats: ["9:16"],
    dimensions: [{ width: 1080, height: 1920 }],
    maxCaptionChars: 5000,
    requiresDuration: true,
  },
  {
    id: "youtube_video",
    label: "YouTube video",
    formats: ["16:9", "9:16"],
    dimensions: [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
    ],
    maxCaptionChars: 5000,
    requiresDuration: true,
  },
];

export function getPlatformSpec(id: string) {
  const aliases: Record<string, string> = {
    meta: "meta_ad",
    instagram: "instagram_feed",
    instagram_story: "instagram_story",
    tiktok_video: "tiktok",
    youtube: "youtube_video",
    youtube_short_video: "youtube_short",
  };
  return PLATFORM_SPECS.find((spec) => spec.id === (aliases[id] ?? id));
}

export function validatePlatformOutput(input: {
  platform: string;
  format?: string;
  width?: number | null;
  height?: number | null;
  caption?: string;
  durationMs?: number | null;
}) {
  const spec = getPlatformSpec(input.platform);
  if (!spec) return { valid: false, errors: [`Unsupported platform ${input.platform}.`] };
  const errors: string[] = [];
  if (input.format && !spec.formats.includes(input.format))
    errors.push(`${spec.label} does not support format ${input.format}.`);
  if (
    input.width &&
    input.height &&
    !spec.dimensions.some((size) => size.width === input.width && size.height === input.height)
  )
    errors.push(`${spec.label} does not accept ${input.width}×${input.height}.`);
  if (spec.maxCaptionChars && input.caption && input.caption.length > spec.maxCaptionChars)
    errors.push(`Caption exceeds ${spec.maxCaptionChars} characters.`);
  if (spec.requiresDuration && (!input.durationMs || input.durationMs <= 0))
    errors.push(`${spec.label} requires a valid duration.`);
  return { valid: errors.length === 0, errors };
}
