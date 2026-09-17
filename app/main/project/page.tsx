"use client";

import { Adduser, CreateProject, GetProject } from "@/ApiCalls/ProjectSetup/project";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProjectState } from "@/useStates/projectStates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRightIcon, CodeIcon, FolderPlusIcon, MagnifyingGlassIcon, PlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { SiteHeader } from "@/app/components/site-header";

interface ProjectItem {
  id: string;
  name: string;
  ownerId: string;
  description: string | null;
  language: string;
  createdAt: string;
}

function InviteDialog({ projectId, name }: { projectId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VIEWER");
  const mutation = useMutation({
    mutationFn: Adduser,
    onSuccess: () => { toast.success("Collaborator added"); setOpen(false); setEmail(""); },
  });
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger className="project-invite" onClick={() => mutation.reset()}><UsersThreeIcon size={17} aria-hidden="true" /> Invite collaborator</DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Invite a collaborator</DialogTitle><DialogDescription>Add an existing user to {name} by email.</DialogDescription></DialogHeader>
      <form className="dialog-form" onSubmit={event => { event.preventDefault(); mutation.mutate({ user: { email: email.trim(), role }, projectId }); }}>
        <div className="field"><label htmlFor={`invite-email-${projectId}`}>Email address</label><input id={`invite-email-${projectId}`} type="email" autoComplete="email" required placeholder="teammate@example.com" value={email} onChange={event => setEmail(event.target.value)} /></div>
        <div className="field"><label htmlFor={`invite-role-${projectId}`}>Project role</label><select id={`invite-role-${projectId}`} value={role} onChange={event => setRole(event.target.value)}><option value="VIEWER">Viewer</option><option value="EDITOR">Editor</option></select></div>
        {mutation.isError && <p role="alert" className="form-error">Could not add this collaborator. Check that they have an account and that you own this project.</p>}
        <DialogFooter><button className="primary-button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Adding..." : "Send invite"}</button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function Project() {
  const { setProjectId } = useProjectState();
  const [projectName, setProjectName] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<{ projects: ProjectItem[] }>({ queryKey: ["projects"], queryFn: GetProject, staleTime: 5 * 60 * 1000 });
  const mutation = useMutation({
    mutationFn: CreateProject,
    onSuccess: () => { toast.success("Project created"); setProjectName(""); setOpen(false); queryClient.invalidateQueries({ queryKey: ["projects"] }); },
  });
  const projects = data?.projects ?? [];
  const filtered = projects.filter(project => project.name.toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="site-page">
    <SiteHeader workspace />
    <main id="main-content" className="site-container workspace-main">
      <div className="workspace-heading">
        <div><h1>Your projects</h1><p>A place for the things you&apos;re building. Pick up where you left off.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="primary-button" onClick={() => mutation.reset()}><PlusIcon size={19} aria-hidden="true" /> Create project</DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a project</DialogTitle><DialogDescription>Start with a Next.js workspace. Give it a name you can find later.</DialogDescription></DialogHeader>
            <form className="dialog-form" onSubmit={event => { event.preventDefault(); if (projectName.trim()) mutation.mutate(projectName.trim()); }}>
              <div className="field"><label htmlFor="project-name">Project name</label><input id="project-name" required maxLength={100} placeholder="My next idea" value={projectName} onChange={event => setProjectName(event.target.value)} disabled={mutation.isPending} /></div>
              {mutation.isError && <p role="alert" className="form-error">Could not create the project. Please try again.</p>}
              <DialogFooter><button className="primary-button" type="submit" disabled={mutation.isPending || !projectName.trim()}>{mutation.isPending ? "Creating..." : "Create project"}</button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="workspace-toolbar">
        <p className="project-total">All projects {!isLoading && !error && <strong>({projects.length})</strong>}</p>
        <div className="project-search"><label htmlFor="project-search" className="sr-only">Search projects</label><MagnifyingGlassIcon size={18} aria-hidden="true" /><input id="project-search" type="search" className="search-input" placeholder="Search your projects" value={search} onChange={event => setSearch(event.target.value)} /></div>
      </div>
      {isLoading ? <div className="projects-grid" role="status"><span className="sr-only">Loading projects...</span>{[0, 1, 2].map(item => <div key={item} className="skeleton-card" aria-hidden="true"><div className="skeleton-block" /><div className="skeleton-block" /><div className="skeleton-block" /></div>)}</div>
        : error ? <div role="alert" className="empty-workspace"><h2>Couldn&apos;t load your projects.</h2><p>Your workspace is temporarily unavailable. Try again in a moment.</p><button className="secondary-button" onClick={() => refetch()}>Try again</button></div>
        : filtered.length ? <div className="projects-grid">{filtered.map(project => <article key={project.id} className="project-card">
          <Link href={`/main/project/${project.id}`} className="project-open" onClick={() => setProjectId(project.id, project.ownerId)}>
            <div className="project-top"><span className="project-symbol"><CodeIcon size={23} aria-hidden="true" /></span><ArrowUpRightIcon size={19} aria-hidden="true" /></div>
            <h2 title={project.name}>{project.name}</h2>
            <p className="project-card-description">{project.description || "Your next idea, in progress."}</p>
            <div className="project-meta"><span className="project-language">{project.language || "typescript"}</span><time dateTime={project.createdAt}>{new Date(project.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></div>
          </Link>
          <InviteDialog projectId={project.id} name={project.name} />
        </article>)}</div>
        : <div className="empty-workspace"><span className="project-symbol"><FolderPlusIcon size={24} aria-hidden="true" /></span><h2>{search ? "No matching projects." : "Make something of your own."}</h2><p>{search ? "Try a different name or clear your search to see all projects." : "Start a Next.js project, open the editor, and invite someone to build with you."}</p><button className="secondary-button" onClick={() => { if (search) setSearch(""); else { mutation.reset(); setOpen(true); } }}>{search ? "Clear search" : "Create project"}</button></div>}
    </main>
  </div>;
}
