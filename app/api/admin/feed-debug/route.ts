import { NextResponse } from "next/server";
import { getProjectFeed, getProjectFeedDebug } from "@/lib/projects";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret") ?? "";

  if (secret && providedSecret !== secret) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "120");
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 120;

  const [debug, cachedFeed] = await Promise.all([getProjectFeedDebug(safeLimit), getProjectFeed()]);
  const categoryCounts = cachedFeed.projects.reduce(
    (acc, project) => {
      acc[project.category] += 1;
      return acc;
    },
    { 创意类: 0, 审美类: 0, 工具类: 0 },
  );

  return NextResponse.json({
    ok: true,
    cached: {
      fetchedCandidates: cachedFeed.fetchedCandidates,
      keptProjects: cachedFeed.keptProjects,
      visibleProjects: cachedFeed.projects.length,
      categoryCounts,
      updatedAt: cachedFeed.updatedAt,
    },
    live: debug,
  });
}
