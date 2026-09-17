"use client";

import { LoginCall } from "@/ApiCalls/auth/authenticate";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { AuthFrame } from "@/app/components/auth-frame";

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const mutation = useMutation({ mutationFn: LoginCall, onSuccess: () => router.push("/main") });
  return <AuthFrame title="Welcome back." description="Sign in and get back to what you were building.">
    <form className="form-stack" onSubmit={event => { event.preventDefault(); mutation.mutate(formData); }}>
      <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={formData.email} onChange={event => setFormData({ ...formData, email: event.target.value })} /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required value={formData.password} onChange={event => setFormData({ ...formData, password: event.target.value })} /></div>
      {mutation.isError && <p role="alert" className="form-error">Could not sign in. Check your details and make sure your email is verified.</p>}
      <button type="submit" className="primary-button full-width" disabled={mutation.isPending} aria-busy={mutation.isPending}>{mutation.isPending ? "Signing in..." : "Sign In"}<ArrowRightIcon size={18} aria-hidden="true" /></button>
    </form>
    <p className="form-footer">Don&apos;t have an account? <Link href="/auth/signup">Create Account</Link></p>
    <Link href="/auth/verify-email" className="form-secondary-link">Need to verify your email?</Link>
  </AuthFrame>;
}
