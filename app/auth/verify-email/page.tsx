"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendOTP, VerifyCall } from "@/ApiCalls/auth/authenticate";
export default function VerifyEmail() {
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn:VerifyCall,
    onSuccess: (res) => {
      toast.success(res?.message);
    },

    onError: () => {
      toast.error("Invalid OTP or OTP expired");
    },
  });

  const resendMutation = useMutation({
  mutationFn: sendOTP,

  onSuccess: (res) => {
    toast.success("OTP sent again");
  },

  onError: () => {
    toast.error("Failed to resend OTP");
  },
});

  const resendOTP = (e:any) => {
    
    console.log(email)
  resendMutation.mutate(email);
};

  const submit = () => {
    if (otp.length !== 6) {
      toast.error("OTP must be 6 digits");
      return;
    }

    mutation.mutate({otp,email});
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-bold text-slate-100">
          Verify Your Email
        </h1>

        <p className="mt-2 text-slate-400">
          Enter the verification code sent to your email.
        </p>

        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-6 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-cyan-400"
           required/>

        <input
          type="text"
          placeholder="Enter OTP"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-center text-xl tracking-[0.5em] text-white outline-none focus:border-cyan-400"
        />

        <button
          onClick={submit}
          disabled={mutation.isPending}
          className="mt-5 w-full rounded-xl bg-cyan-500 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
        >
          {mutation.isPending ? "Verifying..." : "Verify"}
        </button>
         <button
  onClick={resendOTP}
  disabled={resendMutation.isPending}
>
  {resendMutation.isPending ? "Sending..." : "Resend OTP"}
</button>
      </div>
     
    </main>
  );
}