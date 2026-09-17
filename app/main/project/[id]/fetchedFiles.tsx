"use client";

import { GetProjectFolder } from "@/ApiCalls/ProjectSetup/project";
import { useProjectState } from "@/useStates/projectStates";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretRightIcon, FileCodeIcon, FilePlusIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

export type FileNode = { name: string; path: string; type: "file" | "folder"; content?: string; children?: FileNode[] };

export default function FileExplorer({ id, onFileSelected }: { id: string; onFileSelected?: () => void }) {
  const project = useProjectState(state => state.project);
  const files = useProjectState(state => state.files) as FileNode[];
  const setFiles = useProjectState(state => state.setFiles);
  const selectedFile = useProjectState(state => state.selectedFile);
  const setSelectedFile = useProjectState(state => state.setSelectedFile);
  const [folder, setFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");
  const ready = Boolean(project.ownerId && project.projectId === id);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["Files", project.ownerId, id], queryFn: () => GetProjectFolder(project.ownerId!, id), enabled: ready });

  useEffect(() => { if (data?.files) setFiles(normalizeTree(data.files)); }, [data?.files, setFiles]);

  function openFile(file: FileNode) {
    setSelectedFile({ name: file.name, path: file.path, content: file.content ?? "", type: "file" });
    onFileSelected?.();
  }
  function createNode() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) { setCreateError("Enter a name without folder separators."); return; }
    const path = folder ? folder + "/" + trimmed : trimmed;
    if (findNodeByPath(files, path)) { setCreateError("An item with this name already exists here."); return; }
    const node: FileNode = { name: trimmed, path, type: creating!, ...(creating === "file" ? { content: "" } : { children: [] }) };
    const updated = insertNode(files, folder, node);
    if (!updated) { setCreateError("That folder is no longer available. Select the project root."); return; }
    setFiles(updated); setCreating(null); setName(""); setCreateError(""); setSearch("");
    if (node.type === "file") openFile(node); else setFolder(path);
    toast.success(node.type === "file" ? "File created. Save to keep your changes." : "Folder created. Save to keep your changes.");
  }
  function startCreate(type: "file" | "folder") { setCreating(type); setName(""); setCreateError(""); }
  const filtered = filterTree(files, search.trim().toLowerCase());

  return <div className="file-explorer">
    <div className="explorer-heading"><h2>Explorer</h2><div className="preview-tools">
      <button type="button" className="pane-icon-button" aria-label="New file" title="New file" disabled={!ready || isLoading || isError} onClick={() => startCreate("file")}><FilePlusIcon size={18} aria-hidden="true" /></button>
      <button type="button" className="pane-icon-button" aria-label="New folder" title="New folder" disabled={!ready || isLoading || isError} onClick={() => startCreate("folder")}><FolderPlusIcon size={18} aria-hidden="true" /></button>
    </div></div>
    <div className="explorer-search"><label htmlFor="file-search" className="sr-only">Find a file</label><MagnifyingGlassIcon size={16} aria-hidden="true" /><input id="file-search" type="search" placeholder="Find a file..." value={search} onChange={event => setSearch(event.target.value)} /></div>
    <button type="button" className="explorer-root" onClick={() => setFolder(null)} title="Create new items in the project root"><FolderOpenIcon size={16} aria-hidden="true" /> Project root</button>
    {creating && <form className="create-file-form" onSubmit={event => { event.preventDefault(); createNode(); }}>
      <div className="create-file-heading"><label htmlFor="new-file-name">{creating === "file" ? "New file" : "New folder"}</label><button type="button" className="pane-icon-button" aria-label="Cancel creation" onClick={() => setCreating(null)}><XIcon size={16} aria-hidden="true" /></button></div>
      <p className="field-help">In {folder || "project root"}</p>
      <input id="new-file-name" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder={creating === "file" ? "index.tsx" : "components"} required />
      {createError && <p role="alert" className="form-error">{createError}</p>}
      <button className="secondary-button" type="submit">Create {creating}</button>
    </form>}
    <div className="file-tree-scroll">
      {!ready ? <div className="explorer-message"><p>Open this workspace from your projects to load its files.</p><Link href="/main/project" className="text-link">Your projects</Link></div>
        : isLoading ? <div role="status" className="explorer-message"><p>Loading files...</p>{[0, 1, 2, 3].map(item => <div key={item} className="skeleton-block" />)}</div>
        : isError ? <div role="alert" className="explorer-message"><p>Could not load project files.</p><button className="secondary-button" onClick={() => refetch()}>Try again</button></div>
        : !filtered.length ? <p className="explorer-message">{search ? "No matching files." : "No files yet. Create a file to start building."}</p>
        : <ul className="file-tree" aria-label="Files and folders">{filtered.map(node => <TreeNode key={node.path} node={node} selectedPath={selectedFile?.path} selectedFolder={folder} forceOpen={Boolean(search)} onFileClick={openFile} onFolderClick={setFolder} />)}</ul>}
    </div>
    <div className="explorer-footer" title={folder || "Project root"}>New items in: <span>{folder || "project root"}</span></div>
  </div>;
}

