"use client";

import { LoginCall } from "@/ApiCalls/auth/authenticate";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { toast } from "sonner";

interface data{
  email:string,
  password:string
}

export default function Login() {

  const router=useRouter();
  const [formData, setFormData] = useState<data>({
    email: "",
    password: "",
  });

    const mutation=useMutation({
      mutationFn:LoginCall,
      onSuccess:()=>{
        toast.success("User successfully logged in");
        router.push('/main')
      },

      onError:(error:string)=>{
        console.log(error);
        toast.error("Something went wrong");
      }
    })
  
  const Submit=(e:React.FormEvent<HTMLFormElement>)=>{
          e.preventDefault();
      mutation.mutate(
        formData
      )

  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="rounded-full bg-cyan-500/10 px-4 py-1 text-sm font-medium text-cyan-400">
            Welcome Back
          </span>

          <h1 className="mt-5 text-3xl font-bold text-slate-100">
            Sign In to Your Workspace
          </h1>

          <p className="mt-3 text-slate-400">
            Access your cloud terminal, continue your projects, and collaborate
            with your team from anywhere.
          </p>
        </div>

        {/* Form */}
        <form className="space-y-5" onSubmit={Submit}>
          <div>{mutation.data && (<p>{mutation.data?.message}</p>)}
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Email Address
            </label>

            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-sm font-medium text-slate-300"
              >
                Password
              </label>

              <a
                href="/forgot-password"
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                Forgot Password?
              </a>
            </div>

            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-cyan-500 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-[0.98]"
          >
            Sign In
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center">
          <div className="h-px flex-1 bg-slate-700"></div>
          <span className="mx-4 text-sm text-slate-500">OR</span>
          <div className="h-px flex-1 bg-slate-700"></div>
        </div>

        {/* Google Button */}
        <button
          className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 font-medium text-slate-200 transition hover:border-cyan-400 hover:bg-slate-700"
        >
          Continue with Google
        </button>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-slate-400">
          Don't have an account?{" "}
          <a
            href="/auth/signup"
            className="font-medium text-cyan-400 transition hover:text-cyan-300"
          >
            Create Account
          </a>
        </p>
      </div>
    </main>
  );
}