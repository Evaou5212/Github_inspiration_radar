"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type DashboardProject = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: "creative" | "aesthetic" | "tools";
  creatorName: string;
  sourceLabel: string;
  sourceUrl: string;
  projectUrl: string;
  previewImageUrl: string;
  stars: number;
  forks: number;
  hot: number;
  discoveredHoursAgo: number;
  whatItDoes: string;
  whyRecommended: string;
  tags: string[];
  tasteScore: number;
  updatedAtLabel: string;
  userSubmitted?: boolean;
  hasCuratedPreview?: boolean;
};

type ProjectCardProps = {
  project: DashboardProject;
  index?: number;
  isRightColumn?: boolean;
  onMoreLikeThis?: (project: DashboardProject) => void;
};

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getCategoryToken(category: DashboardProject["category"]) {
  if (category === "creative") return "CREATIVE";
  if (category === "aesthetic") return "AESTHETIC";
  return "TOOLS";
}

function buildTemplateThumbnail(project: DashboardProject) {
  const title = escapeSvgText(project.name || "Untitled");
  const category = getCategoryToken(project.category);
  const creator = escapeSvgText((project.creatorName || "Unknown creator").toUpperCase());
  const monogram = escapeSvgText(
    (project.name || "PR")
      .split(/[\s-_]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PR",
  );

  const accent = category === "CREATIVE" ? "#8d5f35" : category === "AESTHETIC" ? "#4f6f7c" : "#6a6a6a";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
  <defs>
    <filter id="paperGrain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.84" numOctaves="2" seed="19" stitchTiles="stitch"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.1"/>
      </feComponentTransfer>
    </filter>
    <pattern id="dotField" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
      <circle cx="1.4" cy="1.4" r="0.8" fill="${accent}" opacity="0.2"/>
    </pattern>
    <linearGradient id="stamp" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#d8c9af" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="960" height="600" fill="#ece7dc"/>
  <rect x="16" y="16" width="928" height="568" fill="#efe9dd" stroke="#8f897b" stroke-width="2"/>
  <rect x="16" y="16" width="928" height="568" fill="url(#dotField)" opacity="0.36"/>
  <rect x="36" y="44" width="888" height="80" fill="none" stroke="#8f897b" stroke-width="2"/>
  <rect x="36" y="124" width="250" height="324" fill="none" stroke="#8f897b" stroke-width="2"/>
  <rect x="286" y="124" width="638" height="324" fill="none" stroke="#8f897b" stroke-width="2"/>
  <rect x="36" y="448" width="888" height="112" fill="none" stroke="#8f897b" stroke-width="2"/>
  <text x="58" y="93" fill="#4a453d" font-family="'Courier New', monospace" font-size="29" letter-spacing="2">${category}</text>
  <rect x="64" y="164" width="162" height="162" rx="9" fill="url(#stamp)" stroke="#7f786a" stroke-width="1.5"/>
  <circle cx="145" cy="224" r="52" fill="#f2eee6" opacity="0.9"/>
  <text x="100" y="246" fill="#2a2927" font-family="'Courier New', monospace" font-size="74" font-weight="700">${monogram.slice(0, 1)}</text>
  <text x="62" y="370" fill="#5b564d" font-family="'Courier New', monospace" font-size="21" letter-spacing="1">${creator}</text>
  <foreignObject x="312" y="162" width="586" height="264">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:'Courier New', monospace;color:#232323;font-weight:700;font-size:52px;line-height:1.04;letter-spacing:-0.01em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
      ${title}
    </div>
  </foreignObject>
  <text x="58" y="528" fill="#4a453d" font-family="'Courier New', monospace" font-size="24" letter-spacing="1.5">INSPIRATION RADAR ARCHIVE</text>
  <rect width="960" height="600" fill="#000" filter="url(#paperGrain)" opacity="0.14"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function isSuspiciousPreviewUrl(url: string) {
  const normalized = url.toLowerCase();
  const nonPreviewSignals = [
    "badge",
    "badges",
    "shield",
    "shields.io",
    "status",
    "build",
    "coverage",
    "license",
    "version",
    "stars",
    "forks",
    "npm",
    "pypi",
    "ci",
    "workflow",
    "logo",
    "icon",
    "favicon",
    "avatar",
    "emoji",
    "sticker",
    "button",
    "wcag",
    "windows-10-11",
    "windows10-11",
    "win10-11",
    "release-v",
    "release_v",
  ];

  if (nonPreviewSignals.some((signal) => normalized.includes(signal))) {
    return true;
  }

  if (normalized.endsWith(".svg")) return true;
  return false;
}

function isModernGithubPreview(url: string) {
  const normalized = url.toLowerCase();
  // GitHub social/og style cards often look like modern dashboard thumbnails
  return (
    normalized.includes("opengraph.githubassets.com") ||
    normalized.includes("repository-images.githubusercontent.com") ||
    normalized.includes("github-readme-stats") ||
    normalized.includes("capsule-render.vercel.app")
  );
}

function pickTypeLabel(project: DashboardProject) {
  const bag = `${project.tagline} ${project.tags.join(" ")}`.toLowerCase();
  if (/\b(game|playground)\b/.test(bag)) return "Game";
  if (/\b(library|sdk|framework)\b/.test(bag)) return "Library";
  if (/\b(tool|editor|plugin|workflow)\b/.test(bag)) return "Tool";
  if (/\b(website|landing|portfolio)\b/.test(bag)) return "Website";
  if (/\b(app|desktop|mobile)\b/.test(bag)) return "App";
  return "Experiment";
}

function pickMediumTokens(project: DashboardProject) {
  const bag = `${project.tagline} ${project.tags.join(" ")}`.toLowerCase();
  const candidates: Array<[string, RegExp]> = [
    ["AI", /\b(ai|llm|gpt|diffusion|model)\b/],
    ["Web", /\b(web|frontend|browser|react|next|site)\b/],
    ["3D", /\b(3d|three|webgl|shader)\b/],
    ["Visual", /\b(visual|image|design|ui|ux|aesthetic)\b/],
    ["Audio", /\b(audio|music|sound)\b/],
    ["Generative", /\b(generative|procedural)\b/],
    ["Creative Coding", /\b(creative coding|creative|canvas|p5)\b/],
  ];
  const tokens = candidates.filter(([, rule]) => rule.test(bag)).map(([label]) => label);
  return tokens.slice(0, 3);
}

function pickVibeTokens(project: DashboardProject) {
  const bag = `${project.tagline} ${project.whyRecommended} ${project.tags.join(" ")}`.toLowerCase();
  const vibes: Array<[string, RegExp]> = [
    ["Playful", /\b(playful|fun|toy|game)\b/],
    ["Experimental", /\b(experimental|experiment|prototype)\b/],
    ["Beautiful", /\b(beautiful|aesthetic|visual|stylish)\b/],
    ["Weird", /\b(weird|surreal|strange|unexpected)\b/],
    ["Useful", /\b(useful|workflow|tool|productivity|editor)\b/],
    ["Interactive", /\b(interactive|realtime|gesture|3d)\b/],
    ["Minimal", /\b(minimal|minimalist|clean)\b/],
  ];
  const tokens = vibes.filter(([, rule]) => rule.test(bag)).map(([label]) => label);
  return tokens.slice(0, 2);
}

function buildEditorialWhy(project: DashboardProject) {
  const base = project.whyRecommended.trim();
  const compact = base
    .replace(/This project provides a focused implementation[^.]*\./gi, "")
    .replace(/Builds a lightweight but complete[^.]*\./gi, "")
    .replace(/Recommended[^.]*inspiration value[^.]*\./gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (compact.split(" ").length >= 12) {
    return compact.split(" ").slice(0, 38).join(" ");
  }
  const mediums = pickMediumTokens(project).join(", ") || "creative workflows";
  return `Interesting for how it turns ${mediums} into a compact hands-on artifact that can be studied as a concrete reference for interaction, composition, or implementation choices.`;
}

function buildIdeaToSteal(project: DashboardProject) {
  const bag = `${project.tagline} ${project.tags.join(" ")}`.toLowerCase();
  if (/\b(editor|image|photo)\b/.test(bag)) {
    return "Embed advanced effects directly inside a familiar editor so experimentation happens in context, not in a separate AI playground.";
  }
  if (/\b(three|3d|webgl|shader)\b/.test(bag)) {
    return "Use spatial interaction as the primary navigation layer so users understand complex states through movement, not just panels.";
  }
  if (/\b(theme|custom|style)\b/.test(bag)) {
    return "Turn visual customization into the core interaction loop instead of hiding it inside settings menus.";
  }
  if (/\b(workflow|automation|tool)\b/.test(bag)) {
    return "Package a complex workflow into one narrow, repeatable operation that users can run immediately and adapt later.";
  }
  return "Extract one distinctive interaction pattern and frame it as a reusable module that can be transplanted into other creative products.";
}

function buildMomentumLabel(project: DashboardProject) {
  if (project.hot > 0) return `↑ +${project.hot} stars / 24h`;
  if (project.discoveredHoursAgo <= 24) return "FRESH THIS DAY";
  if (project.discoveredHoursAgo <= 72) return "ACTIVE THIS WEEK";
  return "STABLE ARCHIVE";
}

export function ProjectCard({ project, index, isRightColumn = false, onMoreLikeThis }: ProjectCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const categoryLabel = project.category;
  const creatorLabel = project.creatorName.toLowerCase();
  const repoLabel = project.sourceLabel.toLowerCase();
  const templateThumbnail = buildTemplateThumbnail(project);
  const shouldForceTemplateForModernPreview = isModernGithubPreview(project.previewImageUrl);
  const useTemplateThumbnail =
    imageFailed ||
    (!project.hasCuratedPreview &&
      (isSuspiciousPreviewUrl(project.previewImageUrl) || shouldForceTemplateForModernPreview));

  useEffect(() => {
    setImageFailed(false);
  }, [project.id, project.previewImageUrl]);

  const typeLabel = pickTypeLabel(project);
  const mediumTokens = pickMediumTokens(project);
  const vibeTokens = pickVibeTokens(project);
  const momentumLabel = buildMomentumLabel(project);
  const whyEditorial = buildEditorialWhy(project);
  const ideaToSteal = buildIdeaToSteal(project);
  const demoLabel = project.projectUrl !== project.sourceUrl ? "↗ live demo" : "↗ project";
  const frontBlackButtonClass =
    "inline-flex items-center border border-rule bg-black px-1.5 py-0.5 !text-[#fffdf8] hover:opacity-90 group-hover:border-white group-hover:bg-black group-hover:!text-[#fffefb]";
  const backBlackButtonClass =
    "inline-flex items-center border border-rule bg-black px-1.5 py-0.5 !text-[#fffdf8] hover:opacity-90";

  return (
    <article
      onClick={() => setFlipped((prev) => !prev)}
      className={`group cursor-pointer light-rule-b p-2 transition duration-150 hover:bg-black hover:text-white md:p-2.5 ${
        isRightColumn ? "" : "md:border-r md:border-light-rule"
      }`}
    >
      <div className={`flip-card ${flipped ? "is-flipped" : ""}`}>
        <div className="flip-card-inner">
          <div className="flip-card-face flip-card-front pb-2">
            <div className="flex h-full flex-col">
              <div className="utility text-muted group-hover:text-white">
                {(index ?? 0).toString().padStart(3, "0")} / {categoryLabel}
                {project.userSubmitted ? " / user" : ""}
              </div>
              <div className="mt-1 border border-rule bg-[#ecebe5] p-1">
                {/* Use raw img because preview hosts are user-generated and highly dynamic. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={useTemplateThumbnail ? templateThumbnail : project.previewImageUrl}
                  alt={`${project.name} preview`}
                  loading="lazy"
                  className={`aspect-[16/10] w-full bg-[#efeee8] object-contain object-center text-transparent transition duration-100 ${
                    useTemplateThumbnail
                      ? "grayscale-0 contrast-100"
                      : "grayscale contrast-[0.9] group-hover:grayscale-0 group-hover:contrast-100"
                  }`}
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                />
              </div>
              <div className="mt-1 utility flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted group-hover:text-white">
                <span className="label-tag group-hover:border-white">{creatorLabel}</span>
                <span>{repoLabel}</span>
              </div>
              <h3 className="mt-0.5 line-clamp-2 text-[31px] font-bold leading-[0.96] tracking-[-0.02em] text-foreground group-hover:text-white">
                {project.name}
              </h3>
              <p className="mt-0.5 line-clamp-2 text-[18px] leading-[1.36] tracking-normal text-muted group-hover:text-white">
                {project.tagline}
              </p>
              <div className="mt-2 meta flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted group-hover:text-white">
                <span>{typeLabel}</span>
                <span>★ {project.stars}</span>
                <span>yr {project.updatedAtLabel.match(/20\d{2}/)?.[0] ?? "unknown"}</span>
                <span>◷ {project.discoveredHoursAgo}h</span>
                <span>{momentumLabel}</span>
              </div>
              <div className="mt-1 meta flex flex-wrap items-center gap-1 text-muted group-hover:text-white">
                {mediumTokens.map((item) => (
                  <span key={item} className="archive-tag">
                    {item}
                  </span>
                ))}
                {vibeTokens.map((item) => (
                  <span key={item} className="archive-tag">
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-auto mb-2 pt-2 utility flex flex-wrap items-center gap-2 text-muted group-hover:text-white">
                <Link
                  href={project.sourceUrl}
                  target="_blank"
                  onClick={(event) => event.stopPropagation()}
                  className={frontBlackButtonClass}
                >
                  ↗ github
                </Link>
                <Link
                  href={project.projectUrl}
                  target="_blank"
                  onClick={(event) => event.stopPropagation()}
                  className={frontBlackButtonClass}
                >
                  {demoLabel}
                </Link>
              </div>
            </div>
          </div>

          <div className="flip-card-face flip-card-back border border-rule bg-[#ece9df] p-2 pb-3 text-foreground">
            <div className="flex h-full flex-col">
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="w-full max-w-[92%] text-left">
                  <p className="utility text-center text-muted">why it&apos;s interesting</p>
                  <div className="mt-2 space-y-2.5 font-mono text-[18px] leading-[1.34] tracking-normal">
                  <p className="line-clamp-4">
                  {whyEditorial}
                  </p>
                  <div className="rule-t pt-2">
                    <p className="utility text-center text-muted">idea to steal</p>
                    <p className="mt-1 line-clamp-3">{ideaToSteal}</p>
                  </div>
                </div>
                  <div className="mt-3 meta grid grid-cols-2 gap-x-2 gap-y-1 text-left text-muted">
                    <span>{project.discoveredHoursAgo <= 24 ? "fresh" : "indexed"}</span>
                    <span>updated {project.updatedAtLabel}</span>
                    <span>stars {project.stars}</span>
                    <span>{momentumLabel}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...mediumTokens, ...vibeTokens].slice(0, 4).map((tag) => (
                      <span key={tag} className="archive-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-auto pb-1 pt-2 utility flex flex-wrap items-center gap-2 text-muted">
                <Link
                  href={project.sourceUrl}
                  target="_blank"
                  onClick={(event) => event.stopPropagation()}
                  className={backBlackButtonClass}
                >
                  ↗ github
                </Link>
                <Link
                  href={project.projectUrl}
                  target="_blank"
                  onClick={(event) => event.stopPropagation()}
                  className={backBlackButtonClass}
                >
                  {demoLabel}
                </Link>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoreLikeThis?.(project);
                  }}
                  className={backBlackButtonClass}
                >
                  → more like this
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
