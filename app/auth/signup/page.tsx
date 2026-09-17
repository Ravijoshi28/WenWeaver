"use client";

import { SignUpCall } from "@/ApiCalls/auth/authenticate";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { AuthFrame } from "@/app/components/auth-frame";

export default function SignUp() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const mutation = useMutation({ mutationFn: SignUpCall, onSuccess: () => router.push("/auth/verify-email") });
  return <AuthFrame title="Make room for your ideas." description="Create an account to start your first project.">
    <form className="form-stack" onSubmit={event => { event.preventDefault(); mutation.mutate(formData); }}>
      <div className="field"><label htmlFor="username">Username</label><input id="username" name="name" type="text" autoComplete="username" placeholder="Your username" minLength={3} required value={formData.name} onChange={event => setFormData({ ...formData, name: event.target.value })} /></div>
      <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={formData.email} onChange={event => setFormData({ ...formData, email: event.target.value })} /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" placeholder="Create a password" minLength={8} required aria-describedby="password-help" value={formData.password} onChange={event => setFormData({ ...formData, password: event.target.value })} /><p id="password-help" className="field-help">Use at least 8 characters.</p></div>
      {mutation.isError && <p role="alert" className="form-error">Could not create your account. Please try again or sign in if you already have one.</p>}
      <button type="submit" className="primary-button full-width" disabled={mutation.isPending} aria-busy={mutation.isPending}>{mutation.isPending ? "Creating account..." : "Create Account"}<ArrowRightIcon size={18} aria-hidden="true" /></button>
    </form>
    <p className="form-footer">Already have an account? <Link href="/auth/login">Sign In</Link></p>
    <Link href="/auth/verify-email" className="form-secondary-link">Already signed up? Verify your email</Link>
  </AuthFrame>;
}
