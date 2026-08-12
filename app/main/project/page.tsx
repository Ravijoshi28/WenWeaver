"use client";

import { Adduser, CreateProject, GetProject } from "@/ApiCalls/ProjectSetup/project";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProjectState } from "@/useStates/projectStates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {useRouter} from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

//Shape of user
interface User{
  email:string,
  role:string
}

// Shape of a Project item
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Project() {
  const {setProjectId}=useProjectState()
  const [projectName, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [addUser,setUser]=useState<User>({
    email:"",
    role:"VIEWER"
  })
  const queryClient = useQueryClient();
  const router=useRouter();
  // Fetch projects list
  const { data, isLoading, error } = useQuery<{ projects: ProjectItem[] }>({
    queryKey: ["projects"],
    queryFn: GetProject,
    staleTime: 5 * 60 * 1000,
  });

  // Mutation for creating a project
  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const [result] = await Promise.all([
        CreateProject(name),
        delay(2500)
      ]);
      return result;
    },

    onSuccess: () => {
      toast.success("Project successfully created");
      setName("");
      setOpen(false);
      // Automatically re-fetch projects list
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },

    onError: (error: any) => {
      console.error(error);
      toast.error(error?.message || "Internal server error");
    },
  });

  const NewProgram = () => {
    if (!projectName.trim()) {
      toast.error("Project name is required");
      return;
    }

    mutation.mutate(projectName);
  };

  const projectsList = data?.projects || [];

  const setProject=(id:string,ownerId:string)=>{
    setProjectId(id,ownerId)
    router.push(`/main/project/${id}`)
  }

  const mutation2=useMutation({
    mutationFn:Adduser,
    onSuccess:()=>{
      toast.success("user added successfully")
    },
    onError:(error)=>{
      toast.error("server error ")
      console.log(error)
    }
  })

  const searchUser = (user:User, projectId: string) => {
  mutation2.mutate({
    user: user,
    projectId,
  });
};

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-20">

        {/* Header Section */}
        <div className="text-center">
          <div className="text-6xl">🚀</div>
          <h1 className="text-3xl font-bold mt-5">Welcome to Your Workspace</h1>
          <p className="mt-3 text-slate-400">
            {projectsList.length === 0 && !isLoading
              ? "You don't have any programs yet. Create your first program to start building."
              : "Manage and navigate your existing workspace programs below."}
          </p>
        </div>

        {/* Action / Trigger Button */}
        <div className="mt-10 flex justify-center">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="border-2 border-blue-400 p-2 px-4 rounded-2xl hover:bg-blue-500/10 transition hover:cursor-pointer font-medium">
              + Create New Program
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Project Name</DialogTitle>
                <DialogDescription>Enter your project name.</DialogDescription>
              </DialogHeader>

              <input
                value={projectName}
                onChange={(e) => setName(e.target.value)}
                disabled={mutation.isPending}
                className="p-2 border-2 border-blue-400 focus:border-blue-800 rounded-2xl w-full disabled:opacity-50 text-black dark:text-white"
                placeholder="Project Name"
              />

              <DialogFooter>
                <button
                  onClick={NewProgram}
                  disabled={mutation.isPending}
                  className="border-2 border-blue-500 rounded-2xl p-2 disabled:opacity-50 flex items-center justify-center min-w-[100px]"
                >
                  {mutation.isPending ? (
                    <img src="/loading.gif" alt="Loading..." className="h-6 w-6 bg-black" />
                  ) : (
                    "Submit"
                  )}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="ml-4 border-2 border-blue-400 p-2 px-4 rounded-2xl hover:bg-blue-500/10 transition hover:cursor-pointer font-medium">
         <Link href="/main/project/manage"> Manage your project</Link>
        </div>
        </div>
        

        {/* Dynamic Content: Loading, Error, Projects List, or Default Features */}
        {isLoading ? (
          <div className="mt-12 text-center text-slate-400">
            Loading projects...
          </div>
        ) : error ? (
          <div className="mt-12 text-center text-red-400">
            Failed to load projects. Please try refreshing.
          </div>
        ) : projectsList.length > 0 ? (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4 text-slate-200">Your Projects</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projectsList.map((proj) => (
                <div  key={proj.id} 
                className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-blue-500/50 hover:bg-slate-800/80 shadow-md"
>
                <div
                 
                  onClick={()=>setProject(proj?.id,proj?.ownerId)}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-blue-500/50 hover:bg-slate-800/80 shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{proj.icon || "📁"}</span>
                    {proj.createdAt && (
                      <span className="text-xs text-slate-500">
                        {new Date(proj.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-lg mt-3 text-slate-100 truncate">
                    {proj.name}
                  </h3>
                  {proj.language && (
                    <span className="inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {proj.language}
                    </span>
                  )}
                </div>
                
                 <br />
                  <Dialog>
                    <DialogTrigger className="p-1.5 hover:border-2 hover:border-blue-800 rounded-2xl">
                  Invite Member
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                          <h4>Add members to collab in real time</h4>
                          <p>One member at a time</p>
                      </DialogHeader>
                          <input value={addUser.email}
                          onChange={(e)=>setUser({...addUser,email:e.target.value})} placeholder="search email"
                          className="rounded-2xl focus:border-b-amber-200 border-2 p-1.5"></input>

                          <select value={addUser.role} onChange={(e)=>setUser({...addUser,role:e.target.value})}>
                            <option value="VIEWER">Viewer</option>
                            <option value="EDITOR">Editor</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                      <DialogFooter>
                          <button className="border-2 rounded-2xl p-1.5" onClick={()=>searchUser(addUser,proj.id)}>Invite</button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Default Empty State Cards */
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 text-center">
              <h3 className="font-semibold">Create</h3>
              <p className="mt-2 text-sm text-slate-400">
                Start a new program with a single click.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 text-center">
              <h3 className="font-semibold">Manage</h3>
              <p className="mt-2 text-sm text-slate-400">
                Keep your files and projects organized.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 text-center">
              <h3 className="font-semibold">Collaborate</h3>
              <p className="mt-2 text-sm text-slate-400">
                Work with your team from anywhere.
              </p>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}