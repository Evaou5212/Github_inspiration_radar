import { unstable_cache } from "next/cache";

export const FEED_REVALIDATE_SECONDS = 6 * 60 * 60;
const STRICT_WINDOW_DAYS = 7;
const EXTENDED_WINDOW_DAYS = 365;
const MAX_AGE_HOURS = 24 * 180;
const STRICT_MAX_AGE_HOURS = 24 * STRICT_WINDOW_DAYS;
const HOT_WINDOW_HOURS = 6;
const HOT_FALLBACK_WINDOW_HOURS = 24;
const HOTTEST_WINDOW_HOURS = 24;
const HOT_EXTENDED_WINDOW_HOURS = 24 * 3;
const HOT_MAX_WINDOW_HOURS = 24 * 7;
const HOT_DEEP_WINDOW_HOURS = 24 * 30;
const MIN_STARS = 0;
const MAX_PROJECTS = 2500;
const SEARCH_SORTS: Array<"updated" | "stars"> = ["stars", "updated"];
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const HAS_GITHUB_TOKEN = Boolean(GITHUB_TOKEN);
const SEARCH_PAGES = HAS_GITHUB_TOKEN ? 4 : 1;
const WINDOW_STEP_DAYS = HAS_GITHUB_TOKEN ? 1 : 2;
const MAX_SEARCH_REQUESTS = HAS_GITHUB_TOKEN ? 420 : 28;
const SEARCH_BATCH_SIZE = HAS_GITHUB_TOKEN ? 12 : 4;
const TARGET_FETCHED_CANDIDATES = HAS_GITHUB_TOKEN ? 3600 : 1200;
const WINDOW_SEARCH_PAGES = HAS_GITHUB_TOKEN ? 4 : 2;
const WINDOW_SEARCH_MAX_REQUESTS = HAS_GITHUB_TOKEN ? 320 : 80;
const MIN_DESCRIPTION_LENGTH = 10;
const MIN_INSPIRATION_STARS = 0;
const DISPLAY_MIN_STARS = 0;
const MAX_INDIE_STARS = 9000;
const CATEGORY_MIN_STARS: Record<ProjectCategory, number> = {
  创意类: 0,
  审美类: 0,
  工具类: 0,
};
const CATEGORY_MIN_STARS_OLDER: Record<ProjectCategory, number> = {
  创意类: 0,
  审美类: 0,
  工具类: 0,
};
const PREVIEW_ENRICH_LIMIT = 220;
const PREVIEW_ENRICH_BATCH_SIZE = 8;
const MIN_PROJECT_TARGET = 48;
const MIN_VISIBLE_PROJECTS = 180;
const EMERGENCY_MIN_STARS = 0;
const MAX_INACTIVE_HOURS = HOT_DEEP_WINDOW_HOURS;

export type ProjectSource = "GitHub";
export type ProjectCategory = "创意类" | "审美类" | "工具类";

export type CreatorType =
  | "Solo Builder"
  | "Student Team"
  | "Small Team"
  | "Hackathon Team"
  | "Open Source Community";

export type Project = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  whatItDoes: string;
  whyInteresting: string;
  source: ProjectSource;
  sourceUrl: string;
  projectUrl: string;
  demoUrl?: string;
  githubUrl?: string;
  creatorName: string;
  creatorType: CreatorType;
  teamSize: string;
  category: ProjectCategory;
  subcategories: string[];
  builtWith: string[];
  inspirationTags: string[];
  discoveredHoursAgo: number;
  publishedAt: string;
  isOpenSource: boolean;
  isHackathon: boolean;
  isStudentProject: boolean;
  isSoloProject: boolean;
  likes: number;
  comments: number;
  stars: number;
  previewImageUrl: string;
  previewImageSource: "readme" | "github-og" | "website-snapshot";
  hasVisualEvidence: boolean;
  trendingScore: number;
  hotScore24h: number;
  hotDeltaStars24h: number;
  tasteScore: number;
  freshnessScore: number;
  creativityScore: number;
  usefulnessScore: number;
  inspirationScore: number;
  finalScore: number;
};

export type ProjectFeed = {
  projects: Project[];
  updatedAt: string;
  fetchedCandidates: number;
  keptProjects: number;
};

export type ProjectFeedDebug = {
  fetchedCandidates: number;
  keptProjects: number;
  candidates: Array<{
    id: number;
    fullName: string;
    stars: number;
    forks: number;
    createdAt: string;
    updatedAt: string;
    description: string;
  }>;
  kept: Array<{
    id: string;
    name: string;
    category: ProjectCategory;
    stars: number;
    trendingScore: number;
    hotScore24h: number;
    hotDeltaStars24h: number;
    tasteScore: number;
    publishedAt: string;
  }>;
};

let lastSuccessfulFeed: ProjectFeed | null = null;
const STAR_SNAPSHOT_RETENTION_MS = 48 * 60 * 60 * 1000;
const STAR_SNAPSHOT_MAX_ITEMS = 20;
const repoStarHistory = new Map<number, Array<{ timestamp: number; stars: number }>>();
const CANONICAL_REPO_ALIASES: Record<string, string> = {
  "framer/motion": "motiondivision/motion",
};

function canonicalizeRepoFullName(fullName: string) {
  const normalized = fullName.trim().toLowerCase();
  return CANONICAL_REPO_ALIASES[normalized] ?? normalized;
}

const ALWAYS_REMEMBERED_REPOS = ["fuma-nama/fumadocs", "kleenpulse/shadow-garden"];
let rememberedRepoNames = new Set(ALWAYS_REMEMBERED_REPOS);

function isPinnedRepo(fullName: string) {
  const key = canonicalizeRepoFullName(fullName);
  return rememberedRepoNames.has(key) || Boolean(getManualConfig(fullName));
}

function rememberRepoName(fullName: string) {
  rememberedRepoNames.add(canonicalizeRepoFullName(fullName));
}

async function hydrateRememberedRepos() {
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const raw = await readFile(path.join(process.cwd(), "data", "remembered-repos.json"), "utf8");
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed)) {
      for (const name of parsed) {
        if (typeof name === "string" && name.includes("/")) rememberRepoName(name);
      }
    }
  } catch {
    // First run has no remembered list yet.
  }
}

async function persistRememberedRepos(projects: Project[]) {
  for (const project of projects) {
    const fullName = githubFullNameFromProject(project);
    if (fullName) rememberRepoName(fullName);
  }
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "remembered-repos.json"),
      JSON.stringify(Array.from(rememberedRepoNames).sort(), null, 2),
      "utf8",
    );
  } catch {
    // Ignore disk errors on read-only hosts.
  }
}

function canonicalizeGithubUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes("github.com")) return url.toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return url.toLowerCase();
    const fullName = `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
    const canonical = canonicalizeRepoFullName(fullName);
    return `https://github.com/${canonical}`;
  } catch {
    return url.toLowerCase();
  }
}

function getCurrentEasternRadarSlotIso(reference = new Date()) {
  const slots = new Set([0, 6, 12, 18]);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
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
    if (slots.has(hour) && minute === 0) {
      return candidate.toISOString();
    }
  }
  return reference.toISOString();
}

type GithubSearchItem = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  homepage: string | null;
  owner: { login: string };
  topics?: string[];
  default_branch?: string;
};

type RepoSemanticProfile = {
  designerFit: number;
  visualFit: number;
  useCaseSummary: string;
};

const GITHUB_SEARCH_QUERIES = [
  "topic:ai topic:creative-coding",
  "topic:ai topic:generative-art",
  "topic:ai topic:webgl",
  "ai interactive website",
  "ai frontend portfolio",
  "ai browser game",
  "ai visual app",
  "ai design tool",
];

const RECENT_DESIGN_AI_QUERIES = [
  "topic:ai topic:design",
  "topic:ai topic:generative-art",
  "topic:ai topic:creative-coding",
  "topic:ai topic:webgl",
  "topic:ai topic:animation",
  "topic:ai topic:figma-plugin",
  "ai visual design",
  "ai creative coding",
  "ai ui ux",
  "ai art tool",
  "ai image editor",
  "ai motion design",
  "ai interactive art",
  "generative art web",
  "creative coding portfolio",
  "topic:design",
  "topic:art",
  "topic:creative-coding",
  "topic:generative-art",
  "topic:animation",
  "topic:webgl",
  "topic:shader",
  "topic:threejs",
  "topic:figma-plugin",
  "topic:design-system",
  "interactive visual",
  "creative web experience",
  "generative visual",
  "motion design web",
  "visual storytelling web",
  "3d interactive website",
  "typography experiment",
  "portfolio interactive",
  "creative frontend",
  "aesthetic ui",
  "art direction web",
  "creative tool",
  "codex skill image generation",
  "crt interface art",
  "photo editorial ai",
  "three.js demo interactive",
  "procedural 3d web demo",
  "creative hackathon demo",
  "workflow automation creative",
];

const GITHUB_TOPIC_BUCKETS = [
  "creative-coding",
  "generative-art",
  "webgl",
  "threejs",
  "frontend",
  "portfolio",
  "design-system",
  "game",
  "animation",
  "interactive",
];

