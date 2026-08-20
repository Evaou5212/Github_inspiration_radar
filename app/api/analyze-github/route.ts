import { NextResponse } from "next/server";

type AnalyzeRequestBody = {
  githubUrl?: string;
};

function parseGithubUrl(input: string) {
  try {
    const url = new URL(input.trim());
    if (!url.hostname.includes("github.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function decodeBase64Utf8(input: string) {
  return Buffer.from(input, "base64").toString("utf-8");
}

const CJK_REGEX = /[\u3400-\u9fff]/;

function toEnglishText(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").trim();
  if (!normalized) return fallback;
  if (CJK_REGEX.test(normalized)) return fallback;
  return normalized;
}

function analyzeText(text: string) {
  const normalized = text.toLowerCase();
  const tags = new Set<string>();

  const tagRules: Array<[string, RegExp]> = [
    ["website", /\b(web|site|landing|browser)\b/],
    ["game", /\b(game|unity|godot|unreal)\b/],
    ["interactive demo", /\b(demo|interactive|showcase|playground)\b/],
    ["app software", /\b(app|desktop|mobile|electron|tool)\b/],
    ["skill", /\b(skill|workflow|prompt|agent)\b/],
    ["design", /\b(design|ui|ux|typography|visual)\b/],
    ["creative coding", /\b(creative|p5|canvas|three|shader|generative)\b/],
    ["ai", /\b(ai|llm|model|inference|diffusion|gpt)\b/],
  ];

  for (const [tag, pattern] of tagRules) {
    if (pattern.test(normalized)) tags.add(tag);
  }

  const category =
    /\b(tool|app|workflow|automation|sdk)\b/.test(normalized)
      ? "tools"
      : /\b(aesthetic|visual|typography|style|art|gallery)\b/.test(normalized)
        ? "aesthetic"
        : "creative";

  const featureHints: Array<[RegExp, string, string]> = [
    [
      /\b(gesture|hand|camera|vision)\b/,
      "It explores spatial or camera-driven interaction as the main control surface instead of relying only on conventional interface widgets.",
      "Use body/camera input as a first-class interaction layer so the interface feels embodied, not just clickable.",
    ],
    [
      /\b(editor|image|photo|video)\b/,
      "It embeds AI or procedural effects inside a familiar editing context, making experimentation feel practical rather than detached.",
      "Layer generative effects directly into an existing editor flow to reduce friction between experimentation and production.",
    ],
    [
      /\b(three|webgl|shader|3d)\b/,
      "It treats visual rendering and interaction as one system, showing how spatial UI can communicate state more clearly.",
      "Let depth, motion, and camera transitions carry information hierarchy instead of overloading text labels.",
    ],
    [
      /\b(theme|style|customization|skin)\b/,
      "It turns customization into a creative activity, not a hidden settings panel.",
      "Make style personalization part of the core user journey rather than a post-setup option.",
    ],
    [
      /\b(workflow|automation|agent|tool)\b/,
      "It packages a narrow workflow into an immediately usable tool, showing strong scope discipline.",
      "Compress a multi-step process into one reliable operation users can run and then adapt.",
    ],
  ];

  const matched = featureHints.find(([rule]) => rule.test(normalized));
  const whatItDoes = matched
    ? matched[2]
    : "Extract one reusable interaction pattern from this project and repurpose it as a small module in your own creative workflow.";
  const whyRecommended = matched
    ? matched[1]
    : "Its structure and constraints suggest a concrete creative mechanism that can be learned from and reused, rather than a generic feature bundle.";

  return {
    category,
    tags: Array.from(tags),
    whatItDoes,
    whyRecommended,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequestBody;
    const githubUrl = body.githubUrl?.trim();
    if (!githubUrl) {
      return NextResponse.json({ error: "githubUrl is required" }, { status: 400 });
    }

    const parsed = parseGithubUrl(githubUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }

    const headers: HeadersInit = {
      Accept: "application/vnd.github+json",
      "User-Agent": "inspiration-hunt-analyzer",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
      headers,
      cache: "no-store",
    });
    if (!repoRes.ok) {
      return NextResponse.json({ error: "Repository fetch failed" }, { status: 400 });
    }
    const repo = await repoRes.json();

    let readmeText = "";
    const readmeRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`, {
      headers,
      cache: "no-store",
    });
    if (readmeRes.ok) {
      const readme = await readmeRes.json();
      if (readme?.content) {
        readmeText = decodeBase64Utf8(readme.content).slice(0, 8000);
      }
    }

    const baseText = `${repo?.name ?? ""}\n${repo?.description ?? ""}\n${(repo?.topics ?? []).join(" ")}\n${readmeText}`;
    const analyzed = analyzeText(baseText);
    const englishDescription = toEnglishText(
      repo?.description,
      "Repository description is not in English. The archive generated an English summary automatically.",
    );

    return NextResponse.json({
      name: repo?.name ?? parsed.repo,
      owner: repo?.owner?.login ?? parsed.owner,
      description: englishDescription,
      stars: repo?.stargazers_count ?? 0,
      forks: repo?.forks_count ?? 0,
      sourceUrl: repo?.html_url ?? githubUrl,
      projectUrl: repo?.homepage || repo?.html_url || githubUrl,
      previewImageUrl: `https://opengraph.githubassets.com/1/${parsed.owner}/${parsed.repo}`,
      updatedAt: repo?.updated_at ?? new Date().toISOString(),
      suggestedCategory: analyzed.category,
      suggestedTags: analyzed.tags,
      whatItDoes: analyzed.whatItDoes,
      whyRecommended: analyzed.whyRecommended,
    });
  } catch {
    return NextResponse.json({ error: "Unexpected analyze error" }, { status: 500 });
  }
}
