import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "./site-header";

export function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="site-page">
    <SiteHeader />
    <main id="main-content" className="site-container auth-layout">
      <aside className="auth-story">
        <Link href="/auth" className="text-link"><ArrowLeftIcon size={17} aria-hidden="true" /> Back to WebWeaver</Link>
        <h2>Good ideas.<br />Built together.</h2>
        <p>A shared editor, your project files, and a place to see what comes next.</p>
        <Image src="/images/collaboration-weave.png" alt="Green and silver ribbons woven into a single sculpture" width={700} height={700} className="auth-art" sizes="(max-width: 767px) 1px, 40vw" />
      </aside>
      <section className="auth-form-panel" aria-labelledby="auth-title">
        <div className="auth-form-inner">
          <h1 id="auth-title">{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  </div>;
}