const MANUAL_INCLUDED_REPOS = [
  {
    owner: "TaiT-tt",
    repo: "tait-crt-interface-skill",
    forcedCategory: "审美类" as ProjectCategory,
    fallbackDescription:
      "An AI image skill that transforms portraits or photos into CRT-inspired retro interface illustrations with pixel grids and layered windows.",
  },
  {
    owner: "ZzzLc0405",
    repo: "photo-abstract-editorial",
    forcedCategory: "创意类" as ProjectCategory,
    fallbackDescription:
      "Turns a photo into an editorial piece with a photo zone, abstract memory panel, and poetic title while preserving composition and color relationships.",
  },
  {
    owner: "TaiT-tt",
    repo: "tait-crt-interface-skill",
    forcedCategory: "审美类" as ProjectCategory,
    fallbackDescription:
      "Converts portraits and photography into CRT retro computer interface illustrations with strong visual identity and pixel language.",
  },
  {
    owner: "thebuggeddev",
    repo: "football-stadium",
    forcedCategory: "审美类" as ProjectCategory,
    fallbackDescription:
      "A procedural Three.js football stadium demo with seat preview, polished UI, and intuitive interaction, blending creativity with practical value.",
  },
  {
    owner: "icecreamlun",
    repo: "understudy",
    forcedCategory: "工具类" as ProjectCategory,
    fallbackDescription:
      "An automation project that turns repetitive operations into executable workflows with hackathon-level creativity and real operational value.",
  },
  {
    owner: "DoctorDerek",
    repo: "doctor-derek",
    forcedCategory: "审美类" as ProjectCategory,
    fallbackDescription:
      "A cinematic portfolio website built with Next.js, TypeScript, XState, Motion, and Rive, focused on UI/UX craft and high-signal presentation.",
  },
  {
    owner: "fuma-nama",
    repo: "fumadocs",
    forcedCategory: "工具类" as ProjectCategory,
    fallbackDescription:
      "A beautiful and flexible React documentation framework for Next.js, Astro, and Vite, with strong visual craft in the docs experience.",
  },
  {
    owner: "kleenpulse",
    repo: "shadow-garden",
    forcedCategory: "审美类" as ProjectCategory,
    fallbackDescription:
      "A motion-forward React component registry where every specimen is exhibited live and every parameter is a tunable dial.",
  },
];

const PERSONAL_PREFERENCE_PROFILE = {
  referenceRepos: [
    "zzzlc0405/photo-abstract-editorial",
    "tait-tt/tait-crt-interface-skill",
    "icecreamlun/understudy",
    "thebuggeddev/football-stadium",
    "fuma-nama/fumadocs",
    "kleenpulse/shadow-garden",
  ],
  preferredAuthors: ["thebuggeddev", "zzzlc0405", "tait-tt", "icecreamlun"],
  visualCraftSignals: [
    "abstract",
    "editorial",
    "poetic",
    "crt",
    "retro interface",
    "pixel",
    "palette",
    "composition",
    "typography",
    "style",
    "aesthetic",
  ],
  interactiveSignals: [
    "3d",
    "three.js",
    "webgl",
    "shader",
    "procedural",
    "first person",
    "camera",
    "interactive",
    "gsap",
    "simulation",
  ],
  practicalCreativeSignals: [
    "skill",
    "workflow",
    "automation",
    "agent",
    "codex",
    "hackathon",
    "dashboard",
    "production",
    "real-world",
  ],
};

const BASELINE_FALLBACK_REPOS = [
  { owner: "pmndrs", repo: "react-three-fiber", stars: 28300, category: "审美类" as ProjectCategory },
  { owner: "processing", repo: "p5.js", stars: 23000, category: "创意类" as ProjectCategory },
  { owner: "paperjs", repo: "paper.js", stars: 15700, category: "创意类" as ProjectCategory },
  { owner: "motiondivision", repo: "motion", stars: 29400, category: "审美类" as ProjectCategory },
  { owner: "tailwindlabs", repo: "headlessui", stars: 27800, category: "工具类" as ProjectCategory },
  { owner: "tokyojack", repo: "threejs-sketches", stars: 4300, category: "审美类" as ProjectCategory },
  { owner: "xyflow", repo: "xyflow", stars: 31800, category: "工具类" as ProjectCategory },
  { owner: "mrdoob", repo: "three.js", stars: 113000, category: "审美类" as ProjectCategory },
  { owner: "fabricjs", repo: "fabric.js", stars: 28600, category: "工具类" as ProjectCategory },
  { owner: "konvajs", repo: "konva", stars: 11300, category: "工具类" as ProjectCategory },
  { owner: "glslify", repo: "glslify", stars: 3900, category: "创意类" as ProjectCategory },
  { owner: "barryclark", repo: "jekyll-now", stars: 7900, category: "创意类" as ProjectCategory },
  { owner: "evanw", repo: "glfx.js", stars: 15400, category: "审美类" as ProjectCategory },
  { owner: "greensock", repo: "GSAP", stars: 22200, category: "审美类" as ProjectCategory },
  { owner: "framer", repo: "motion", stars: 29400, category: "审美类" as ProjectCategory },
  { owner: "mrdoob", repo: "three.js", stars: 113000, category: "审美类" as ProjectCategory },
  { owner: "vercel", repo: "satori", stars: 10200, category: "工具类" as ProjectCategory },
  { owner: "remotion-dev", repo: "remotion", stars: 24700, category: "创意类" as ProjectCategory },
  { owner: "baku89", repo: "4DVJ", stars: 3000, category: "创意类" as ProjectCategory },
  { owner: "issamabd", repo: "creative-elements", stars: 2100, category: "审美类" as ProjectCategory },
  { owner: "airbnb", repo: "lottie-web", stars: 31300, category: "工具类" as ProjectCategory },
  { owner: "yConic", repo: "Vanta", stars: 27200, category: "审美类" as ProjectCategory },
  { owner: "cats-oss", repo: "canvas-confetti", stars: 12600, category: "创意类" as ProjectCategory },
  { owner: "sindresorhus", repo: "awesome", stars: 365000, category: "工具类" as ProjectCategory },
  { owner: "microsoft", repo: "fluentui", stars: 19000, category: "工具类" as ProjectCategory },
  { owner: "radix-ui", repo: "primitives", stars: 24400, category: "工具类" as ProjectCategory },
  { owner: "tailwindlabs", repo: "tailwindcss", stars: 89400, category: "工具类" as ProjectCategory },
  { owner: "d3", repo: "d3", stars: 112000, category: "审美类" as ProjectCategory },
  { owner: "observablehq", repo: "plot", stars: 8400, category: "创意类" as ProjectCategory },
  { owner: "PaperStrike", repo: "pixelorama", stars: 8100, category: "创意类" as ProjectCategory },
  { owner: "Haehnchen", repo: "ideogram", stars: 1800, category: "审美类" as ProjectCategory },
  { owner: "w3c", repo: "csswg-drafts", stars: 7200, category: "工具类" as ProjectCategory },
  { owner: "antfu", repo: "slidev", stars: 37100, category: "创意类" as ProjectCategory },
  { owner: "fuma-nama", repo: "fumadocs", stars: 14400, category: "工具类" as ProjectCategory },
  { owner: "withastro", repo: "astro", stars: 58200, category: "审美类" as ProjectCategory },
  { owner: "nuxt", repo: "nuxt", stars: 58900, category: "工具类" as ProjectCategory },
  { owner: "vitejs", repo: "vite", stars: 78300, category: "工具类" as ProjectCategory },
  { owner: "sveltejs", repo: "svelte", stars: 86200, category: "审美类" as ProjectCategory },
  { owner: "GodotVR", repo: "godot_xr", stars: 1700, category: "创意类" as ProjectCategory },
  { owner: "blender", repo: "blender", stars: 45000, category: "审美类" as ProjectCategory },
  { owner: "NatronGitHub", repo: "Natron", stars: 10600, category: "创意类" as ProjectCategory },
];

const AI_SIGNAL_KEYWORDS = [
  "ai",
  "gpt",
  "llm",
  "claude",
  "gemini",
  "diffusion",
  "generative",
  "vision",
  "voice",
  "openai",
];

const DESIGN_SIGNAL_KEYWORDS = [
  "design",
  "creative coding",
  "visual",
  "image",
  "photo",
  "video",
  "frontend",
  "ui",
  "ux",
  "figma",
  "portfolio",
  "game",
  "animation",
  "art",
  "aesthetic",
  "interactive",
  "webgl",
  "shader",
  "canvas",
  "three.js",
];

const DESIGNER_VALUE_KEYWORDS = [
  "design",
  "ui",
  "ux",
  "figma",
  "visual",
  "creative",
  "image",
  "video",
  "animation",
  "interactive",
  "webgl",
  "shader",
  "canvas",
  "portfolio",
  "plugin",
  "editor",
  "generator",
  "prototype",
  "showcase",
  "gallery",
];

const FRONTEND_INTERACTION_KEYWORDS = [
  "frontend",
  "web app",
  "website",
  "react",
  "next.js",
  "nextjs",
  "vue",
  "svelte",
  "tailwind",
  "three.js",
  "webgl",
  "shader",
  "canvas",
  "interactive",
  "game",
  "portfolio",
  "ui",
  "ux",
  "browser",
];

const CREATIVE_KEYWORDS = [
  "creative",
  "idea",
  "story",
  "showcase",
  "prototype",
  "experiment",
  "playground",
  "demo",
  "toy",
  "daily",
  "habit",
  "travel",
  "food",
  "health",
  "study",
  "family",
  "voice",
  "music",
  "photo",
  "journal",
  "planner",
  "notes",
  "personal",
  "life",
  "abstract",
  "editorial",
  "illustration",
  "story",
  "memory",
  "retro",
  "style",
];

const AESTHETIC_KEYWORDS = [
  "game",
  "3d",
  "animation",
  "art",
  "gallery",
  "visual",
  "webgl",
  "shader",
  "portfolio",
  "fun",
  "interactive",
  "beautiful",
  "render",
];

const AESTHETIC_WHITELIST_KEYWORDS = [
  "game",
  "webgl",
  "three.js",
  "shader",
  "creative coding",
  "interactive art",
  "portfolio",
  "animation",
  "generative art",
  "visual toy",
  "art project",
  "playground",
  "crt",
  "pixel",
  "retro interface",
  "visual design",
  "motion",
  "creative ui",
  "interaction design",
];

const DESIGN_TOOL_KEYWORDS = [
  "figma",
  "design",
  "ui",
  "ux",
  "image",
  "photo",
  "video",
  "animation",
  "portfolio",
  "font",
  "color",
  "icon",
  "canvas",
  "web",
];

const EXCLUDE_HEAVY_TECH_KEYWORDS = [
  "dashboard for python",
  "data apps",
  "annotation tool",
  "labeling",
  "dataset",
  "jupyter",
  "mlops",
  "training pipeline",
  "inference server",
  "vector database",
  "observability",
  "backend framework",
  "sdk",
  "api gateway",
  "orchestration",
  "platform for teams",
  "enterprise workflow",
  "agent framework",
  "rag pipeline",
  "computer vision annotation",
  "ide replacement",
  "jupyter replacement",
  "data platform",
  "python dashboard",
  "notebook",
  "annotation",
  "cvat",
  "labeling",
  "dataset",
  "analytics platform",
];

