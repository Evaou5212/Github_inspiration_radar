"use client";

import { useEffect, useMemo, useState } from "react";
import { ProjectCard, type DashboardProject } from "@/components/project-card";

type CategoryKey = "all" | "creative" | "aesthetic" | "tools";
type SortMode = "hot" | "latest";
type TypeFilterKey = "all" | "experiments" | "tools" | "libraries" | "apps";
type MediumFilterKey = "all" | "web" | "3d" | "visual" | "audio" | "ai" | "physical";
type VibeFilterKey = "all" | "playful" | "experimental" | "beautiful" | "useful" | "weird";

type AnalyzeResponse = {
  name: string;
  owner: string;
  description: string;
  stars: number;
  forks: number;
  sourceUrl: string;
  projectUrl: string;
  previewImageUrl: string;
  updatedAt: string;
  suggestedCategory: "creative" | "aesthetic" | "tools";
  suggestedTags: string[];
  whatItDoes: string;
  whyRecommended: string;
};

const STORAGE_KEY = "inspiration_hunt_user_projects_v1";
const CJK_REGEX = /[\u3400-\u9fff]/;

function toEnglishTag(tag: string) {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return null;
  if (CJK_REGEX.test(normalized)) return "multilingual";
  return normalized;
}

function getTopTrendingTags(projects: DashboardProject[], limit = 5) {
  const counts = new Map<string, number>();
  for (const project of projects) {
    for (const raw of project.tags) {
      const tag = toEnglishTag(raw);
      if (!tag || tag === "all" || tag.length < 3) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function buildPieSegments(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return [];
  let cursor = 0;
  return values.map((value) => {
    const start = (cursor / total) * Math.PI * 2;
    cursor += value;
    const end = (cursor / total) * Math.PI * 2;
    const largeArc = end - start > Math.PI ? 1 : 0;
    const r = 42;
    const cx = 50;
    const cy = 50;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  });
}

function extractType(project: DashboardProject) {
  const bag = `${project.tagline} ${project.tags.join(" ")}`.toLowerCase();
  if (/\b(game|playground)\b/.test(bag)) return "game";
  if (/\b(library|sdk|framework)\b/.test(bag)) return "library";
  if (/\b(tool|editor|workflow|plugin)\b/.test(bag)) return "tool";
  if (/\b(website|landing|portfolio)\b/.test(bag)) return "website";
  if (/\b(app|desktop|mobile)\b/.test(bag)) return "app";
  return "experiment";
}

function extractTypeFilter(project: DashboardProject): Exclude<TypeFilterKey, "all"> {
  const type = extractType(project);
  if (type === "tool") return "tools";
  if (type === "library") return "libraries";
  if (type === "app") return "apps";
  return "experiments";
}

function extractMediumFilters(project: DashboardProject): Array<Exclude<MediumFilterKey, "all">> {
  const bag = `${project.tagline} ${project.tags.join(" ")}`.toLowerCase();
  const output: Array<Exclude<MediumFilterKey, "all">> = [];
  if (/\b(web|frontend|browser|react|next|site|website)\b/.test(bag)) output.push("web");
  if (/\b(3d|three|webgl|shader)\b/.test(bag)) output.push("3d");
  if (/\b(visual|image|design|ui|ux|aesthetic)\b/.test(bag)) output.push("visual");
  if (/\b(audio|music|sound)\b/.test(bag)) output.push("audio");
  if (/\b(ai|llm|gpt|diffusion|model)\b/.test(bag)) output.push("ai");
  if (/\b(physical|arduino|hardware|sensor|iot)\b/.test(bag)) output.push("physical");
  return output.length ? output : ["web"];
}

function extractVibeFilters(project: DashboardProject): Array<Exclude<VibeFilterKey, "all">> {
  const bag = `${project.tagline} ${project.whyRecommended} ${project.tags.join(" ")}`.toLowerCase();
  const output: Array<Exclude<VibeFilterKey, "all">> = [];
  if (/\b(playful|fun|toy|game)\b/.test(bag)) output.push("playful");
  if (/\b(experiment|experimental|prototype)\b/.test(bag)) output.push("experimental");
  if (/\b(beautiful|visual|aesthetic|style)\b/.test(bag)) output.push("beautiful");
  if (/\b(useful|workflow|tool|editor)\b/.test(bag)) output.push("useful");
  if (/\b(weird|surreal|strange|unexpected)\b/.test(bag)) output.push("weird");
  return output.length ? output : ["useful"];
}

function extractVibes(project: DashboardProject) {
  const bag = `${project.tagline} ${project.whyRecommended} ${project.tags.join(" ")}`.toLowerCase();
  const vibes: string[] = [];
  if (/\b(playful|fun|toy|game)\b/.test(bag)) vibes.push("playful");
  if (/\b(experiment|experimental|prototype)\b/.test(bag)) vibes.push("experimental");
  if (/\b(beautiful|visual|aesthetic|style)\b/.test(bag)) vibes.push("beautiful");
  if (/\b(weird|surreal|strange|unexpected)\b/.test(bag)) vibes.push("weird");
  if (/\b(useful|workflow|tool|editor)\b/.test(bag)) vibes.push("useful");
  if (/\b(interactive|3d|gesture|realtime)\b/.test(bag)) vibes.push("interactive");
  if (/\b(minimal|minimalist|clean)\b/.test(bag)) vibes.push("minimal");
  return vibes.slice(0, 2);
}

function similarityScore(seed: DashboardProject, candidate: DashboardProject) {
  if (seed.id === candidate.id) return -1;
  let score = 0;
  if (seed.category === candidate.category) score += 3;
  if (extractType(seed) === extractType(candidate)) score += 3;
  const seedTags = new Set(seed.tags.map((t) => toEnglishTag(t)).filter(Boolean));
  const candidateTags = new Set(candidate.tags.map((t) => toEnglishTag(t)).filter(Boolean));
  for (const tag of seedTags) {
    if (candidateTags.has(tag)) score += 2;
  }
  const seedVibes = extractVibes(seed);
  const candidateVibes = extractVibes(candidate);
  for (const vibe of seedVibes) {
    if (candidateVibes.includes(vibe)) score += 2;
  }
  return score;
}

function getNextEasternSlotLabel() {
  const slots = new Set([0, 6, 12, 18]);
  const now = new Date();
  const start = new Date(now.getTime());
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  for (let step = 0; step <= 48; step += 1) {
    const candidate = new Date(start.getTime() + step * 60 * 60 * 1000);
    const parts = formatter.formatToParts(candidate);
    const hour = Number(parts.find((item) => item.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((item) => item.type === "minute")?.value ?? "0");
    if (slots.has(hour) && minute === 0) {
      return formatter.format(candidate);
    }
  }

  return formatter.format(start);
}

export function ArchiveExplorerClient({
  baseProjects,
  updatedAtLabel,
}: {
  baseProjects: DashboardProject[];
  updatedAtLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("all");
  const [activeSort, setActiveSort] = useState<SortMode>("hot");
  const [activeTag, setActiveTag] = useState("all");
  const [activeTypeFilter, setActiveTypeFilter] = useState<TypeFilterKey>("all");
  const [activeMediumFilter, setActiveMediumFilter] = useState<MediumFilterKey>("all");
  const [activeVibeFilter, setActiveVibeFilter] = useState<VibeFilterKey>("all");
  const [userProjects, setUserProjects] = useState<DashboardProject[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as DashboardProject[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [manualTagInput, setManualTagInput] = useState("");
  const [manualCategory, setManualCategory] = useState<"auto" | "creative" | "aesthetic" | "tools">("auto");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [formError, setFormError] = useState("");
  const [submissionNote, setSubmissionNote] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const [relatedSeed, setRelatedSeed] = useState<DashboardProject | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(userProjects));
  }, [userProjects]);

  const allProjects = useMemo(() => [...userProjects, ...baseProjects], [baseProjects, userProjects]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    allProjects.forEach((project) => {
      project.tags.forEach((tag) => {
        const englishTag = toEnglishTag(tag);
        if (englishTag) tagSet.add(englishTag);
      });
    });
    return ["all", ...Array.from(tagSet).sort()];
  }, [allProjects]);

  const topTags = useMemo(() => getTopTrendingTags(allProjects, 5), [allProjects]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const list = allProjects
      .filter((project) => (activeCategory === "all" ? true : project.category === activeCategory))
      .filter((project) =>
        activeTag === "all"
          ? true
          : project.tags.map((t) => toEnglishTag(t)).filter(Boolean).includes(activeTag),
      )
      .filter((project) =>
        activeTypeFilter === "all" ? true : extractTypeFilter(project) === activeTypeFilter,
      )
      .filter((project) =>
        activeMediumFilter === "all" ? true : extractMediumFilters(project).includes(activeMediumFilter),
      )
      .filter((project) =>
        activeVibeFilter === "all" ? true : extractVibeFilters(project).includes(activeVibeFilter),
      )
      .filter((project) => {
        if (!normalizedQuery) return true;
        const fields = [
          project.name,
          project.tagline,
          project.creatorName,
          project.whatItDoes,
          project.whyRecommended,
          ...project.tags,
        ];
        return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
      });

    return list.sort((a, b) => {
      if (activeSort === "latest") {
        if (a.discoveredHoursAgo !== b.discoveredHoursAgo) return a.discoveredHoursAgo - b.discoveredHoursAgo;
        if (b.hot !== a.hot) return b.hot - a.hot;
        return b.stars - a.stars;
      }
      if (b.hot !== a.hot) return b.hot - a.hot;
      if (a.discoveredHoursAgo !== b.discoveredHoursAgo) return a.discoveredHoursAgo - b.discoveredHoursAgo;
      return b.stars - a.stars;
    });
  }, [allProjects, activeCategory, activeTag, activeTypeFilter, activeMediumFilter, activeVibeFilter, query, activeSort]);

  const stats = useMemo(() => {
    const visible = filteredProjects.length;
    const localCategoryCounts = {
      creative: filteredProjects.filter((item) => item.category === "creative").length,
      aesthetic: filteredProjects.filter((item) => item.category === "aesthetic").length,
      tools: filteredProjects.filter((item) => item.category === "tools").length,
    };
    const globalCategoryCounts = {
      creative: allProjects.filter((item) => item.category === "creative").length,
      aesthetic: allProjects.filter((item) => item.category === "aesthetic").length,
      tools: allProjects.filter((item) => item.category === "tools").length,
    };
    const yearCounts = filteredProjects.reduce<Record<string, number>>((acc, item) => {
      const yearMatch = item.updatedAtLabel.match(/(20\d{2})/);
      const year = yearMatch ? yearMatch[1] : "unknown";
      acc[year] = (acc[year] ?? 0) + 1;
      return acc;
    }, {});
    const archiveRows = Object.entries(yearCounts).sort((a, b) => b[0].localeCompare(a[0]));
    const recentRows = [...filteredProjects]
      .sort((a, b) => a.discoveredHoursAgo - b.discoveredHoursAgo)
      .slice(0, 5);
    const risingRows = [...allProjects]
      .filter((item) => item.hot > 0)
      .sort((a, b) => b.hot - a.hot)
      .slice(0, 5);
    const yearRange =
      archiveRows.length > 0
        ? `${archiveRows[archiveRows.length - 1][0]}-${archiveRows[0][0]}`
        : "unknown";

    const addedThisScan = allProjects.filter((item) => item.discoveredHoursAgo <= 6).length;

    return {
      visible,
      total: allProjects.length,
      localCategoryCounts,
      globalCategoryCounts,
      archiveRows,
      recentRows,
      risingRows,
      yearRange,
      addedThisScan,
    };
  }, [allProjects, filteredProjects]);

  const nextScanLabel = useMemo(() => getNextEasternSlotLabel(), []);

  const relatedProjects = useMemo(() => {
    if (!relatedSeed) return [];
    return [...allProjects]
      .map((candidate) => ({ candidate, score: similarityScore(relatedSeed, candidate) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.candidate);
  }, [allProjects, relatedSeed]);
  const piePaths = buildPieSegments([
    stats.globalCategoryCounts.creative,
    stats.globalCategoryCounts.aesthetic,
    stats.globalCategoryCounts.tools,
  ]);
  const pieColors = ["#111111", "#5f5f5f", "#a6a6a6"];

  async function handleAddProject() {
    setFormError("");
    if (!githubUrl.trim()) {
      setFormError("Please enter a GitHub repository URL.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUrl }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Analyze failed" }));
        throw new Error(err.error ?? "Analyze failed");
      }

      const analyzed = (await response.json()) as AnalyzeResponse;
      const customTags = manualTagInput
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .map((tag) => toEnglishTag(tag))
        .filter((tag): tag is string => Boolean(tag));
      const combinedTags = Array.from(new Set([...analyzed.suggestedTags, ...customTags]));
      const category = manualCategory === "auto" ? analyzed.suggestedCategory : manualCategory;

      const created = new Date(analyzed.updatedAt);
      const now = Date.now();
      const discoveredHoursAgo = Math.max(0, Math.round((now - created.getTime()) / (1000 * 60 * 60)));
      const updatedLabel = created.toLocaleDateString("en-US");

      const project: DashboardProject = {
        id: `user-${Date.now()}`,
        slug: `${analyzed.owner}-${analyzed.name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        name: analyzed.name || "Untitled project",
        tagline:
          analyzed.description || "Repository description is unavailable in English; archive summary provided.",
        category,
        creatorName: analyzed.owner || "open source community",
        sourceLabel: "github",
        sourceUrl: analyzed.sourceUrl,
        projectUrl: analyzed.projectUrl,
        previewImageUrl: analyzed.previewImageUrl,
        stars: analyzed.stars,
        forks: analyzed.forks,
        hot: Math.max(1, Math.round(analyzed.stars / 300)),
        discoveredHoursAgo,
        whatItDoes: analyzed.whatItDoes,
        whyRecommended: analyzed.whyRecommended,
        tags: combinedTags.length ? combinedTags : ["project"],
        tasteScore: 6 + Math.min(3, combinedTags.length * 0.3),
        updatedAtLabel: updatedLabel,
        userSubmitted: true,
        hasCuratedPreview: false,
      };

      const qualitySignal =
        project.stars >= 10 ||
        project.hot >= 2 ||
        project.tags.some((tag) => ["ai", "creative coding", "interactive demo", "design"].includes(tag));
      if (qualitySignal) {
        setUserProjects((prev) => [project, ...prev]);
        setSubmissionNote("Submitted and accepted into the local radar candidate pool.");
      } else {
        setSubmissionNote("Submitted for review. It may appear after quality filters.");
      }
      setGithubUrl("");
      setManualTagInput("");
      setManualCategory("auto");
      setShowAddForm(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Add project failed");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="paper rule-l rule-r rule-b">
      <section className="rule-b px-2 py-2 md:px-2 md:py-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="utility text-muted">project index</p>
            <h1 className="title-xl mt-1">Inspiration Radar</h1>
            <p className="mt-1 max-w-3xl text-[20px] leading-[1.4] tracking-normal text-foreground">
              Feed refreshes every 6 hours · last updated {updatedAtLabel}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="utility border border-rule px-2 py-1 text-foreground hover:bg-black hover:text-white"
          >
            + share a find
          </button>
        </div>
      </section>

      <section className="rule-b px-2 py-2 md:px-3">
        <div className="flex items-center justify-between gap-2">
          <label className="utility block text-muted">search the archive</label>
          <button
            type="button"
            onClick={() => {
              if (!filteredProjects.length) return;
              const candidatePool = filteredProjects.filter((item) => item.stars >= 20 || item.hot > 0);
              const pool = candidatePool.length ? candidatePool : filteredProjects;
              const random = pool[Math.floor(Math.random() * pool.length)];
              if (random) {
                setRelatedSeed(random);
                setQuery(random.name);
              }
            }}
            className="utility border border-rule px-1.5 py-0.5 text-foreground hover:bg-black hover:text-white"
          >
            ↝ surprise me
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Project name, creator, medium, technology…"
          className="mt-1 h-12 w-full border border-rule bg-[#e2dfd6] px-2 text-[24px] leading-[1.32] tracking-normal outline-none"
        />
        <div className="mb-1 mt-2 flex flex-wrap items-center gap-1.5">
          {(showAllTags
            ? allTags.slice(0, 28)
            : ["all", ...topTags.map((item) => item.tag)].filter((value, idx, arr) => arr.indexOf(value) === idx)
          ).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={`utility border px-1.5 py-0.5 ${
                activeTag === tag
                  ? "border-rule bg-black text-white"
                  : "border-rule bg-[#ece9df] text-muted hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
          {!showAllTags && allTags.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllTags(true)}
              className="utility border border-rule px-1.5 py-0.5 text-muted hover:text-foreground"
            >
              + more
            </button>
          )}
          {(query || activeTag !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveTag("all");
                setRelatedSeed(null);
              }}
              className="utility border border-rule px-1.5 py-0.5 text-muted"
            >
              clear
            </button>
          )}
        </div>
        {relatedSeed && relatedProjects.length > 0 ? (
          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">more like this · based on {relatedSeed.name}</p>
            <div className="mt-1 grid gap-1 md:grid-cols-2">
              {relatedProjects.slice(0, 4).map((item) => (
                <button
                  key={`related-${item.id}`}
                  type="button"
                  onClick={() => {
                    setActiveCategory("all");
                    setActiveTag("all");
                    setQuery(item.name);
                  }}
                  className="utility flex items-center justify-between border border-rule px-1.5 py-1 text-left text-muted hover:bg-black hover:text-white"
                >
                  <span className="truncate pr-2">{item.name}</span>
                  <span>↑{item.hot}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid md:h-[calc(100vh-250px)] md:grid-cols-[210px_minmax(0,1fr)_250px]">
        <aside className="rule-r p-2 md:sticky md:top-0 md:h-[calc(100vh-250px)] md:overflow-y-auto">
          <p className="utility text-muted">filter</p>
          <div className="mt-1 space-y-1 utility">
            {(["all", "creative", "aesthetic", "tools"] as CategoryKey[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActiveCategory(item)}
                className={`flex w-full items-center justify-between border px-1.5 py-1 ${
                  activeCategory === item
                    ? "border-rule bg-black text-white"
                    : "border-rule text-muted hover:text-foreground"
                }`}
              >
                <span>{item}</span>
                <span>
                  {item === "all"
                    ? stats.total
                    : item === "creative"
                      ? stats.globalCategoryCounts.creative
                      : item === "aesthetic"
                        ? stats.globalCategoryCounts.aesthetic
                        : stats.globalCategoryCounts.tools}
                </span>
              </button>
            ))}
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">sort</p>
            <div className="mt-1 space-y-1 utility">
              <button
                type="button"
                onClick={() => setActiveSort("hot")}
                className={`block w-full border px-1.5 py-1 text-left ${
                  activeSort === "hot"
                    ? "border-rule bg-black text-white"
                    : "border-rule text-muted hover:text-foreground"
                }`}
              >
                heat ↓
              </button>
              <button
                type="button"
                onClick={() => setActiveSort("latest")}
                className={`block w-full border px-1.5 py-1 text-left ${
                  activeSort === "latest"
                    ? "border-rule bg-black text-white"
                    : "border-rule text-muted hover:text-foreground"
                }`}
              >
                latest ↓
              </button>
            </div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">type</p>
            <div className="mt-1 space-y-1 utility">
              {(
                [
                  ["all", "all"],
                  ["experiments", "experiments"],
                  ["tools", "tools"],
                  ["libraries", "libraries"],
                  ["apps", "apps"],
                ] as Array<[TypeFilterKey, string]>
              ).map(([key, label]) => (
                <button
                  key={`type-${key}`}
                  type="button"
                  onClick={() => setActiveTypeFilter(key)}
                  className={`block w-full border px-1.5 py-1 text-left ${
                    activeTypeFilter === key
                      ? "border-rule bg-black text-white"
                      : "border-rule text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">medium</p>
            <div className="mt-1 space-y-1 utility">
              {(
                [
                  ["all", "all"],
                  ["web", "web"],
                  ["3d", "3d"],
                  ["visual", "visual"],
                  ["audio", "audio"],
                  ["ai", "ai"],
                  ["physical", "physical"],
                ] as Array<[MediumFilterKey, string]>
              ).map(([key, label]) => (
                <button
                  key={`medium-${key}`}
                  type="button"
                  onClick={() => setActiveMediumFilter(key)}
                  className={`block w-full border px-1.5 py-1 text-left ${
                    activeMediumFilter === key
                      ? "border-rule bg-black text-white"
                      : "border-rule text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">vibe</p>
            <div className="mt-1 space-y-1 utility">
              {(
                [
                  ["all", "all"],
                  ["playful", "playful"],
                  ["experimental", "experimental"],
                  ["beautiful", "beautiful"],
                  ["useful", "useful"],
                  ["weird", "weird"],
                ] as Array<[VibeFilterKey, string]>
              ).map(([key, label]) => (
                <button
                  key={`vibe-${key}`}
                  type="button"
                  onClick={() => setActiveVibeFilter(key)}
                  className={`block w-full border px-1.5 py-1 text-left ${
                    activeVibeFilter === key
                      ? "border-rule bg-black text-white"
                      : "border-rule text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 md:h-[calc(100vh-250px)] md:overflow-y-auto">
          <div className="rule-b px-2 py-1 utility text-muted">
            {stats.visible} results · updated {updatedAtLabel}
          </div>
          {filteredProjects.length ? (
            <div className="grid md:grid-cols-3">
              {filteredProjects.map((project, index) => (
                <ProjectCard
                  key={`${project.id}-${project.slug}-${index}`}
                  project={project}
                  index={index + 1}
                  isRightColumn={index % 3 === 2}
                  onMoreLikeThis={(seed) => {
                    setRelatedSeed(seed);
                    setQuery(seed.name);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="px-2 py-8 text-center text-muted">No matching results.</div>
          )}
        </section>

        <aside className="rule-l p-2 md:sticky md:top-0 md:h-[calc(100vh-250px)] md:overflow-y-auto">
          <p className="utility text-muted">radar</p>
          <div className="mt-1 meta text-muted">
            <p>{stats.total} projects indexed</p>
            <p>+{stats.addedThisScan} this update</p>
            <p>last scan {updatedAtLabel}</p>
            <p>next scan {nextScanLabel} ET</p>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">distribution</p>
            <div className="mt-1 border border-rule bg-[#ece9df] p-1">
              <svg viewBox="0 0 100 100" className="aspect-square w-full">
                {piePaths.map((path, idx) => (
                  <path key={path} d={path} fill={pieColors[idx] ?? "#aaa"} />
                ))}
              </svg>
            </div>
            <div className="mt-1 space-y-1 meta text-muted">
              <p className="flex items-center justify-between"><span>creative</span><span>{stats.globalCategoryCounts.creative}</span></p>
              <p className="flex items-center justify-between"><span>aesthetic</span><span>{stats.globalCategoryCounts.aesthetic}</span></p>
              <p className="flex items-center justify-between"><span>tools</span><span>{stats.globalCategoryCounts.tools}</span></p>
            </div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">archive</p>
            <div className="mt-1 space-y-1 meta text-muted">
              {stats.archiveRows.length ? (
                stats.archiveRows.map(([year, count]) => (
                  <p key={year} className="flex items-center justify-between">
                    <span>{year}</span>
                    <span>{count}</span>
                  </p>
                ))
              ) : (
                <p>unknown</p>
              )}
            </div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">trending tags</p>
            <div className="mt-1 space-y-1 meta text-muted">
              {topTags.map((item) => (
                <p key={item.tag} className="flex items-center justify-between">
                  <span>#{item.tag}</span>
                  <span>{item.count}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">rising</p>
            <div className="mt-1 space-y-1 meta text-muted">
              {stats.risingRows.map((item, idx) => (
                <p key={`recent-${item.id}`}>
                  {String(idx + 1).padStart(2, "0")} {item.name.slice(0, 11)} ↑{item.hot}
                </p>
              ))}
            </div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">year range</p>
            <div className="mt-1 meta text-muted">{stats.yearRange}</div>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">recent updates</p>
            <div className="mt-1 space-y-1 meta text-muted">
              {stats.recentRows.map((item) => (
                <p key={`fresh-${item.id}`}>◷ {item.discoveredHoursAgo}h {item.name.slice(0, 11)}</p>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {showAddForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => {
            if (!isAnalyzing) setShowAddForm(false);
          }}
        >
          <div
            className="w-full max-w-xl border border-rule bg-[#f1f0ea] p-4 md:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="utility text-muted">found something worth sharing?</p>
            <div className="mt-3 space-y-3">
              <input
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                placeholder="https://github.com/owner/repo"
                className="h-10 w-full border border-rule bg-[#ece9df] px-2 text-[15px] outline-none"
              />
              <select
                value={manualCategory}
                onChange={(event) => setManualCategory(event.target.value as "auto" | "creative" | "aesthetic" | "tools")}
                className="h-10 w-full border border-rule bg-[#ece9df] px-2 text-[15px] outline-none"
              >
                <option value="auto">category: auto</option>
                <option value="creative">category: creative</option>
                <option value="aesthetic">category: aesthetic</option>
                <option value="tools">category: tools</option>
              </select>
              <input
                value={manualTagInput}
                onChange={(event) => setManualTagInput(event.target.value)}
                placeholder="tags: interactive, ai, generative"
                className="h-10 w-full border border-rule bg-[#ece9df] px-2 text-[15px] outline-none"
              />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddProject}
                disabled={isAnalyzing}
                className="utility border border-rule bg-black px-2 py-1 text-white disabled:opacity-60"
              >
                {isAnalyzing ? "analyzing..." : "submit to radar"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={isAnalyzing}
                className="utility border border-rule px-2 py-1 text-foreground"
              >
                cancel
              </button>
            </div>
            {submissionNote ? <p className="meta mt-2 text-muted">{submissionNote}</p> : null}
            {formError ? <p className="meta mt-2 text-red-700">{formError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
