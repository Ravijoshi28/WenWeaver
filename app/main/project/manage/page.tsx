"use client";

import {
  GetProject,
  DeleteProject,
} from "@/ApiCalls/ProjectSetup/project";

import { TrashIcon } from "@phosphor-icons/react";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

interface ProjectItem {
  color: string;
  createdAt: string;
  description: string | null;
  icon: string | null;
  id: string;
  isPublic: boolean;
  language: string;
  lastOpenedAt: string | null;
  name: string;
  ownerId: string;
  template: string;
  updatedAt: string;
}

interface GetProjectResponse {
  projects: ProjectItem[];
}

export default function Page() {
  const queryClient = useQueryClient();

  const {
    data: projectList,
    isLoading,
    error,
  } = useQuery<GetProjectResponse>({
    queryKey: ["projects"],
    queryFn: GetProject,
  });

  const mutation = useMutation({
    mutationFn: DeleteProject,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
    },

    onError: (error) => {
      console.error("Failed to delete project:", error);
    },
  });

  const deleteProject = (id: string) => {
    mutation.mutate(id);
  };

  

  if (error) {
    return (
      <section className="min-h-screen bg-blue-900 p-6">
        <h1 className="text-2xl font-bold text-black">
          Manage All Your Created Projects in One Place
        </h1>

        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-400">
          Failed to load projects.
        </div>
      </section>
    );
  }

  const projects = projectList?.projects ?? [];

  return (
    <section className="min-h-screen bg-slate-900 p-6">
      <h1 className="text-2xl font-bold text-white">
        Manage All Your Created Projects in One Place
      </h1>

        {isLoading ? (
  <section className="min-h-screen bg-blue-900 p-6">
    <h1 className="text-2xl font-bold text-black">
      Manage All Your Created Projects in One Place
    </h1>

    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-40 animate-pulse rounded-xl border border-slate-800 bg-slate-900"
        />
      ))}
    </div>
  </section>
) : (
  projects.length === 0 ? (
    <div className="mt-6 rounded-xl border border-white bg-slate-900 p-8 text-center">
      <div className="text-4xl">📁</div>

      <h2 className="mt-3 text-lg font-semibold text-slate-200">
        No projects yet
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Create your first project to see it here.
      </p>
    </div>
  ) : (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((proj) => (
        <div
          key={proj.id}
          className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left shadow-md transition hover:border-blue-500/50 hover:bg-slate-800/80"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">
              {proj.icon || "📁"}
            </span>

            {proj.createdAt && (
              <span className="text-xs text-slate-500">
                {new Date(proj.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>

          <h3 className="mt-3 truncate text-lg font-semibold text-slate-100">
            {proj.name}
          </h3>

          {proj.description && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">
              {proj.description}
            </p>
          )}

          {proj.language && (
            <span className="mt-3 inline-block rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
              {proj.language}
            </span>
          )}

          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => deleteProject(proj.id)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <TrashIcon size={20} />

            {mutation.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      ))}
    </div>
  )
)}

    </section>
  );
}