const EXCLUDE_ENTERPRISE_SCALE_KEYWORDS = [
  "enterprise",
  "for enterprises",
  "production-grade",
  "platform",
  "infrastructure",
  "microservice",
  "kubernetes",
  "multi-tenant",
  "b2b",
  "compliance",
  "soc2",
  "sso",
  "governance",
  "devops",
  "data warehouse",
  "monitoring",
  "observability",
  "distributed system",
];

const EXCLUDE_LOW_REFERENCE_KEYWORDS = [
  "course",
  "tutorial",
  "roadmap",
  "leetcode",
  "interview",
  "crack",
  "cheatsheet",
  "boilerplate",
  "template repo",
  "system design",
  "analytics system",
  "governance",
  "dataset only",
  "awesome list",
  "hello world",
  "from scratch tutorial",
  "learning project",
  "assignment",
  "college project",
  "beginner",
  "practice repo",
];

const EXCLUDE_NON_DESIGN_DOMAINS = [
  "trading bot",
  "prediction market",
  "polymarket",
  "arbitrage",
  "smart contract",
  "contract auditor",
  "security auditor",
  "siem",
  "governance",
  "compliance",
  "risk engine",
  "quant",
  "alpha strategy",
  "startup hiring",
  "jobs list",
  "bitcoin",
  "crypto",
  "stock prediction",
  "medical diagnosis",
  "drone mission",
  "siem dashboard",
  "patent writing",
  "exam prep",
];

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/fresh", label: "Fresh" },
  { href: "/explore", label: "Explore" },
];

export const lifeAreaCategories: ProjectCategory[] = ["创意类", "审美类", "工具类"];

export const builderTypes = [
  "Solo Builder",
  "Student Team",
  "Hackathon Team",
  "Open Source Community",
  "Small Team",
];

function includesAny(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function countSignals(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.reduce((acc, keyword) => acc + (normalized.includes(keyword) ? 1 : 0), 0);
}


function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function hoursAgoFromDate(dateString: string) {
  const ts = new Date(dateString).getTime();
  const now = Date.now();
  return Math.max(1, Math.floor((now - ts) / (1000 * 60 * 60)));
}

function inferCreatorType(text: string): CreatorType {
  const normalized = text.toLowerCase();
  if (includesAny(normalized, ["hackathon", "winner", "prize", "student"])) return "Hackathon Team";
  if (includesAny(normalized, ["open source", "community"])) return "Open Source Community";
  if (includesAny(normalized, ["team", "we built"])) return "Small Team";
  return "Solo Builder";
}

function detectCategory(text: string): ProjectCategory {
  const creativeScore = countSignals(text, CREATIVE_KEYWORDS);
  const aestheticScore = countSignals(text, AESTHETIC_KEYWORDS);
  const isAestheticWhitelisted = includesAny(text, AESTHETIC_WHITELIST_KEYWORDS);

  if (isAestheticWhitelisted && aestheticScore > 0) {
    return "审美类";
  }
  if (creativeScore > 0) return "创意类";
  return "工具类";
}

function getCategoryMinStars(category: ProjectCategory, ageHours: number) {
  if (ageHours > STRICT_MAX_AGE_HOURS) return CATEGORY_MIN_STARS_OLDER[category];
  return CATEGORY_MIN_STARS[category];
}

function pickHighlightKeyword(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.find((keyword) => normalized.includes(keyword)) ?? "";
}

function isRelevantForCategory(text: string, category: ProjectCategory) {
  if (includesAny(text, EXCLUDE_HEAVY_TECH_KEYWORDS)) return false;
  const designSignals = countSignals(text, DESIGN_SIGNAL_KEYWORDS);
  const frontendSignals = countSignals(text, FRONTEND_INTERACTION_KEYWORDS);
  if (designSignals === 0 && frontendSignals === 0) return false;

  if (category === "审美类") {
    return includesAny(text, AESTHETIC_WHITELIST_KEYWORDS) || countSignals(text, AESTHETIC_KEYWORDS) >= 1;
  }
  if (category === "创意类") {
    return (
      countSignals(text, CREATIVE_KEYWORDS) >= 1 ||
      includesAny(text, ["prototype", "experiment", "demo", "playground", "showcase", "interactive"])
    );
  }
  return countSignals(text, DESIGN_TOOL_KEYWORDS) >= 1 || includesAny(text, ["ui", "figma", "image", "visual", "editor"]);
}

function inferSubcategories(text: string, category: ProjectCategory) {
  const normalized = text.toLowerCase();
  if (category === "创意类") {
    const tags = [];
    if (includesAny(normalized, ["travel", "trip"])) tags.push("travel");
    if (includesAny(normalized, ["food", "recipe"])) tags.push("food");
    if (includesAny(normalized, ["health", "fitness"])) tags.push("wellness");
    if (includesAny(normalized, ["study", "learn"])) tags.push("learning");
    if (includesAny(normalized, ["music", "voice"])) tags.push("audio");
    return tags.length ? tags.slice(0, 2) : ["daily life"];
  }
  if (category === "审美类") {
    const tags = [];
    if (includesAny(normalized, ["game"])) tags.push("web game");
    if (includesAny(normalized, ["3d", "webgl"])) tags.push("3D visuals");
    if (includesAny(normalized, ["animation"])) tags.push("motion");
    if (includesAny(normalized, ["portfolio"])) tags.push("showcase");
    return tags.length ? tags.slice(0, 2) : ["visual web"];
  }
  const tags = [];
  if (includesAny(normalized, ["editor"])) tags.push("editor");
  if (includesAny(normalized, ["generator"])) tags.push("generator");
  if (includesAny(normalized, ["assistant"])) tags.push("assistant");
  if (includesAny(normalized, ["automation"])) tags.push("automation");
  return tags.length ? tags.slice(0, 2) : ["productivity"];
}

function buildProjectTexts(description: string, category: ProjectCategory, text: string, repoName: string) {
  const normalizedDesc = description.replace(/\s+/g, " ").trim();
  const short = normalizedDesc.slice(0, 170);
  const firstSentence = normalizedDesc.split(/[.!?。]/)[0]?.trim() || short;
  const salientPhrase = firstSentence.slice(0, 56);
  const secondSentence =
    normalizedDesc
      .split(/[.!?。]/)
      .map((item) => item.trim())
      .filter(Boolean)[1] ?? "";
  const categoryHint =
    category === "审美类"
      ? pickHighlightKeyword(text, AESTHETIC_KEYWORDS) || "interactive visuals"
      : category === "创意类"
        ? pickHighlightKeyword(text, CREATIVE_KEYWORDS) || "daily scenario"
        : pickHighlightKeyword(text, DESIGN_TOOL_KEYWORDS) || "design workflow";

  const summary = `${repoName}: ${firstSentence}${firstSentence.endsWith(".") ? "" : "."}${
    secondSentence ? secondSentence.slice(0, 80) : ""
  }`;
  const whatItDoes = `Focuses on ${categoryHint}: ${short}`;
  const whyInteresting =
    category === "审美类"
      ? `Turns ${categoryHint} into an interactive visual experience (for example: ${salientPhrase}). It prioritizes expression and atmosphere over feature bloat.`
      : category === "创意类"
        ? `Places AI inside specific ${categoryHint} scenarios (for example: ${salientPhrase}), so users can feel the value immediately and extend it into mainstream products.`
        : `Builds a lightweight but complete tool experience around ${categoryHint} (for example: ${salientPhrase}), useful for interaction and information architecture references.`;

  return {
    tagline: short,
    summary,
    whatItDoes,
    whyInteresting,
    categoryHint,
    salientPhrase,
  };
}

function inferBuiltWith(text: string, language = "") {
  const normalized = text.toLowerCase();
  const tools: string[] = [];
  if (includesAny(normalized, ["claude"])) tools.push("Claude");
  if (includesAny(normalized, ["gpt"])) tools.push("GPT");
  if (includesAny(normalized, ["gemini"])) tools.push("Gemini");
  if (includesAny(normalized, ["diffusion"])) tools.push("Stable Diffusion");
  if (language) tools.push(language);
  tools.push("Web App");
  return Array.from(new Set(tools)).slice(0, 4);
}

function buildGithubOgPreviewUrl(repo: GithubSearchItem) {
  return `https://opengraph.githubassets.com/${repo.id}/${repo.full_name}`;
}

function isLikelyExternalWebsite(url: string | null | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (host.includes("github.com") || host.includes("github.io")) return false;
    return true;
  } catch {
    return false;
  }
}

function buildWebsiteSnapshotUrl(url: string) {
  const encoded = encodeURIComponent(url);
  // thum.io public snapshot endpoint: lightweight and works without auth in most cases.
  return `https://image.thum.io/get/width/1200/noanimate/${encoded}`;
}

function hasVisualEvidenceSignal(text: string, repo: GithubSearchItem) {
  const topicsText = (repo.topics ?? []).join(" ").toLowerCase();
  const combined = `${text} ${topicsText}`;
  const visualKeywords = [
    "screenshot",
    "preview",
    "demo",
    "gallery",
    "showcase",
    "gif",
    "video",
    "ui",
    "web app",
    "landing page",
    "portfolio",
    "interactive",
    "playground",
    "webgl",
    "figma",
  ];
  return Boolean(repo.homepage?.trim()) || includesAny(combined, visualKeywords);
}

