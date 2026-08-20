import { getAllProjects, getProjectFeed } from "@/lib/projects";

export default async function AdminPage() {
  const [feed, projects] = await Promise.all([getProjectFeed(), getAllProjects()]);
  const published = projects.length;
  const filteredOut = Math.max(feed.fetchedCandidates - published, 0);
  const newCandidates = published + filteredOut;
  const categoryLabel = (value: string) =>
    value === "创意类" ? "creative" : value === "审美类" ? "aesthetic" : value === "工具类" ? "tools" : value;

  return (
    <div className="paper rule-l rule-r rule-b">
      <section className="rule-b px-2 py-2 md:px-3">
        <h1 className="title-xl">Admin Moderation</h1>
        <p className="mt-1 text-[13px] leading-[1.2] text-muted">
          Review crawler candidates and keep low-quality or irrelevant projects out of the main feed.
        </p>
      </section>

      <section className="grid rule-b md:grid-cols-3">
        <div className="px-2 py-2 md:px-3">
          <p className="utility text-muted">new candidates</p>
          <p className="mt-1 text-[22px] font-bold leading-none">{newCandidates}</p>
        </div>
        <div className="rule-l px-2 py-2 md:px-3">
          <p className="utility text-muted">published</p>
          <p className="mt-1 text-[22px] font-bold leading-none">{published}</p>
        </div>
        <div className="rule-l px-2 py-2 md:px-3">
          <p className="utility text-muted">rejected</p>
          <p className="mt-1 text-[22px] font-bold leading-none">{filteredOut}</p>
        </div>
      </section>

      <section className="overflow-x-auto">
        <table className="min-w-full text-left text-[12px]">
          <thead className="rule-b utility text-muted">
            <tr>
              <th className="px-2 py-1.5">Project</th>
              <th className="px-2 py-1.5">Source</th>
              <th className="px-2 py-1.5">Category</th>
              <th className="px-2 py-1.5">Stars</th>
              <th className="px-2 py-1.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="light-rule-b">
                <td className="px-2 py-1.5">{project.name}</td>
                <td className="px-2 py-1.5 text-muted">{project.source}</td>
                <td className="px-2 py-1.5 text-muted">{categoryLabel(project.category)}</td>
                <td className="px-2 py-1.5 text-muted">{project.stars.toLocaleString()}</td>
                <td className="px-2 py-1.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="utility border border-rule px-1.5 py-1 hover:bg-black hover:text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="utility border border-rule px-1.5 py-1 hover:bg-black hover:text-white"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="utility border border-rule px-1.5 py-1 hover:bg-black hover:text-white"
                    >
                      Feature
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
