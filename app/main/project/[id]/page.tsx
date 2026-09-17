"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { MainEditor } from "../../Editor/Monaco";
import FileExplorer from "./fetchedFiles";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { useWorkspacePreferences } from "@/app/components/use-workspace-preferences";

export default function MainFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { compact } = useWorkspacePreferences();
  const [explorerOverride, setExplorerOverride] = useState<boolean | null>(null);
  const explorerOpen = explorerOverride ?? !compact;
  return <div className="ide-shell">
    <header className="ide-header">
      <div className="ide-brand-group">
        <Link href="/main/project" className="icon-button" aria-label="Back to projects" title="Back to projects"><ArrowLeftIcon size={18} aria-hidden="true" /></Link>
        <Link href="/main/project" className="wordmark">WebWeaver</Link>
        <span className="ide-header-label">Workspace</span>
      </div>
      <div className="ide-header-actions">
        <button type="button" className="secondary-button" onClick={() => setExplorerOverride(!explorerOpen)} aria-expanded={explorerOpen} aria-controls="file-explorer"><SidebarSimpleIcon size={18} aria-hidden="true" /> Files</button>
        <ThemeToggle />
      </div>
    </header>
    <div className="ide-body" data-explorer-open={explorerOpen}>
      <aside id="file-explorer" className="ide-sidebar" aria-label="Project files" hidden={!explorerOpen}>
        <FileExplorer key={id} id={id} onFileSelected={() => { if (compact) setExplorerOverride(false); }} />
      </aside>
      <main id="main-content" className="ide-main"><h1 className="sr-only">Project workspace</h1><MainEditor key={id} /></main>
    </div>
  </div>;
}