function resolveReadmeImageUrl(rawUrl: string, repo: GithubSearchItem) {
  const candidate = rawUrl.trim().replace(/^<|>$/g, "").split(/\s+/)[0];
  if (!candidate || candidate.startsWith("data:")) return null;
  if (/^(https?:)?\/\//i.test(candidate)) {
    return candidate.startsWith("//") ? `https:${candidate}` : candidate;
  }

  let path = candidate.replace(/^\.\//, "");
  while (path.startsWith("../")) path = path.replace(/^\.\.\//, "");
  if (path.startsWith("/")) path = path.slice(1);
  if (!path) return null;

  // HEAD follows the repository default branch, which is not always `main`.
  const branch = repo.default_branch || "HEAD";
  return `https://raw.githubusercontent.com/${repo.full_name}/${branch}/${path}`;
}

function isLikelyNonPreviewImage(url: string) {
  const normalized = url.toLowerCase();
  const blockedKeywords = [
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
  ];

  if (blockedKeywords.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  // SVG assets in README are often logos/icons/status graphics instead of showcase previews.
  if (normalized.endsWith(".svg")) {
    return true;
  }

  return false;
}

function hasPreviewSemanticSignal(text: string) {
  const normalized = text.toLowerCase();
  const requiredSignals = [
    "screenshot",
    "screenshots",
    "screen-shot",
    "preview",
    "demo",
    "showcase",
    "mockup",
    "interface",
    "ui",
    "ux",
    "landing",
    "homepage",
    "web app",
    "application",
    "example output",
    "result",
    "before-after",
    "before/after",
    "walkthrough",
    "product shot",
    "banner",
    "cover",
    "hero",
  ];
  return requiredSignals.some((signal) => normalized.includes(signal));
}

function looksLikeImageAsset(url: string) {
  return /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url);
}

async function fetchReadmePreviewImage(repo: GithubSearchItem): Promise<string | null> {
  const url = `https://api.github.com/repos/${repo.full_name}/readme`;
  const buildHeaders = (withAuth: boolean) => ({
    "User-Agent": "inspiration-hunt-crawler",
    Accept: "application/vnd.github.raw+json",
    ...(withAuth && GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  });

  let response = await fetch(url, {
    headers: buildHeaders(true),
    cache: "no-store",
  });

  if (!response.ok && GITHUB_TOKEN && (response.status === 401 || response.status === 403)) {
    response = await fetch(url, {
      headers: buildHeaders(false),
      cache: "no-store",
    });
  }
  if (!response.ok) return null;
  const readme = (await response.text()).slice(0, 150000);

  const markdownImageMatches = Array.from(readme.matchAll(/!\[([^\]]*)]\(([^)]+)\)/gi));
  const relaxedCandidates: string[] = [];
  for (const match of markdownImageMatches) {
    const altText = match[1] ?? "";
    const candidate = match[2];
    const resolved = candidate ? resolveReadmeImageUrl(candidate, repo) : null;
    if (!resolved) continue;
    if (isLikelyNonPreviewImage(resolved)) continue;
    const semanticProbe = `${altText} ${candidate} ${resolved}`;
    if (hasPreviewSemanticSignal(semanticProbe)) return resolved;
    if (looksLikeImageAsset(resolved)) relaxedCandidates.push(resolved);
  }

  const htmlImgMatches = Array.from(readme.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi));
  for (const match of htmlImgMatches) {
    const candidate = match[1];
    const wholeTag = match[0] ?? "";
    const resolved = candidate ? resolveReadmeImageUrl(candidate, repo) : null;
    if (!resolved) continue;
    if (isLikelyNonPreviewImage(resolved)) continue;
    const semanticProbe = `${wholeTag} ${candidate} ${resolved}`;
    if (hasPreviewSemanticSignal(semanticProbe)) return resolved;
    if (looksLikeImageAsset(resolved)) relaxedCandidates.push(resolved);
  }

  if (relaxedCandidates.length) {
    return relaxedCandidates[0];
  }

  return null;
}

async function fetchReadmeText(repo: GithubSearchItem): Promise<string> {
  const url = `https://api.github.com/repos/${repo.full_name}/readme`;
  const buildHeaders = (withAuth: boolean) => ({
    "User-Agent": "inspiration-hunt-crawler",
    Accept: "application/vnd.github.raw+json",
    ...(withAuth && GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  });

  let response = await fetch(url, {
    headers: buildHeaders(true),
    cache: "no-store",
  });

  if (!response.ok && GITHUB_TOKEN && (response.status === 401 || response.status === 403)) {
    response = await fetch(url, {
      headers: buildHeaders(false),
      cache: "no-store",
    });
  }
  if (!response.ok) return "";
  return (await response.text()).slice(0, 32000);
}

function scoreRepoSemanticProfile(repo: GithubSearchItem, readme: string): RepoSemanticProfile {
  const baseText = `${repo.name} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
  const readmeText = readme.toLowerCase();
  const semanticText = `${baseText}\n${readmeText}`;

  const visualArtifacts = [
    "image",
    "video",
    "ui",
    "ux",
    "figma",
    "design system",
    "landing page",
    "website",
    "portfolio",
    "motion",
    "3d",
    "webgl",
    "animation",
    "canvas",
    "illustration",
    "poster",
    "template",
    "editor",
  ];
  const creatorActions = [
    "generate",
    "create",
    "design",
    "edit",
    "prototype",
    "compose",
    "render",
    "visualize",
    "remix",
    "storyboard",
    "style transfer",
    "mockup",
  ];
  const audienceSignals = ["designer", "creator", "artist", "marketer", "content creator", "vibe coder"];
  const lowValueSignals = [
    "penetration testing",
    "trading engine",
    "quant",
    "benchmark",
    "certification",
    "interview prep",
    "course",
    "tutorial",
    "kernel",
    "compiler",
    "inference engine",
    "memory api",
  ];

  const visualFit = countSignals(semanticText, visualArtifacts);
  const actionFit = countSignals(semanticText, creatorActions);
  const audienceFit = countSignals(semanticText, audienceSignals);
  const penalty = countSignals(semanticText, lowValueSignals);
  const designerFit = Math.max(0, visualFit * 2 + actionFit * 1.6 + audienceFit * 1.3 - penalty * 1.7);

  const firstSentence =
    (repo.description ?? "")
      .split(/[.!?。]/)
      .map((item) => item.trim())
      .find(Boolean) ?? "";
  const useCaseSummary = firstSentence || repo.name;

  return {
    designerFit: Number(designerFit.toFixed(2)),
    visualFit: Number(visualFit.toFixed(2)),
    useCaseSummary: useCaseSummary.slice(0, 160),
  };
}

async function buildRepoSemanticProfiles(repos: GithubSearchItem[]) {
  const profileMap = new Map<number, RepoSemanticProfile>();
  for (const repo of repos) {
    profileMap.set(repo.id, scoreRepoSemanticProfile(repo, ""));
  }
  return profileMap;
}

function githubFullNameFromProject(project: Project) {
  try {
    const url = new URL(project.githubUrl || project.sourceUrl);
    if (!url.hostname.toLowerCase().includes("github.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  } catch {
    return null;
  }
}

function syntheticRepoFromProject(project: Project): GithubSearchItem | null {
  const fullName = githubFullNameFromProject(project);
  if (!fullName) return null;
  const [owner, name] = fullName.split("/");
  return {
    id: Number(project.id.replace("gh-", "")) || 0,
    name,
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: project.tagline,
    stargazers_count: project.stars,
    forks_count: project.comments,
    language: null,
    created_at: project.publishedAt,
    updated_at: project.publishedAt,
    homepage: project.projectUrl !== project.sourceUrl ? project.projectUrl : null,
    owner: { login: owner },
    default_branch: "HEAD",
  };
}

function preferRicherProject(current: Project | undefined, incoming: Project) {
  if (!current) return incoming;
  const rank = (project: Project) => {
    const preview =
      project.previewImageSource === "readme" ? 300 : project.previewImageSource === "website-snapshot" ? 180 : 0;
    const live = project.id.startsWith("fallback-") ? 0 : 80;
    return preview + live;
  };
  return rank(incoming) > rank(current) ? incoming : current;
}

function mergeProjectLists(...groups: Array<Project[] | undefined>) {
  const merged = new Map<string, Project>();
  for (const group of groups) {
    if (!group?.length) continue;
    for (const project of group) {
      const key = canonicalizeGithubUrl(project.sourceUrl || project.projectUrl || project.id);
      merged.set(key, preferRicherProject(merged.get(key), project));
    }
  }
  return Array.from(merged.values());
}

async function readFeedArchive(): Promise<ProjectFeed | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.join(process.cwd(), "data", "inspiration-feed-archive.json");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ProjectFeed;
    if (!Array.isArray(parsed?.projects) || parsed.projects.length === 0) return null;
    const projects = parsed.projects.filter(isArchiveEligible);
    if (!projects.length) return null;
    return { ...parsed, projects, keptProjects: projects.length };
  } catch {
    return null;
  }
}

function currentArchiveYear() {
  return new Date().getUTCFullYear();
}

function currentYearWindowDays() {
  const start = Date.UTC(currentArchiveYear(), 0, 1);
  return Math.max(7, Math.ceil((Date.now() - start) / 86_400_000));
}

function isCurrentYearDate(dateString: string) {
  const year = Number(String(dateString).slice(0, 4));
  return year === currentArchiveYear();
}

function isAiCreativeWork(text: string) {
  const normalized = text.toLowerCase();
  const hasAi =
    countSignals(normalized, AI_SIGNAL_KEYWORDS) > 0 ||
    includesAny(normalized, [
      "midjourney",
      "stable diffusion",
      "stable-diffusion",
      "text-to-image",
      "image generation",
      "generative art",
      "codex skill",
      "dall-e",
      "dalle",
      "gpt-image",
    ]);
  const hasCreative =
    countSignals(normalized, DESIGN_SIGNAL_KEYWORDS) > 0 ||
    countSignals(normalized, DESIGNER_VALUE_KEYWORDS) > 0 ||
    countSignals(normalized, FRONTEND_INTERACTION_KEYWORDS) > 0 ||
    countSignals(normalized, CREATIVE_KEYWORDS) > 0 ||
    countSignals(normalized, AESTHETIC_KEYWORDS) > 0 ||
    includesAny(normalized, ["generative", "3d", "three.js", "webgl", "interactive", "portfolio", "skill", "shader"]);
  return hasAi && hasCreative;
}

function isArchiveEligible(project: Project) {
  if (project.id.startsWith("fallback-")) return false;
  return isCurrentYearDate(project.publishedAt);
}

async function writeFeedArchive(feed: ProjectFeed) {
  try {
    const existing = await readFeedArchive();
    const mergedProjects = mergeProjectLists(
      (existing?.projects ?? []).filter(isArchiveEligible),
      feed.projects.filter(isArchiveEligible),
    );
    if (!mergedProjects.length) return;
    await persistRememberedRepos(mergedProjects);
    const toWrite: ProjectFeed = {
      ...feed,
      projects: mergedProjects,
      keptProjects: mergedProjects.length,
    };
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "inspiration-feed-archive.json"), JSON.stringify(toWrite), "utf8");
  } catch {
    // Ignore disk errors on read-only hosts; in-memory merge still applies.
  }
}

async function enrichProjectsWithPreview(projects: Project[], repoById: Map<number, GithubSearchItem>) {
  const candidates = projects
    .filter((project) => project.previewImageSource !== "readme")
    .sort((a, b) => {
      const rank = (project: Project) => {
        if (project.id.startsWith("fallback-")) return 0;
        if (project.previewImageSource === "github-og") return 1;
        return 2;
      };
      return rank(a) - rank(b);
    })
    .slice(0, PREVIEW_ENRICH_LIMIT);

  for (let i = 0; i < candidates.length; i += PREVIEW_ENRICH_BATCH_SIZE) {
    const batch = candidates.slice(i, i + PREVIEW_ENRICH_BATCH_SIZE);
    await Promise.all(
      batch.map(async (project) => {
        const repoId = Number(project.id.replace("gh-", ""));
        const repo = repoById.get(repoId) ?? syntheticRepoFromProject(project);
        if (!repo) return;
        const readmeImage = await fetchReadmePreviewImage(repo);
        if (readmeImage) {
          project.previewImageUrl = readmeImage;
          project.previewImageSource = "readme";
          return;
        }

        const homepage = (repo.homepage?.trim() || (project.projectUrl !== project.sourceUrl ? project.projectUrl : "")).trim();
        if (isLikelyExternalWebsite(homepage)) {
          project.previewImageUrl = buildWebsiteSnapshotUrl(homepage);
          project.previewImageSource = "website-snapshot";
        }
      }),
    );
  }
}

function getManualConfig(fullName: string) {
  return MANUAL_INCLUDED_REPOS.find((item) => `${item.owner}/${item.repo}`.toLowerCase() === fullName.toLowerCase());
}


async function fetchGithubQuery(
  query: string,
  page: number,
  sort: "updated" | "stars",
  createdSince: string,
  createdUntil: string,
): Promise<GithubSearchItem[]> {
  const q = `${query} created:${createdSince}..${createdUntil} archived:false stars:>=${MIN_STARS}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    q,
  )}&sort=${sort}&order=desc&per_page=100&page=${page}`;
  const buildHeaders = (withAuth: boolean) => ({
    "User-Agent": "inspiration-hunt-crawler",
    Accept: "application/vnd.github+json",
    ...(withAuth && GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  });

  const response = await fetch(url, {
    headers: buildHeaders(true),
    cache: "no-store",
  });
  if (!response.ok) {
    if (GITHUB_TOKEN && (response.status === 401 || response.status === 403)) {
      const retry = await fetch(url, {
        headers: buildHeaders(false),
        cache: "no-store",
      });
      if (!retry.ok) return [];
      const retryJson = (await retry.json()) as { items?: GithubSearchItem[] };
      return retryJson.items ?? [];
    }
    return [];
  }
  const json = (await response.json()) as { items?: GithubSearchItem[] };
  return json.items ?? [];
}

async function fetchGithubRecentWindowQuery(
  query: string,
  page: number,
  sort: "updated" | "stars",
  windowHours = HOT_WINDOW_HOURS,
): Promise<GithubSearchItem[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString().slice(0, 10);
  const q = `${query} created:>=${since} archived:false stars:>=${MIN_STARS}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    q,
  )}&sort=${sort}&order=desc&per_page=100&page=${page}`;
  const buildHeaders = (withAuth: boolean) => ({
    "User-Agent": "inspiration-hunt-crawler",
    Accept: "application/vnd.github+json",
    ...(withAuth && GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  });

  const response = await fetch(url, {
    headers: buildHeaders(true),
    cache: "no-store",
  });
  if (!response.ok) {
    if (GITHUB_TOKEN && (response.status === 401 || response.status === 403)) {
      const retry = await fetch(url, {
        headers: buildHeaders(false),
        cache: "no-store",
      });
      if (!retry.ok) return [];
      const retryJson = (await retry.json()) as { items?: GithubSearchItem[] };
      return retryJson.items ?? [];
    }
    return [];
  }
  const json = (await response.json()) as { items?: GithubSearchItem[] };
  return json.items ?? [];
}

async function fetchRepoByFullName(fullName: string): Promise<GithubSearchItem | null> {
  const url = `https://api.github.com/repos/${fullName}`;
  const buildHeaders = (withAuth: boolean) => ({
    "User-Agent": "inspiration-hunt-crawler",
    Accept: "application/vnd.github+json",
    ...(withAuth && GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  });

  let response = await fetch(url, {
    headers: buildHeaders(true),
    cache: "no-store",
  });

  if (!response.ok && GITHUB_TOKEN && (response.status === 401 || response.status === 403)) {
    response = await fetch(url, {
      headers: buildHeaders(false),
      cache: "no-store",
    });
  }
  if (!response.ok) return null;

  const repo = (await response.json()) as GithubSearchItem;
  return repo?.id ? repo : null;
}

