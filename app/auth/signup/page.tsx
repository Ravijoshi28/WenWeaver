"use client";

import { SignUpCall } from "@/ApiCalls/auth/authenticate";
import {  useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignUp() {
  const router=useRouter();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const mutation=useMutation({
   mutationFn:SignUpCall,
   
  onSuccess: () => {
    toast.success(
      "Successful! We have sent a code to your email. Please verify your email to use our platform."
    );
    router.push("/auth/verify-email")
  },

  onError: () => {
    toast.error("Something went wrong. Please try again later.");
  },
});

  const Login=(e:React.FormEvent<HTMLFormElement>)=>{
      e.preventDefault();

     mutation.mutate(formData)

     
  }


  return (
    <main  className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="rounded-full bg-cyan-500/10 px-4 py-1 text-sm font-medium text-cyan-400">
            Welcome
          </span>

          <h1 className="mt-5 text-3xl font-bold text-slate-100">
            Create Your Workspace
          </h1>

          <p className="mt-3 text-slate-400">
            Sign up to access your cloud development environment, collaborate
            with your team, and start coding instantly from your browser.
          </p>
        </div>

        {/* Form */}
        <form className="space-y-5" onSubmit={Login}>
          <div>
            <label
              htmlFor="username"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Username
            </label>

            <input
              id="username"
              required
              type="text"
              minLength={3}
              placeholder="Enter your username"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          <div>
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
              required
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              minLength={8}
              placeholder="Create a strong password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              } required
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-cyan-500 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-[0.98]"
          >
            Create Account
          </button>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <a
            href="/auth/login"
            className="font-medium text-cyan-400 transition hover:text-cyan-300"
          >
            Sign In
          </a>
        </p>
        <Link href="/auth/verify-email">verify your email to join platform</Link>
      </div>
    </main>
  );
}