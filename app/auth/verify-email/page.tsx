"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { sendOTP, VerifyCall } from "@/ApiCalls/auth/authenticate";
import { AuthFrame } from "@/app/components/auth-frame";

export default function VerifyEmail() {
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const mutation = useMutation({ mutationFn: VerifyCall });
  const resend = useMutation({ mutationFn: sendOTP });
  return <AuthFrame title="One last step." description="Request a code, then verify your email to open your workspace.">
    <form className="form-stack" onSubmit={event => { event.preventDefault(); mutation.mutate({ otp, email }); }}>
      <div className="field"><label htmlFor="verify-email">Email address</label><input ref={emailInput} id="verify-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={event => { setEmail(event.target.value); mutation.reset(); resend.reset(); }} /></div>
      <div className="field"><label htmlFor="verification-code">Verification code</label><input id="verification-code" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={6} pattern="[0-9]{6}" required className="otp-input" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} /><p className="field-help">Use the code sent to your registered email.</p></div>
      {mutation.isError && <p role="alert" className="form-error">The code could not be verified. Check it or request a new one.</p>}
      {mutation.isSuccess && <p role="status" className="form-success">Email verified. <Link href="/auth/login">Continue to Sign In</Link></p>}
      <button type="submit" className="primary-button full-width" disabled={mutation.isPending || resend.isPending || mutation.isSuccess}>{mutation.isPending ? "Verifying..." : "Verify email"}</button>
    </form>
    <button type="button" className="secondary-button full-width resend-button" disabled={resend.isPending || mutation.isPending || mutation.isSuccess} onClick={() => { if (emailInput.current?.reportValidity()) resend.mutate(email); }}>{resend.isPending ? "Sending..." : "Resend OTP"}</button>
    {resend.isError && <p role="alert" className="form-error">Could not send the code. Please try again.</p>}
    {resend.isSuccess && <p role="status" className="form-success">Code requested. Check your inbox.</p>}
    <p className="form-footer">Already verified? <Link href="/auth/login">Sign In</Link></p>
  </AuthFrame>;
}