async function fetchManualIncludedRepos() {
  await hydrateRememberedRepos();
  const uniqueFullNames = Array.from(
    new Set([
      ...MANUAL_INCLUDED_REPOS.map((item) => `${item.owner}/${item.repo}`.toLowerCase()),
      ...Array.from(rememberedRepoNames),
    ]),
  );
  const repos = await Promise.all(uniqueFullNames.map((fullName) => fetchRepoByFullName(fullName)));
  return repos.filter((item): item is GithubSearchItem => Boolean(item));
}

function formatDateUTC(input: Date) {
  return input.toISOString().slice(0, 10);
}

function getRecentCreatedWindows(windowDays = STRICT_WINDOW_DAYS) {
  const windows: Array<{ since: string; until: string }> = [];
  const now = new Date();
  for (let offset = 0; offset < windowDays; offset += WINDOW_STEP_DAYS) {
    const end = new Date(now);
    end.setUTCDate(now.getUTCDate() - offset);
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() - Math.min(windowDays, offset + WINDOW_STEP_DAYS));
    windows.push({
      since: formatDateUTC(start),
      until: formatDateUTC(end),
    });
  }
  return windows;
}

function buildGithubQueryPool() {
  const seedQueries = [
    "topic:ai",
    "topic:artificial-intelligence",
    "topic:generative-ai",
    "topic:machine-learning",
    "ai design",
    "ai image tool",
    "ai creative",
    "ai interactive",
    "ai web app",
    "ai design tool",
    "ai creative coding",
    "ai generative art",
    "ai ui ux",
    "ai game",
    "ai visual editor",
    "ai figma plugin",
    "ai design workflow",
    "ai website builder",
    "ai portfolio generator",
    "ai visual showcase",
    "ai interaction design",
    "ai creative ui",
    "interactive webgl art",
    "ai motion design",
    "ai art playground",
    "topic:generative-art ai",
    "topic:creative-coding ai",
    ...GITHUB_SEARCH_QUERIES,
    "topic:ai topic:design",
    "topic:ai topic:frontend",
    "topic:ai topic:interactive",
    "topic:creative-coding",
    "generative art web",
    "ai ui ux tool",
    "ai portfolio site",
  ];
  const topicQueries = GITHUB_TOPIC_BUCKETS.map((topic) => `topic:ai topic:${topic}`);
  return Array.from(new Set([...seedQueries, ...topicQueries]));
}

function buildSearchTasks(windowDays = STRICT_WINDOW_DAYS) {
  const queries = buildGithubQueryPool();
  const windows = getRecentCreatedWindows(windowDays);
  const tasks: Array<{ query: string; page: number; sort: "updated" | "stars"; since: string; until: string }> = [];

  for (const { since, until } of windows) {
    for (const query of queries) {
      for (const sort of SEARCH_SORTS) {
        for (let page = 1; page <= SEARCH_PAGES; page += 1) {
          tasks.push({ query, page, sort, since, until });
          if (tasks.length >= MAX_SEARCH_REQUESTS) return tasks;
        }
      }
    }
  }

  return tasks;
}

async function fetchGithubProjects(windowDays = STRICT_WINDOW_DAYS, stopWhenReachedTarget = true): Promise<GithubSearchItem[]> {
  const searchTasks = buildSearchTasks(windowDays);
  const dedup = new Map<number, GithubSearchItem>();

  for (let i = 0; i < searchTasks.length; i += SEARCH_BATCH_SIZE) {
    const batch = searchTasks.slice(i, i + SEARCH_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(({ query, page, sort, since, until }) => fetchGithubQuery(query, page, sort, since, until)),
    );

    for (const list of batchResults) {
      for (const repo of list) {
        if (!dedup.has(repo.id)) dedup.set(repo.id, repo);
      }
    }

    if (stopWhenReachedTarget && dedup.size >= TARGET_FETCHED_CANDIDATES) {
      break;
    }
  }

  return Array.from(dedup.values());
}

