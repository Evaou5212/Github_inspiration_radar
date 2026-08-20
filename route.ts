import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getProjectFeed } from "@/lib/projects";

function getEasternTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  return { year, month, day, hour, minute };
}

function isEasternRadarSlot(date = new Date()) {
  const { hour, minute } = getEasternTimeParts(date);
  const slotHours = new Set([0, 6, 12, 18]);
  return slotHours.has(hour) && minute <= 12;
}

function formatEasternTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerSecret = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";
  const urlSecret = new URL(request.url).searchParams.get("secret") ?? "";
  const forceRefresh = new URL(request.url).searchParams.get("force") === "1";
  const providedSecret = headerSecret || bearerSecret || urlSecret;

  if (secret && providedSecret !== secret) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const isVercelCron = Boolean(authHeader && bearerSecret && secret && bearerSecret === secret);
  if (!forceRefresh && !isVercelCron && !isEasternRadarSlot()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: "Skipped: not in ET radar slots (00/06/12/18).",
      nowEastern: formatEasternTimestamp(),
    });
  }

  revalidateTag("github-inspiration-feed", "max");
  revalidatePath("/");
  const feed = await getProjectFeed();
  const categoryCounts = feed.projects.reduce(
    (acc, project) => {
      acc[project.category] += 1;
      return acc;
    },
    { 创意类: 0, 审美类: 0, 工具类: 0 },
  );

  return NextResponse.json({
    ok: true,
    message: "GitHub inspiration feed cache revalidated",
    revalidatedAt: new Date().toISOString(),
    revalidatedAtEastern: formatEasternTimestamp(),
    fetchedCandidates: feed.fetchedCandidates,
    keptProjects: feed.keptProjects,
    visibleProjects: feed.projects.length,
    categoryCounts,
  });
}