function TreeNode({ node, selectedPath, selectedFolder, forceOpen, onFileClick, onFolderClick }: { node: FileNode; selectedPath?: string; selectedFolder: string | null; forceOpen: boolean; onFileClick: (file: FileNode) => void; onFolderClick: (path: string) => void }) {
  const [expanded, setExpanded] = useState(Boolean(selectedPath?.startsWith(node.path + "/")));
  const open = expanded || forceOpen;
  const isFolder = node.type === "folder";
  const selected = isFolder ? selectedFolder === node.path : selectedPath === node.path;
  return <li>
    <button type="button" className="file-tree-item" data-selected={selected} aria-current={!isFolder && selected ? "true" : undefined} aria-expanded={isFolder ? open : undefined} title={node.path} onClick={() => { if (isFolder) { setExpanded(!expanded); onFolderClick(node.path); } else onFileClick(node); }}>
      {isFolder ? <><CaretRightIcon size={12} className={open ? "folder-caret open" : "folder-caret"} aria-hidden="true" />{open ? <FolderOpenIcon size={17} aria-hidden="true" /> : <FolderIcon size={17} aria-hidden="true" />}</> : <FileCodeIcon size={17} className="tree-file-icon" aria-hidden="true" />}
      <span>{node.name}</span>
    </button>
    {isFolder && open && <ul>{node.children?.map(child => <TreeNode key={child.path} node={child} selectedPath={selectedPath} selectedFolder={selectedFolder} forceOpen={forceOpen} onFileClick={onFileClick} onFolderClick={onFolderClick} />)}</ul>}
  </li>;
}

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes;
  return nodes.flatMap(node => {
    if (node.name.toLowerCase().includes(query)) return [node];
    const children = filterTree(node.children ?? [], query);
    return children.length ? [{ ...node, children }] : [];
  });
}

function normalizeTree(
  nodes: FileNode[],
  parentPath = ""
): FileNode[] {
  return nodes.map(
    (node) => {
      const currentPath =
        parentPath
          ? `${parentPath}/${node.name}`
          : node.name;

      if (
        node.type === "folder"
      ) {
        return {
          ...node,

          path: currentPath,

          children:
            normalizeTree(
              node.children ?? [],
              currentPath
            ),
        };
      }

      return {
        ...node,
        path: currentPath,
      };
    }
  );
}

// =====================================================
// FIND NODE BY FULL PATH
// =====================================================

function findNodeByPath(
  nodes: FileNode[],
  targetPath: string
): FileNode | null {
  for (const node of nodes) {
    if (
      node.path === targetPath
    ) {
      return node;
    }

    if (
      node.type === "folder" &&
      node.children
    ) {
      const found =
        findNodeByPath(
          node.children,
          targetPath
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}

// =====================================================
// INSERT NODE
// =====================================================

function insertNode(
  nodes: FileNode[],
  folderPath: string | null,
  newNode: FileNode
): FileNode[] | null {
  // ===================================================
  // ROOT
  // ===================================================

  if (!folderPath) {
    if (
      nodes.some(
        (node) =>
          node.name ===
          newNode.name
      )
    ) {
      return null;
    }

    return [
      ...nodes,
      newNode,
    ];
  }

  // ===================================================
  // FIND TARGET FOLDER
  // ===================================================

  let foundFolder =
    false;

  const updated =
    nodes.map((node) => {

      // =================================================
      // TARGET FOLDER
      // =================================================

      if (
        node.type === "folder" &&
        node.path === folderPath
      ) {
        foundFolder = true;

        const children =
          node.children ?? [];

        if (
          children.some(
            (child) =>
              child.name ===
              newNode.name
          )
        ) {
          return node;
        }

        return {
          ...node,

          children: [
            ...children,
            newNode,
          ],
        };
      }

      // =================================================
      // RECURSIVE SEARCH
      // =================================================

      if (
        node.type === "folder" &&
        node.children
      ) {
        const childResult =
          insertNode(
            node.children,
            folderPath,
            newNode
          );

        if (childResult) {
          foundFolder = true;

          return {
            ...node,

            children:
              childResult,
          };
        }
      }

      return node;
    });

  // ===================================================
  // FOLDER NOT FOUND
  // ===================================================

  if (!foundFolder) {
    return null;
  }

  return updated;
}