async function fetchCandidateRepos(): Promise<GithubSearchItem[]> {
  const runWindow = async (hours: number) => {
    const tasks: Array<{ query: string; page: number; sort: "updated" | "stars" }> = [];
    for (const query of RECENT_DESIGN_AI_QUERIES) {
      for (const sort of SEARCH_SORTS) {
        for (let page = 1; page <= WINDOW_SEARCH_PAGES; page += 1) {
          tasks.push({ query, page, sort });
          if (tasks.length >= WINDOW_SEARCH_MAX_REQUESTS) break;
        }
        if (tasks.length >= WINDOW_SEARCH_MAX_REQUESTS) break;
      }
      if (tasks.length >= WINDOW_SEARCH_MAX_REQUESTS) break;
    }
    const repos: GithubSearchItem[] = [];
    for (let i = 0; i < tasks.length; i += SEARCH_BATCH_SIZE) {
      const batch = tasks.slice(i, i + SEARCH_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(({ query, page, sort }) => fetchGithubRecentWindowQuery(query, page, sort, hours)),
      );
      for (const list of results) repos.push(...list);
    }
    return repos;
  };

  const dedup = new Map<number, GithubSearchItem>();
  const windows = [
    HOT_WINDOW_HOURS,
    HOT_FALLBACK_WINDOW_HOURS,
    HOT_EXTENDED_WINDOW_HOURS,
    HOT_MAX_WINDOW_HOURS,
    HOT_DEEP_WINDOW_HOURS,
  ];
  for (const hours of windows) {
    const repos = await runWindow(hours);
    for (const repo of repos) {
      if (!dedup.has(repo.id)) dedup.set(repo.id, repo);
    }
    if (dedup.size >= TARGET_FETCHED_CANDIDATES) break;
  }

  if (dedup.size < TARGET_FETCHED_CANDIDATES) {
    const broadRepos = await fetchGithubProjects(currentYearWindowDays(), true);
    for (const repo of broadRepos) {
      if (!dedup.has(repo.id)) dedup.set(repo.id, repo);
    }
  }

  const manualRepos = await fetchManualIncludedRepos();
  for (const repo of manualRepos) {
    if (!dedup.has(repo.id)) dedup.set(repo.id, repo);
  }

  return Array.from(dedup.values());
}

function scoreTrending(repo: GithubSearchItem) {
  const ageHours = hoursAgoFromDate(repo.created_at);
  const ageDays = Math.max(0.5, ageHours / 24);
  const stars = repo.stargazers_count;
  const forks = repo.forks_count;
  const starVelocityPerDay = stars / ageDays;
  const velocityScore = Math.min(10, Math.log10(starVelocityPerDay + 1) * 4.4);
  const volumeScore = Math.min(10, Math.log10(stars + 1) * 3.2);
  const engagementScore = Math.min(10, Math.log10(stars + forks * 3 + 1) * 2.8);
  const trending = velocityScore * 0.55 + volumeScore * 0.3 + engagementScore * 0.15;
  return Number(trending.toFixed(1));
}

function rememberRepoStars(repos: GithubSearchItem[]) {
  const now = Date.now();
  const cutoff = now - STAR_SNAPSHOT_RETENTION_MS;
  for (const repo of repos) {
    const history = repoStarHistory.get(repo.id) ?? [];
    const latest = history[history.length - 1];
    if (!latest || latest.stars !== repo.stargazers_count || now - latest.timestamp >= 30 * 60 * 1000) {
      history.push({ timestamp: now, stars: repo.stargazers_count });
    }
    const trimmed = history.filter((entry) => entry.timestamp >= cutoff).slice(-STAR_SNAPSHOT_MAX_ITEMS);
    repoStarHistory.set(repo.id, trimmed);
  }
}

function getRepoStarDelta24h(repo: GithubSearchItem) {
  const now = Date.now();
  const history = repoStarHistory.get(repo.id) ?? [];
  const fallbackTimestamp = now - HOTTEST_WINDOW_HOURS * 60 * 60 * 1000;
  const firstEntry = history[0] ?? { timestamp: fallbackTimestamp, stars: repo.stargazers_count };
  const target = now - HOTTEST_WINDOW_HOURS * 60 * 60 * 1000;
  const baseline =
    history.find((entry) => entry.timestamp >= target) ??
    [...history].reverse().find((entry) => entry.timestamp <= target) ??
    firstEntry;
  const delta = Math.max(0, repo.stargazers_count - baseline.stars);
  const observedHours = Math.max(1, (now - baseline.timestamp) / (60 * 60 * 1000));
  return { delta, observedHours };
}

function scoreHot24h(repo: GithubSearchItem) {
  const ageHours = Math.max(1, hoursAgoFromDate(repo.created_at));
  const { delta, observedHours } = getRepoStarDelta24h(repo);
  const pace24h = (delta / observedHours) * HOTTEST_WINDOW_HOURS;
  const baselineVelocity = repo.stargazers_count / Math.max(1, ageHours / 24);
  const hotScore = pace24h * 0.82 + baselineVelocity * 0.18;
  return Number(hotScore.toFixed(2));
}

function scorePersonalTaste(text: string, repo: GithubSearchItem, semantic: RepoSemanticProfile | undefined, category: ProjectCategory) {
  const normalized = text.toLowerCase();
  const repoKey = repo.full_name.toLowerCase();
  const ownerKey = repo.owner.login.toLowerCase();
  const visualHit = countSignals(normalized, PERSONAL_PREFERENCE_PROFILE.visualCraftSignals);
  const interactiveHit = countSignals(normalized, PERSONAL_PREFERENCE_PROFILE.interactiveSignals);
  const practicalHit = countSignals(normalized, PERSONAL_PREFERENCE_PROFILE.practicalCreativeSignals);
  const hasVisualEvidence = hasVisualEvidenceSignal(normalized, repo) ? 1 : 0;
  const refBoost = PERSONAL_PREFERENCE_PROFILE.referenceRepos.includes(repoKey) ? 6 : 0;
  const authorBoost = PERSONAL_PREFERENCE_PROFILE.preferredAuthors.includes(ownerKey) ? 2.5 : 0;
  const semanticBoost = (semantic?.designerFit ?? 0) * 0.8;
  const categoryBoost = category === "审美类" ? 1.4 : category === "创意类" ? 1.1 : 0.8;
  const score =
    visualHit * 1.8 +
    interactiveHit * 1.5 +
    practicalHit * 1.2 +
    hasVisualEvidence * 1.1 +
    refBoost +
    authorBoost +
    semanticBoost +
    categoryBoost;
  return Number(score.toFixed(2));
}

function isIndieScaleRepo(repo: GithubSearchItem, text: string) {
  if (repo.stargazers_count > MAX_INDIE_STARS) return false;
  if (repo.stargazers_count > 1200 && repo.forks_count > repo.stargazers_count * 0.55) return false;
  if (includesAny(text, EXCLUDE_ENTERPRISE_SCALE_KEYWORDS)) return false;
  if (repo.name.toLowerCase().startsWith("awesome-")) return false;
  return true;
}

function scoreProject(repo: GithubSearchItem, category: ProjectCategory) {
  const activeAge = hoursAgoFromDate(repo.updated_at);
  const freshnessScore = activeAge <= 24 ? 9.8 : activeAge <= 72 ? 9.1 : 8.4;
  const creativityScore = category === "审美类" ? 9.0 : category === "创意类" ? 8.7 : 7.8;
  const usefulnessScore = category === "创意类" ? 8.9 : category === "工具类" ? 8.4 : 7.6;
  const inspirationScore = includesAny((repo.description ?? "").toLowerCase(), ["demo", "hackathon", "prototype"]) ? 8.9 : 8.2;
  const popularityScore = scoreTrending(repo);
  const indieFitScore = isIndieScaleRepo(repo, `${repo.name} ${repo.description ?? ""}`.toLowerCase()) ? 9.2 : 6.8;
  const hasVisualEvidence = hasVisualEvidenceSignal(`${repo.name} ${repo.description ?? ""}`.toLowerCase(), repo);
  const visualScore = hasVisualEvidence ? 9.2 : 6.6;
  const finalScore =
    freshnessScore * 0.12 +
    creativityScore * 0.2 +
    usefulnessScore * 0.18 +
    inspirationScore * 0.08 +
    popularityScore * 0.3 +
    indieFitScore * 0.05 +
    visualScore * 0.07;

  return {
    freshnessScore: Number(freshnessScore.toFixed(1)),
    creativityScore: Number(creativityScore.toFixed(1)),
    usefulnessScore: Number(usefulnessScore.toFixed(1)),
    inspirationScore: Number(inspirationScore.toFixed(1)),
    finalScore: Number(finalScore.toFixed(1)),
  };
}

function buildBaselineFallbackProjects(): Project[] {
  const now = Date.now();
  const uniqueSeeds = Array.from(
    new Map(
      BASELINE_FALLBACK_REPOS.map((seed) => [
        canonicalizeRepoFullName(`${seed.owner}/${seed.repo}`.toLowerCase()),
        seed,
      ]),
    ).values(),
  );
  return uniqueSeeds.map((seed, index) => {
    const fullName = `${seed.owner}/${seed.repo}`;
    const text = `${seed.repo} design creative visual interactive art tool`.toLowerCase();
    const category = seed.category;
    const projectTexts = buildProjectTexts(
      `${seed.repo} is an open-source project focused on design, creativity, and interactive web experiences.`,
      category,
      text,
      seed.repo,
    );
    return {
      id: `fallback-${seed.owner}-${seed.repo}`.toLowerCase(),
      slug: slugify(`${seed.repo}-fallback-${index}`),
      name: seed.repo,
      tagline: projectTexts.tagline,
      summary: projectTexts.summary,
      whatItDoes: projectTexts.whatItDoes,
      whyInteresting: `Baseline fallback project used when GitHub search quota is constrained, so the feed remains browsable. Source: ${fullName}.`,
      source: "GitHub",
      sourceUrl: `https://github.com/${fullName}`,
      projectUrl: `https://github.com/${fullName}`,
      githubUrl: `https://github.com/${fullName}`,
      creatorName: seed.owner,
      creatorType: "Open Source Community",
      teamSize: "Open Source",
      category,
      subcategories: inferSubcategories(text, category),
      builtWith: ["Open Source"],
      inspirationTags: [category, "Fallback", "Baseline"],
      discoveredHoursAgo: 24 * 10 + index,
      publishedAt: new Date(now - (index + 10) * 24 * 3_600_000).toISOString().slice(0, 10),
      isOpenSource: true,
      isHackathon: false,
      isStudentProject: false,
      isSoloProject: false,
      likes: seed.stars,
      comments: Math.floor(seed.stars * 0.08),
      stars: seed.stars,
      previewImageUrl: `https://opengraph.githubassets.com/inspiration-hunt/${fullName}`,
      previewImageSource: "github-og",
      hasVisualEvidence: true,
      trendingScore: 8.6,
      hotScore24h: 0,
      hotDeltaStars24h: 0,
      tasteScore: 3.2,
      freshnessScore: 8.4,
      creativityScore: 8.5,
      usefulnessScore: 8.5,
      inspirationScore: 8.3,
      finalScore: 8.5,
    };
  });
}

