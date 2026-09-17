import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CodeIcon, UsersThreeIcon, PlayIcon, FolderSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "../components/site-header";

export default function LandingPage() {
  return <div className="site-page">
    <SiteHeader />
    <main id="main-content">
      <section className="site-container landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">A shared space for your code</p>
          <h1>Build something.<br /><span>Together.</span></h1>
          <p className="hero-description">Write code, collaborate in real time, and preview your next idea. All in your browser.</p>
          <div className="hero-actions">
            <Link href="/auth/signup" className="primary-button">Get Started <ArrowRightIcon size={19} aria-hidden="true" /></Link>
            <a href="#features" className="text-link">Learn More <ArrowRightIcon size={18} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="hero-art">
          <Image src="/images/collaboration-weave.png" alt="Interwoven green and silver ribbons representing collaborative work" width={1254} height={1254} preload sizes="(max-width: 767px) 100vw, 50vw" />
        </div>
      </section>
      <section id="features" className="site-container feature-section">
        <div className="section-heading">
          <h2>Less setup.<br />More building.</h2>
          <p>Keep your project, your teammates, and your next change in one workspace.</p>
        </div>
        <div className="feature-layout">
          <article className="feature-main">
            <div className="feature-icon"><UsersThreeIcon size={25} aria-hidden="true" /></div>
            <h3>Same file. Shared focus.</h3>
            <p>Work in the same project with live edits and collaborator cursors, powered by Yjs and Monaco.</p>
            <Image src="/collab.gif" alt="Illustration of people collaborating at their computers" width={900} height={600} className="collaboration-image" unoptimized sizes="(max-width: 767px) 100vw, 55vw" />
          </article>
          <div className="feature-details">
            <article><CodeIcon size={26} aria-hidden="true" /><h3>A familiar place to code.</h3><p>Open your files in Monaco, with syntax highlighting and the editing tools you already know.</p></article>
            <article><PlayIcon size={26} aria-hidden="true" /><h3>See your changes run.</h3><p>Launch a Next.js preview in Vercel Sandbox and see your project outside the editor.</p></article>
            <article><FolderSimpleIcon size={26} aria-hidden="true" /><h3>Pick up where you left off.</h3><p>Save files to cloud storage and keep your projects organized in one workspace.</p></article>
          </div>
        </div>
      </section>
      <section className="site-container landing-close">
        <h2>Your next idea<br />starts with a file.</h2>
        <Link href="/auth/signup" className="primary-button">Get Started <ArrowRightIcon size={19} aria-hidden="true" /></Link>
      </section>
    </main>
    <footer className="site-container site-footer"><Link href="/auth" className="wordmark">WebWeaver</Link><p>A place to build together.</p><span>&copy; {new Date().getFullYear()} WebWeaver</span></footer>
  </div>;
}
