import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllProjects, getProjectBySlug } from "@/lib/projects";

type ProjectPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const CJK_REGEX = /[\u3400-\u9fff]/;

function toEnglish(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").trim();
  if (!normalized) return fallback;
  if (CJK_REGEX.test(normalized)) return fallback;
  return normalized;
}

function toCategoryLabel(value: string) {
  if (value === "创意类") return "creative";
  if (value === "审美类") return "aesthetic";
  if (value === "工具类") return "tools";
  return value.toLowerCase();
}

function similarityScore(seedId: string, seedTags: string[], candidateId: string, candidateTags: string[], sameCategory: boolean) {
  if (seedId === candidateId) return -1;
  let score = 0;
  if (sameCategory) score += 3;
  const candidateSet = new Set(candidateTags.map((item) => item.toLowerCase()));
  for (const tag of seedTags) {
    if (candidateSet.has(tag.toLowerCase())) score += 2;
  }
  return score;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const allProjects = await getAllProjects();
  const related = allProjects
    .map((candidate) => ({
      project: candidate,
      score: similarityScore(
        project.id,
        [...project.inspirationTags, ...project.subcategories],
        candidate.id,
        [...candidate.inspirationTags, ...candidate.subcategories],
        project.category === candidate.category,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.project);

  const year = project.publishedAt.match(/20\d{2}/)?.[0] ?? "unknown";
  const momentumLabel =
    project.hotDeltaStars24h > 0
      ? `↑ +${project.hotDeltaStars24h} stars / 24h`
      : project.discoveredHoursAgo <= 24
        ? "Fresh this day"
        : "Stable archive";

  return (
    <main className="paper rule-l rule-r rule-b">
      <section className="rule-b px-2 py-2">
        <div className="utility text-muted">project detail / archive object</div>
        <h1 className="mt-1 text-[44px] font-bold leading-[0.95] tracking-[-0.03em]">{toEnglish(project.name, "Untitled project")}</h1>
        <p className="mt-1 text-[16px] leading-[1.4] text-muted">{toEnglish(project.tagline, "A focused project from the archive.")}</p>
      </section>

      <section className="grid md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rule-r p-2">
          <div className="border border-rule bg-[#ecebe5] p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.previewImageUrl}
              alt={`${project.name} preview`}
              className="aspect-[16/10] w-full bg-[#efeee8] object-contain object-center"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="mt-2 utility flex flex-wrap gap-2 text-muted">
            <span>#{project.id.replace(/^gh-/, "").slice(0, 6)}</span>
            <span>{year}</span>
            <span>★ {project.stars}</span>
            <span>{momentumLabel}</span>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">why it&apos;s interesting</p>
            <p className="mt-1 text-[16px] leading-[1.45]">
              {toEnglish(project.whyInteresting, "Interesting because it demonstrates a concrete creative mechanism that can be adapted into other projects.")}
            </p>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">idea to steal</p>
            <p className="mt-1 text-[16px] leading-[1.45]">
              Reuse the project&apos;s strongest interaction pattern as a standalone module inside your own workflow, rather than copying the full product surface.
            </p>
          </div>

          <div className="rule-t mt-2 pt-2">
            <p className="utility text-muted">links</p>
            <div className="mt-1 utility flex flex-wrap gap-2 text-muted">
              <Link href={project.sourceUrl} target="_blank" className="inline-flex items-center border border-rule px-1.5 py-0.5 hover:bg-black hover:text-white">
                ↗ github
              </Link>
              <Link href={project.projectUrl} target="_blank" className="inline-flex items-center border border-rule px-1.5 py-0.5 hover:bg-black hover:text-white">
                ↗ live demo
              </Link>
              <Link href="/" className="inline-flex items-center border border-rule px-1.5 py-0.5 hover:bg-black hover:text-white">
                ← back to archive
              </Link>
            </div>
          </div>
        </div>

        <aside className="p-2">
          <p className="utility text-muted">related projects</p>
          <div className="mt-1 space-y-1.5">
            {related.map((item, idx) => (
              <Link
                key={`related-${item.id}`}
                href={`/projects/${item.slug}`}
                className="block border border-rule px-1.5 py-1 hover:bg-black hover:text-white"
              >
                <p className="utility text-muted">{String(idx + 1).padStart(2, "0")} / {toCategoryLabel(item.category)}</p>
                <p className="text-[20px] font-bold leading-[1.02] tracking-[-0.02em]">{toEnglish(item.name, "project")}</p>
                <p className="meta mt-0.5 text-muted">★ {item.stars} · ↑{item.hotDeltaStars24h}</p>
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
