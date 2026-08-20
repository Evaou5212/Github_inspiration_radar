import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="paper mx-auto mt-8 max-w-3xl rule-l rule-r rule-b">
      <div className="px-2 py-2 md:px-3">
        <p className="utility text-muted">not found</p>
        <h1 className="title-xl mt-1">This page has expired or does not exist</h1>
      </div>
      <div className="rule-t px-2 py-2 md:px-3">
        <p className="text-[13px] leading-[1.2] text-muted">
        The feed refreshes on a schedule, so some older links may expire. You can return to the main feed and keep browsing.
        </p>
      </div>
      <div className="rule-t flex flex-wrap gap-1 px-2 py-2 md:px-3">
        <Link href="/" className="utility border border-rule bg-black px-2 py-1 text-white hover:text-white">
          back to main interface
        </Link>
        <Link href="/" className="utility border border-rule px-2 py-1 hover:bg-black hover:text-white">
          back home
        </Link>
      </div>
    </div>
  );
}
