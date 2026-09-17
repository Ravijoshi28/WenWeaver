"use client";

import { GetProject, DeleteProject } from "@/ApiCalls/ProjectSetup/project";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftIcon, CodeIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SiteHeader } from "@/app/components/site-header";

interface ProjectItem { id: string; name: string; description: string | null; language: string; createdAt: string; }

export default function Page() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<{ projects: ProjectItem[] }>({ queryKey: ["projects"], queryFn: GetProject });
  const mutation = useMutation({
    mutationFn: DeleteProject,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project deleted"); },
    onError: () => toast.error("Could not delete the project. Please try again."),
  });
  const projects = data?.projects ?? [];
  return <div className="site-page">
    <SiteHeader workspace />
    <main id="main-content" className="site-container workspace-main">
      <Link href="/main/project" className="text-link manage-back"><ArrowLeftIcon size={17} aria-hidden="true" /> Back to projects</Link>
      <div className="workspace-heading"><div><h1>Manage projects</h1><p>Review your workspaces and remove the ones you no longer need.</p></div></div>
      {error ? <div role="alert" className="empty-workspace"><h2>Couldn&apos;t load your projects.</h2><p>Please try again in a moment.</p><button className="secondary-button" onClick={() => refetch()}>Try again</button></div>
        : isLoading ? <div className="projects-grid" role="status"><span className="sr-only">Loading projects...</span>{[0, 1, 2].map(item => <div key={item} className="skeleton-card" aria-hidden="true"><div className="skeleton-block" /><div className="skeleton-block" /><div className="skeleton-block" /></div>)}</div>
        : !projects.length ? <div className="empty-workspace"><span className="project-symbol"><CodeIcon size={24} aria-hidden="true" /></span><h2>No projects yet.</h2><p>Your projects will appear here once you create a workspace.</p><Link href="/main/project" className="primary-button">Go to workspace</Link></div>
        : <div className="projects-grid">{projects.map(project => <article key={project.id} className="project-card manage-card">
          <div className="project-top"><span className="project-symbol"><CodeIcon size={23} aria-hidden="true" /></span><span className="project-language">{project.language || "typescript"}</span></div>
          <h2 title={project.name}>{project.name}</h2>
          <p className="project-card-description">{project.description || "Your collaborative development workspace."}</p>
          <div className="project-meta"><time dateTime={project.createdAt}>Created {new Date(project.createdAt).toLocaleDateString()}</time></div>
          <button type="button" className="danger-button" disabled={mutation.isPending} onClick={() => mutation.mutate(project.id)} aria-label={`Delete ${project.name}`}><TrashIcon size={18} aria-hidden="true" />{mutation.isPending && mutation.variables === project.id ? "Deleting..." : "Delete project"}</button>
        </article>)}</div>}
    </main>
  </div>;
}
