"use client";

import { GetProjectFolder } from "@/ApiCalls/ProjectSetup/project";
import { useProjectState } from "@/useStates/projectStates";

import { useQuery } from "@tanstack/react-query";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { toast } from "sonner";

// =====================================================
// FILE TYPE
// =====================================================

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

// =====================================================
// FILE EXPLORER
// =====================================================

export default function FileExplorer({
  id,
}: {
  id: string;
}) {
  // ===================================================
  // ZUSTAND
  // ===================================================

  const project = useProjectState(
    (state) => state.project
  );

  const files = useProjectState(
    (state) => state.files
  ) as FileNode[];

  const setFiles = useProjectState(
    (state) => state.setFiles
  );

  const setSelectedFile =
    useProjectState(
      (state) => state.setSelectedFile
    );

  // ===================================================
  // SELECTED FOLDER
  // ===================================================

  const [
    selectedFolderPath,
    setSelectedFolderPath,
  ] = useState<string | null>(null);

  // ===================================================
  // PROJECT ID
  // ===================================================

  const pid =
    id ?? project?.projectId;

  // ===================================================
  // FETCH FILES
  // ===================================================

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      "Files",
      project?.ownerId,
      pid,
    ],

    queryFn: () =>
      GetProjectFolder(
        project.ownerId!,
        pid
      ),

    enabled: Boolean(
      project?.ownerId && pid
    ),
  });

  // ===================================================
  // LOAD FILES
  // ===================================================

  useEffect(() => {
    if (!data?.files) {
      return;
    }

    const normalizedFiles =
      normalizeTree(data.files);

    setFiles(normalizedFiles);
  }, [
    data?.files,
    setFiles,
  ]);

  // ===================================================
  // ERROR
  // ===================================================

  useEffect(() => {
    if (isError) {
      toast.error(
        "Error fetching files"
      );
    }
  }, [isError]);

  // ===================================================
  // FILE CLICK
  // ===================================================

  const handleFileClick =
    useCallback(
      (file: FileNode) => {
        if (
          file.type !== "file"
        ) {
          return;
        }

        console.log(
          "Selected file:",
          file.path
        );

        setSelectedFile({
          name: file.name,
          path: file.path,
          content:
            file.content ?? "",
          type: "file",
        });
      },
      [setSelectedFile]
    );

  // ===================================================
  // FOLDER CLICK
  // ===================================================

  const handleFolderClick =
    useCallback(
      (folderPath: string) => {
        setSelectedFolderPath(
          folderPath
        );
      },
      []
    );

  // ===================================================
  // CREATE FILE
  // ===================================================

  const handleCreateFile =
    useCallback(() => {
      const name =
        window.prompt(
          "File name",
          "page.tsx"
        );

      if (!name) {
        return;
      }

      const trimmedName =
        name.trim();

      if (!trimmedName) {
        return;
      }

      if (
        trimmedName.includes("/") ||
        trimmedName.includes("\\")
      ) {
        toast.error(
          "Enter only the file name"
        );

        return;
      }

      const parentPath =
        selectedFolderPath ?? "";

      const newPath =
        parentPath
          ? `${parentPath}/${trimmedName}`
          : trimmedName;

      if (
        findNodeByPath(
          files,
          newPath
        )
      ) {
        toast.error(
          `"${newPath}" already exists`
        );

        return;
      }

      const newFile: FileNode = {
        name: trimmedName,
        path: newPath,
        type: "file",
        content: "",
      };

      const updatedFiles =
        insertNode(
          files,
          selectedFolderPath,
          newFile
        );

      if (!updatedFiles) {
        toast.error(
          "Selected folder was not found"
        );

        return;
      }

      setFiles(updatedFiles);

      setSelectedFile({
        name: newFile.name,
        path: newFile.path,
        content: "",
        type: "file",
      });

      toast.success(
        `Created ${newPath}`
      );
    }, [
      files,
      selectedFolderPath,
      setFiles,
      setSelectedFile,
    ]);

  // ===================================================
  // CREATE FOLDER
  // ===================================================

  const handleCreateFolder =
    useCallback(() => {
      const name =
        window.prompt(
          "Folder name",
          "components"
        );

      if (!name) {
        return;
      }

      const trimmedName =
        name.trim();

      if (!trimmedName) {
        return;
      }

      if (
        trimmedName.includes("/") ||
        trimmedName.includes("\\")
      ) {
        toast.error(
          "Enter only the folder name"
        );

        return;
      }

      const parentPath =
        selectedFolderPath ?? "";

      const newPath =
        parentPath
          ? `${parentPath}/${trimmedName}`
          : trimmedName;

      if (
        findNodeByPath(
          files,
          newPath
        )
      ) {
        toast.error(
          `"${newPath}" already exists`
        );

        return;
      }

      const newFolder: FileNode = {
        name: trimmedName,
        path: newPath,
        type: "folder",
        children: [],
      };

      const updatedFiles =
        insertNode(
          files,
          selectedFolderPath,
          newFolder
        );

      if (!updatedFiles) {
        toast.error(
          "Selected folder was not found"
        );

        return;
      }

      setFiles(updatedFiles);

      setSelectedFolderPath(
        newPath
      );

      toast.success(
        `Created ${newPath}`
      );
    }, [
      files,
      selectedFolderPath,
      setFiles,
    ]);

  // ===================================================
  // ERROR UI
  // ===================================================

  if (isError) {
    return (
      <div className="flex h-full flex-col bg-[#0a0d14]">

        <div className="flex h-10 items-center border-b border-white/[0.06] px-3">

          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Explorer
          </span>

        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/10 bg-red-500/5">

            <svg
              className="h-5 w-5 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path
                d="M12 9v4"
                strokeLinecap="round"
              />

              <path
                d="M12 17h.01"
                strokeLinecap="round"
                strokeWidth="2.5"
              />

              <path
                d="M10.3 4.4 2.9 17a2 2 0 0 0 1.73 3h14.74a2 2 0 0 0 1.73-3L13.7 4.4a2 2 0 0 0-3.4 0Z"
                strokeLinejoin="round"
              />
            </svg>

          </div>

          <div>

            <p className="text-xs font-medium text-gray-300">
              Failed to load files
            </p>

            <p className="mt-1 text-[10px] text-gray-600">
              Unable to fetch the project
              workspace.
            </p>

          </div>

        </div>
      </div>
    );
  }

  // ===================================================
  // UI
  // ===================================================

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0d14] text-white">

      {/* =================================================
          EXPLORER HEADER
      ================================================= */}

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0d111a] px-3">

        {/* BRAND */}

        <div className="flex items-center gap-2.5">

          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.03]">

            <img
              src="/logo.png"
              alt="WebWeaver"
              className="h-5 w-5 object-contain"
            />

          </div>

          <div className="flex flex-col">

            <span className="text-xs font-semibold tracking-tight text-gray-200">
              WebWeaver
            </span>

            <span className="text-[9px] uppercase tracking-widest text-gray-600">
              Explorer
            </span>

          </div>

        </div>

        {/* ACTIONS */}

        <div className="flex items-center gap-1">

          {/* NEW FILE */}

          <button
            type="button"
            onClick={
              handleCreateFile
            }
            title={
              selectedFolderPath
                ? `New file in ${selectedFolderPath}`
                : "New file in root"
            }
            className="group flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-gray-500 transition-all hover:border-white/[0.07] hover:bg-white/[0.05] hover:text-gray-200"
          >

            <svg
              className="h-3.5 w-3.5 transition-transform group-hover:scale-110"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
                strokeLinejoin="round"
              />

              <path
                d="M14 2v6h6"
                strokeLinejoin="round"
              />

              <path
                d="M12 12v5M9.5 14.5h5"
                strokeLinecap="round"
              />
            </svg>

          </button>

          {/* NEW FOLDER */}

          <button
            type="button"
            onClick={
              handleCreateFolder
            }
            title={
              selectedFolderPath
                ? `New folder in ${selectedFolderPath}`
                : "New folder in root"
            }
            className="group flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-gray-500 transition-all hover:border-white/[0.07] hover:bg-white/[0.05] hover:text-gray-200"
          >

            <svg
              className="h-3.5 w-3.5 transition-transform group-hover:scale-110"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path
                d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                strokeLinejoin="round"
              />

              <path
                d="M12 10v5M9.5 12.5h5"
                strokeLinecap="round"
              />
            </svg>

          </button>

        </div>

      </div>

      {/* =================================================
          CURRENT FOLDER
      ================================================= */}

      <div className="flex h-8 shrink-0 items-center border-b border-white/[0.05] bg-[#0b0f17] px-3">

        <div className="flex min-w-0 items-center gap-1.5">

          <svg
            className="h-3 w-3 shrink-0 text-gray-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path
              d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
              strokeLinejoin="round"
            />
          </svg>

          <span className="truncate text-[10px] text-gray-600">
            {selectedFolderPath
              ? `Creating in: ${selectedFolderPath}`
              : "Creating in: root"}
          </span>

        </div>

      </div>

      {/* =================================================
          TREE AREA
      ================================================= */}

      {isLoading ? (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Loading skeleton */}

          <div className="space-y-2 p-3">

            {[1, 2, 3, 4, 5, 6].map(
              (item) => (
                <div
                  key={item}
                  className="flex items-center gap-2"
                >

                  <div className="h-3.5 w-3.5 animate-pulse rounded bg-white/[0.05]" />

                  <div
                    className="h-3 animate-pulse rounded bg-white/[0.05]"
                    style={{
                      width: `${45 + item * 9}px`,
                    }}
                  />

                </div>
              )
            )}

          </div>

        </div>
      ) : (
        <div className="relative flex-1 overflow-auto bg-[#0a0d14] p-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/[0.08]">

          {/* Subtle background */}

          <div
            className="pointer-events-none absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px)",
              backgroundSize:
                "100% 24px",
            }}
          />

          <div className="relative">

            <FileTree
              nodes={files ?? []}
              onFileClick={
                handleFileClick
              }
              onFolderClick={
                handleFolderClick
              }
            />

          </div>

        </div>
      )}

      {/* =================================================
          FOOTER
      ================================================= */}

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.05] bg-[#0b0f17] px-3">

        <span className="text-[9px] text-gray-700">
          {files?.length ?? 0} items
        </span>

        <span className="text-[9px] text-gray-700">
          Workspace
        </span>

      </div>

    </div>
  );
}

