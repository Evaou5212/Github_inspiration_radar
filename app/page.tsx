import { ArchiveExplorerClient } from "@/components/archive-explorer-client";
import type { DashboardProject } from "@/components/project-card";
import { getAllProjects, getProjectFeed } from "@/lib/projects";

export const revalidate = 86400;

function mapCategory(value: string): "creative" | "aesthetic" | "tools" {
  if (value === "创意类") return "creative";
  if (value === "审美类") return "aesthetic";
  return "tools";
}

const CJK_REGEX = /[\u3400-\u9fff]/;

function toEnglishText(value: string, fallback: string) {
  const normalized = value.trim();
  if (!normalized) return fallback;
  if (CJK_REGEX.test(normalized)) return fallback;
  return normalized;
}

function toEnglishTag(tag: string) {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return null;
  if (CJK_REGEX.test(normalized)) return "multilingual";
  return normalized;
}

function formatEasternRadarSlotLabel(iso: string) {
  const reference = new Date(iso);
  const slots = new Set([0, 6, 12, 18]);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = new Date(reference.getTime());
  start.setUTCMinutes(0, 0, 0);
  for (let step = 0; step <= 30; step += 1) {
    const candidate = new Date(start.getTime() - step * 60 * 60 * 1000);
    const parts = formatter.formatToParts(candidate);
    const hour = Number(parts.find((item) => item.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((item) => item.type === "minute")?.value ?? "0");
    if (slots.has(hour) && minute === 0) return formatter.format(candidate);
  }
  return formatter.format(reference);
}

export default async function Home() {
  const [feed, projects] = await Promise.all([getProjectFeed(), getAllProjects()]);

  const updatedAtLabel = `${formatEasternRadarSlotLabel(feed.updatedAt)} ET`;

  const baseProjects: DashboardProject[] = projects.map((project) => ({
    id: project.id,
    slug: project.slug,
    name: toEnglishText(project.name, "Untitled project"),
    tagline: toEnglishText(project.tagline, "A focused project entry from the archive."),
    category: mapCategory(project.category),
    creatorName: toEnglishText(project.creatorName, "open source community"),
    sourceLabel: toEnglishText(project.source, "github"),
    sourceUrl: project.sourceUrl,
    projectUrl: project.projectUrl,
    previewImageUrl: project.previewImageUrl,
    stars: project.stars,
    forks: project.comments,
    hot: project.hotDeltaStars24h,
    hotScore: project.hotScore24h,
    discoveredHoursAgo: project.discoveredHoursAgo,
    whatItDoes: toEnglishText(
      project.whatItDoes,
      "This project delivers a focused feature set for digital creators and builders.",
    ),
    whyRecommended: toEnglishText(
      project.whyInteresting,
      "Recommended for practical value, clear scope, and strong inspiration potential.",
    ),
    tags: Array.from(
      new Set(
        [...project.inspirationTags, ...project.subcategories]
          .map((tag) => toEnglishTag(tag))
          .filter((tag): tag is string => Boolean(tag)),
      ),
    ),
    tasteScore: project.tasteScore,
    updatedAtLabel: project.publishedAt,
    hasCuratedPreview: project.previewImageSource === "readme" || project.previewImageSource === "website-snapshot",
  }));

  return <ArchiveExplorerClient baseProjects={baseProjects} updatedAtLabel={updatedAtLabel} />;
}
