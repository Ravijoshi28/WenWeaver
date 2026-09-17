import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ workspace = false }: { workspace?: boolean }) {
  return <header className="site-header">
    <div className="site-container header-inner">
      <Link href="/auth" className="wordmark" aria-label="WebWeaver home">WebWeaver</Link>
      <nav aria-label="Main navigation" className="header-nav">
        {workspace ? <>
          <Link href="/main/project">Your projects</Link>
          <Link href="/main/project/manage" className="secondary-nav">Manage projects</Link>
        </> : <>
          <Link href="/auth#features" className="secondary-nav">Features</Link>
          <Link href="/auth/login">Sign In</Link>
        </>}
        <ThemeToggle />
      </nav>
    </div>
  </header>;
}