function toProject(repo: GithubSearchItem, semantic: RepoSemanticProfile | undefined, relaxed = false): Project | null {
  const manualConfig = getManualConfig(repo.full_name);
  const description = ((repo.description ?? "").trim() || manualConfig?.fallbackDescription || "").trim();
  if (!description || description.length < MIN_DESCRIPTION_LENGTH) return null;
  const text = `${repo.name} ${description} ${(repo.topics ?? []).join(" ")} ${repo.full_name}`.toLowerCase();
  if (!isCurrentYearDate(repo.created_at)) return null;
  if (!isPinnedRepo(repo.full_name) && !isAiCreativeWork(text)) return null;
  if (includesAny(text, EXCLUDE_LOW_REFERENCE_KEYWORDS) && !manualConfig) return null;
  if (includesAny(text, EXCLUDE_NON_DESIGN_DOMAINS) && !manualConfig) return null;
  const aiSignals = countSignals(text, AI_SIGNAL_KEYWORDS);
  const designSignals = countSignals(text, DESIGN_SIGNAL_KEYWORDS);
  const frontendSignals = countSignals(text, FRONTEND_INTERACTION_KEYWORDS);
  const designerValueSignals = countSignals(text, DESIGNER_VALUE_KEYWORDS);
  const hasVisualEvidence = hasVisualEvidenceSignal(text, repo);
  const semanticFit = semantic?.designerFit ?? 0;
  if (!manualConfig && semanticFit < 0.7 && !hasVisualEvidence && repo.stargazers_count < 5) return null;
  if (!manualConfig && aiSignals === 0 && semanticFit < 1.4 && repo.stargazers_count < 15) return null;
  if (!manualConfig && designSignals === 0 && frontendSignals === 0 && designerValueSignals === 0 && semanticFit < 1.8) return null;

  const category = manualConfig?.forcedCategory ?? detectCategory(text);
  const age = hoursAgoFromDate(repo.created_at);
  const updatedAge = hoursAgoFromDate(repo.updated_at);
  const categoryMinStars = getCategoryMinStars(category, updatedAge);
  const relaxedMinStars = Math.max(0, Math.floor(MIN_INSPIRATION_STARS * 0.6));
  const minStarsThreshold = relaxed ? Math.min(categoryMinStars, relaxedMinStars) : Math.max(MIN_INSPIRATION_STARS, categoryMinStars);
  if (repo.stargazers_count < minStarsThreshold && !manualConfig) return null;
  if (!isPinnedRepo(repo.full_name) && !isIndieScaleRepo(repo, text)) return null;
  if (!isRelevantForCategory(text, category) && !manualConfig) {
    const hasLightProductSignal = includesAny(text, [
      "app",
      "web",
      "site",
      "tool",
      "assistant",
      "plugin",
      "extension",
      "image",
      "video",
      "ui",
      "interface",
      "frontend",
    ]);
    if (!hasLightProductSignal) return null;
  }
  const creatorType = inferCreatorType(text);
  const teamSize = creatorType === "Solo Builder" ? "1" : creatorType === "Small Team" ? "2-5" : "Open Source";
  const subcategories = inferSubcategories(text, category);
  const builtWith = inferBuiltWith(text, repo.language ?? "");
  const scores = scoreProject(repo, category);
  const isHackathon = includesAny(text, ["hackathon", "winner", "prize", "award"]);
  const projectTexts = buildProjectTexts(description, category, text, repo.name);
  const trendingScore = scoreTrending(repo);
  const hotDeltaStars24h = getRepoStarDelta24h(repo).delta;
  const hotScore24h = scoreHot24h(repo);
  const tasteScore = scorePersonalTaste(text, repo, semantic, category);
  const dynamicWhySuffix = `Project "${repo.name}" currently has ⭐${repo.stargazers_count}, has been active in the last ${updatedAge} hours, gained about ⭐${hotDeltaStars24h} in 24h, with 24h heat score ${hotScore24h.toFixed(2)} and trending score ${trendingScore.toFixed(1)}.`;

  return {
    id: `gh-${repo.id}`,
    slug: slugify(`${repo.name}-${repo.id}`),
    name: repo.name,
    tagline: projectTexts.tagline,
    summary: projectTexts.summary,
    whatItDoes: projectTexts.whatItDoes,
    whyInteresting: isHackathon
      ? `This project has hackathon/award signals, showing it validated a practical creative direction in a short time. ${projectTexts.whyInteresting} ${dynamicWhySuffix}`
      : `${projectTexts.whyInteresting} ${dynamicWhySuffix}`,
    source: "GitHub",
    sourceUrl: repo.html_url,
    projectUrl: repo.homepage?.trim() || repo.html_url,
    githubUrl: repo.html_url,
    creatorName: repo.owner.login,
    creatorType,
    teamSize,
    category,
    subcategories,
    builtWith,
    inspirationTags: [category, isHackathon ? "Hackathon/Demo" : "Indie", age <= 6 ? "Active in 6h" : "Recently active"],
    discoveredHoursAgo: updatedAge,
    publishedAt: repo.created_at.slice(0, 10),
    isOpenSource: true,
    isHackathon,
    isStudentProject: includesAny(text, ["student", "campus"]),
    isSoloProject: creatorType === "Solo Builder",
    likes: repo.stargazers_count,
    comments: repo.forks_count,
    stars: repo.stargazers_count,
    previewImageUrl: buildGithubOgPreviewUrl(repo),
    previewImageSource: "github-og",
    hasVisualEvidence,
    trendingScore,
    hotScore24h,
    hotDeltaStars24h,
    tasteScore,
    ...scores,
  };
}

function toProjectEmergency(repo: GithubSearchItem, semantic: RepoSemanticProfile | undefined): Project | null {
  const manualConfig = getManualConfig(repo.full_name);
  const description = (
    (repo.description ?? "").trim() ||
    manualConfig?.fallbackDescription ||
    `${repo.name} is an open-source project collected by the inspiration archive.`
  ).trim();
  if (!repo.name?.trim()) return null;

  const text = `${repo.name} ${description} ${(repo.topics ?? []).join(" ")} ${repo.full_name}`.toLowerCase();
  if (!isCurrentYearDate(repo.created_at)) return null;
  if (!isPinnedRepo(repo.full_name) && !isAiCreativeWork(text)) return null;

  const age = hoursAgoFromDate(repo.created_at);
  const updatedAge = hoursAgoFromDate(repo.updated_at);

  const category = manualConfig?.forcedCategory ?? detectCategory(text);
  const creatorType = inferCreatorType(text);
  const teamSize = creatorType === "Solo Builder" ? "1" : creatorType === "Small Team" ? "2-5" : "Open Source";
  const subcategories = inferSubcategories(text, category);
  const builtWith = inferBuiltWith(text, repo.language ?? "");
  const scores = scoreProject(repo, category);
  const isHackathon = includesAny(text, ["hackathon", "winner", "prize", "award"]);
  const projectTexts = buildProjectTexts(description, category, text, repo.name);
  const trendingScore = scoreTrending(repo);
  const hotDeltaStars24h = getRepoStarDelta24h(repo).delta;
  const hotScore24h = scoreHot24h(repo);
  const tasteScore = scorePersonalTaste(text, repo, semantic, category);
  const hasVisualEvidence = hasVisualEvidenceSignal(text, repo);
  const dynamicWhySuffix = `Project "${repo.name}" currently has ⭐${repo.stargazers_count}, has been active in the last ${updatedAge} hours, gained about ⭐${hotDeltaStars24h} in 24h, with 24h heat score ${hotScore24h.toFixed(2)} and trending score ${trendingScore.toFixed(1)}.`;

  return {
    id: `gh-${repo.id}`,
    slug: slugify(`${repo.name}-${repo.id}`),
    name: repo.name,
    tagline: projectTexts.tagline,
    summary: projectTexts.summary,
    whatItDoes: projectTexts.whatItDoes,
    whyInteresting: isHackathon
      ? `This project has hackathon/award signals, showing it validated a practical creative direction in a short time. ${projectTexts.whyInteresting} ${dynamicWhySuffix}`
      : `${projectTexts.whyInteresting} ${dynamicWhySuffix}`,
    source: "GitHub",
    sourceUrl: repo.html_url,
    projectUrl: repo.homepage?.trim() || repo.html_url,
    githubUrl: repo.html_url,
    creatorName: repo.owner.login,
    creatorType,
    teamSize,
    category,
    subcategories,
    builtWith,
    inspirationTags: [category, isHackathon ? "Hackathon/Demo" : "Indie", age <= 6 ? "Active in 6h" : "Recently active"],
    discoveredHoursAgo: updatedAge,
    publishedAt: repo.created_at.slice(0, 10),
    isOpenSource: true,
    isHackathon,
    isStudentProject: includesAny(text, ["student", "campus"]),
    isSoloProject: creatorType === "Solo Builder",
    likes: repo.stargazers_count,
    comments: repo.forks_count,
    stars: repo.stargazers_count,
    previewImageUrl: buildGithubOgPreviewUrl(repo),
    previewImageSource: "github-og",
    hasVisualEvidence,
    trendingScore,
    hotScore24h,
    hotDeltaStars24h,
    tasteScore,
    ...scores,
  };
}