// =====================================================
// FILE TREE
// =====================================================

function FileTree({
  nodes,
  onFileClick,
  onFolderClick,
}: {
  nodes: FileNode[];

  onFileClick: (
    file: FileNode
  ) => void;

  onFolderClick: (
    path: string
  ) => void;
}) {
  return (
    <div className="space-y-0.5">

      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          onFileClick={
            onFileClick
          }
          onFolderClick={
            onFolderClick
          }
        />
      ))}

    </div>
  );
}

// =====================================================
// TREE NODE
// =====================================================

function TreeNode({
  node,
  onFileClick,
  onFolderClick,
}: {
  node: FileNode;

  onFileClick: (
    file: FileNode
  ) => void;

  onFolderClick: (
    path: string
  ) => void;
}) {
  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  // ===================================================
  // FOLDER
  // ===================================================

  if (
    node.type === "folder"
  ) {
    return (
      <div>

        <div
          onClick={() => {
            setIsOpen(
              (previous) =>
                !previous
            );

            onFolderClick(
              node.path
            );
          }}
          className="group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-400 transition-all duration-150 hover:bg-white/[0.05] hover:text-gray-200"
        >

          {/* CHEVRON */}

          <svg
            className={`h-3 w-3 shrink-0 text-gray-600 transition-transform duration-150 ${
              isOpen
                ? "rotate-90"
                : ""
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="m9 18 6-6-6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* FOLDER ICON */}

          {isOpen ? (
            <svg
              className="h-3.5 w-3.5 shrink-0 text-amber-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path
                d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              className="h-3.5 w-3.5 shrink-0 text-amber-400/80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path
                d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* NAME */}

          <span className="min-w-0 truncate">
            {node.name}
          </span>

        </div>

        {/* CHILDREN */}

        {isOpen &&
          node.children &&
          node.children.length >
            0 && (
            <div className="ml-[9px] border-l border-white/[0.06] pl-2">

              <FileTree
                nodes={
                  node.children
                }
                onFileClick={
                  onFileClick
                }
                onFolderClick={
                  onFolderClick
                }
              />

            </div>
          )}

      </div>
    );
  }

  // ===================================================
  // FILE
  // ===================================================

  return (
    <div
      onClick={() =>
        onFileClick(node)
      }
      title={node.path}
      className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-500 transition-all duration-150 hover:bg-blue-500/[0.08] hover:text-gray-200"
    >

      {/* FILE ICON */}

      <svg
        className="h-3.5 w-3.5 shrink-0 text-blue-400/70 transition-colors group-hover:text-blue-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
          strokeLinejoin="round"
        />

        <path
          d="M14 2v6h6"
          strokeLinejoin="round"
        />
      </svg>

      {/* NAME */}

      <span className="min-w-0 truncate">
        {node.name}
      </span>

    </div>
  );
}

// =====================================================
// NORMALIZE TREE
// =====================================================

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