function pickBalancedProjects(projects: Project[]) {
  const buckets: Record<ProjectCategory, Project[]> = {
    创意类: [],
    审美类: [],
    工具类: [],
  };

  for (const project of projects) {
    buckets[project.category].push(project);
  }
  for (const key of Object.keys(buckets) as ProjectCategory[]) {
    buckets[key].sort((a, b) => {
      if (b.tasteScore !== a.tasteScore) return b.tasteScore - a.tasteScore;
      if (b.hotDeltaStars24h !== a.hotDeltaStars24h) return b.hotDeltaStars24h - a.hotDeltaStars24h;
      if (b.trendingScore !== a.trendingScore) return b.trendingScore - a.trendingScore;
      if (b.stars !== a.stars) return b.stars - a.stars;
      return a.discoveredHoursAgo - b.discoveredHoursAgo;
    });
  }

  const result: Project[] = [];
  const minEach = 8;
  for (const key of Object.keys(buckets) as ProjectCategory[]) {
    result.push(...buckets[key].slice(0, minEach));
  }

  const used = new Set(result.map((item) => item.id));
  const remain = projects
    .filter((item) => !used.has(item.id))
    .sort((a, b) => {
      if (b.tasteScore !== a.tasteScore) return b.tasteScore - a.tasteScore;
      if (b.hotDeltaStars24h !== a.hotDeltaStars24h) return b.hotDeltaStars24h - a.hotDeltaStars24h;
      if (b.trendingScore !== a.trendingScore) return b.trendingScore - a.trendingScore;
      if (b.stars !== a.stars) return b.stars - a.stars;
      return a.discoveredHoursAgo - b.discoveredHoursAgo;
    });
  for (const item of remain) {
    if (result.length >= MAX_PROJECTS) break;
    result.push(item);
  }

  return result.slice(0, MAX_PROJECTS);
}

async function fetchProjects(): Promise<ProjectFeed> {
  const radarSlotIso = getCurrentEasternRadarSlotIso();
  await hydrateRememberedRepos();
  const archivedFeed = await readFeedArchive();
  if (archivedFeed?.projects.length && !lastSuccessfulFeed?.projects.length) {
    lastSuccessfulFeed = archivedFeed;
  }

  const fallbackFeed = (): ProjectFeed => {
    const projects = (archivedFeed?.projects ?? lastSuccessfulFeed?.projects ?? []).filter(isArchiveEligible);
    return {
      projects,
      updatedAt: radarSlotIso,
      fetchedCandidates: 0,
      keptProjects: projects.length,
    };
  };

  try {
    let rawRepos: GithubSearchItem[] = [];
    try {
      rawRepos = await fetchCandidateRepos();
    } catch {
      rawRepos = [];
    }

    if (!rawRepos.length) {
      const previous = lastSuccessfulFeed?.projects.length ? lastSuccessfulFeed : archivedFeed;
      if (previous?.projects.length) {
        return { ...previous, updatedAt: radarSlotIso };
      }
      const baseline = fallbackFeed();
      lastSuccessfulFeed = baseline;
      return baseline;
    }

    const repoDedupByCanonical = new Map<string, GithubSearchItem>();
    for (const repo of rawRepos) {
      const key = canonicalizeRepoFullName(repo.full_name);
      const existing = repoDedupByCanonical.get(key);
      if (!existing || repo.stargazers_count > existing.stargazers_count) {
        repoDedupByCanonical.set(key, repo);
      }
    }
    const repos = Array.from(repoDedupByCanonical.values()).filter((repo) =>
      isCurrentYearDate(repo.created_at),
    );
    rememberRepoStars(repos);
    const repoById = new Map(repos.map((repo) => [repo.id, repo]));
    const semanticProfiles = await buildRepoSemanticProfiles(repos);
    const projects = repos
      .map(
        (repo) =>
          toProject(repo, semanticProfiles.get(repo.id), true) ??
          toProjectEmergency(repo, semanticProfiles.get(repo.id)),
      )
      .filter((item): item is Project => Boolean(item));

    let kept = pickBalancedProjects(projects).filter(isArchiveEligible);
    try {
      await enrichProjectsWithPreview(kept, repoById);
    } catch {
      // Keep the projects even if thumbnail enrichment fails.
    }

    kept = mergeProjectLists(
      (archivedFeed?.projects ?? []).filter(isArchiveEligible),
      (lastSuccessfulFeed?.projects ?? []).filter(isArchiveEligible),
      kept,
    );
    if (kept.length > MAX_PROJECTS) {
      kept = kept.slice(0, MAX_PROJECTS);
    }

    const feed: ProjectFeed = {
      projects: kept,
      updatedAt: radarSlotIso,
      fetchedCandidates: repos.length,
      keptProjects: kept.length,
    };
    lastSuccessfulFeed = feed;
    await writeFeedArchive(feed);
    return feed;
  } catch {
    if (lastSuccessfulFeed?.projects.length) {
      return {
        ...lastSuccessfulFeed,
        updatedAt: radarSlotIso,
      };
    }
    if (archivedFeed?.projects.length) {
      lastSuccessfulFeed = archivedFeed;
      return {
        ...archivedFeed,
        updatedAt: radarSlotIso,
      };
    }
    return fallbackFeed();
  }
}

const getCachedProjectFeed = unstable_cache(fetchProjects, ["inspiration-feed-v40"], {
  revalidate: FEED_REVALIDATE_SECONDS,
  tags: ["github-inspiration-feed"],
});

export async function getProjectFeed(): Promise<ProjectFeed> {
  await hydrateRememberedRepos();
  const cached = await getCachedProjectFeed();
  const archived = await readFeedArchive();
  const projects = mergeProjectLists(archived?.projects, lastSuccessfulFeed?.projects, cached.projects).filter(
    isArchiveEligible,
  );
  const feed: ProjectFeed = {
    ...cached,
    projects,
    keptProjects: projects.length,
    fetchedCandidates: Math.max(cached.fetchedCandidates, archived?.fetchedCandidates ?? 0),
  };
  lastSuccessfulFeed = feed;
  await writeFeedArchive(feed);
  return feed;
}

export async function getAllProjects(): Promise<Project[]> {
  const feed = await getProjectFeed();
  const visible = feed.projects.filter((project) => project.stars >= DISPLAY_MIN_STARS && isArchiveEligible(project));
  const dedup = new Map<string, Project>();
  const rankProject = (project: Project) => {
    const nonFallbackBonus = project.id.startsWith("fallback-") ? 0 : 1000;
    const previewBonus =
      project.previewImageSource === "readme" ? 200 : project.previewImageSource === "website-snapshot" ? 120 : 0;
    const freshnessBonus = Math.max(0, 96 - project.discoveredHoursAgo);
    const starBonus = Math.min(80, Math.log10(project.stars + 1) * 20);
    return nonFallbackBonus + previewBonus + freshnessBonus + starBonus;
  };
  for (const project of visible) {
    const key = canonicalizeGithubUrl(project.sourceUrl || project.projectUrl || `${project.id}::${project.slug}`);
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, project);
      continue;
    }
    if (rankProject(project) > rankProject(existing)) {
      dedup.set(key, project);
    }
  }
  return Array.from(dedup.values());
}

export async function getProjectFeedDebug(limit = 120): Promise<ProjectFeedDebug> {
  const repos = await fetchCandidateRepos();
  rememberRepoStars(repos);
  const semanticProfiles = await buildRepoSemanticProfiles(repos);
  const strictProjects = repos
    .map(
      (repo) =>
        toProject(repo, semanticProfiles.get(repo.id), true) ??
        toProjectEmergency(repo, semanticProfiles.get(repo.id)),
    )
    .filter((item): item is Project => Boolean(item));

  const sortedCandidates = [...repos].sort((a, b) => {
    if (b.stargazers_count !== a.stargazers_count) return b.stargazers_count - a.stargazers_count;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const projects = strictProjects.sort((a, b) => {
    if (b.tasteScore !== a.tasteScore) return b.tasteScore - a.tasteScore;
    if (b.hotDeltaStars24h !== a.hotDeltaStars24h) return b.hotDeltaStars24h - a.hotDeltaStars24h;
    if (b.hotScore24h !== a.hotScore24h) return b.hotScore24h - a.hotScore24h;
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.trendingScore !== a.trendingScore) return b.trendingScore - a.trendingScore;
    return a.discoveredHoursAgo - b.discoveredHoursAgo;
  });

  return {
    fetchedCandidates: repos.length,
    keptProjects: projects.length,
    candidates: sortedCandidates.slice(0, limit).map((repo) => ({
      id: repo.id,
      fullName: repo.full_name,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      description: (repo.description ?? "").slice(0, 180),
    })),
    kept: projects.slice(0, limit).map((project) => ({
      id: project.id,
      name: project.name,
      category: project.category,
      stars: project.stars,
      trendingScore: project.trendingScore,
      hotScore24h: project.hotScore24h,
      hotDeltaStars24h: project.hotDeltaStars24h,
      tasteScore: project.tasteScore,
      publishedAt: project.publishedAt,
    })),
  };
}

export async function getFreshFinds(limit = 10): Promise<Project[]> {
  const projects = await getAllProjects();
  return [...projects]
    .sort((a, b) => a.discoveredHoursAgo - b.discoveredHoursAgo)
    .slice(0, limit);
}

export async function getHottestProjects(limit = 6): Promise<Project[]> {
  const projects = await getAllProjects();
  const within24h = projects.filter((project) => project.discoveredHoursAgo <= HOTTEST_WINDOW_HOURS);
  const source = within24h.length ? within24h : projects;
  return [...source]
    .sort((a, b) => {
      if (b.hotDeltaStars24h !== a.hotDeltaStars24h) return b.hotDeltaStars24h - a.hotDeltaStars24h;
      if (b.hotScore24h !== a.hotScore24h) return b.hotScore24h - a.hotScore24h;
      if (b.tasteScore !== a.tasteScore) return b.tasteScore - a.tasteScore;
      if (b.stars !== a.stars) return b.stars - a.stars;
      return a.discoveredHoursAgo - b.discoveredHoursAgo;
    })
    .slice(0, limit);
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const projects = await getAllProjects();
  return projects.find((project) => project.slug === slug);
}

export async function searchProjects(query: string): Promise<Project[]> {
  const normalized = query.trim().toLowerCase();
  const projects = await getAllProjects();
  if (!normalized) return projects;

  return projects.filter((project) => {
    const fields = [
      project.name,
      project.tagline,
      project.summary,
      project.category,
      ...project.subcategories,
      ...project.inspirationTags,
      project.creatorName,
    ];
    return fields.some((field) => field.toLowerCase().includes(normalized));
  });
}

export function getFreshBucketLabel(hoursAgo: number): string {
  if (hoursAgo <= 6) return "3-6 hours ago";
  if (hoursAgo <= 12) return "6-12 hours ago";
  if (hoursAgo <= 24) return "12-24 hours ago";
  if (hoursAgo <= 48) return "24-48 hours ago";
  return "over 48 hours ago";
}
