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

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

export default function FileExplorer({
  id,
}: {
  id: string;
}) {
  const project = useProjectState(
    (state) => state.project
  );

  const files = useProjectState(
    (state) => state.files
  ) as FileNode[];

  const setFiles = useProjectState(
    (state) => state.setFiles
  );

  const setSelectedFile = useProjectState(
    (state) => state.setSelectedFile
  );

  /*
   * This stores the FULL path of the selected folder.
   *
   * null = root
   *
   * Examples:
   *
   * null
   * app
   * app/components
   * app/dashboard
   */
  const [selectedFolderPath, setSelectedFolderPath] =
    useState<string | null>(null);

  const pid =
    id ?? project?.projectId;

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      "project-files",
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

  /*
   * =========================================================
   * LOAD FILES
   * =========================================================
   */

  useEffect(() => {
    if (!data?.files) {
      return;
    }

    /*
     * Normalize backend files so EVERY node has
     * a unique full path.
     */
    const normalizedFiles =
      normalizeTree(data.files);

    setFiles(normalizedFiles);
  }, [
    data?.files,
    setFiles,
  ]);

  /*
   * =========================================================
   * ERROR
   * =========================================================
   */

  useEffect(() => {
    if (isError) {
      toast.error(
        "Error fetching files"
      );
    }
  }, [isError]);

  /*
   * =========================================================
   * FILE CLICK
   * =========================================================
   */

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

        /*
         * IMPORTANT:
         *
         * Do NOT identify the file only by:
         *
         * file.name
         *
         * because:
         *
         * app/page.tsx
         * dashboard/page.tsx
         *
         * both have name = "page.tsx".
         *
         * The path is the real identity.
         */
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

  /*
   * =========================================================
   * FOLDER CLICK
   * =========================================================
   */

  const handleFolderClick =
    useCallback(
      (folderPath: string) => {
        setSelectedFolderPath(
          folderPath
        );
      },
      []
    );

  /*
   * =========================================================
   * CREATE FILE
   * =========================================================
   */

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

      /*
       * Prevent "/" inside a file name.
       *
       * A path should be created by selecting
       * the folder, not by typing:
       *
       * app/page.tsx
       */
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

      /*
       * Check by FULL PATH.
       *
       * This means:
       *
       * app/page.tsx
       *
       * and
       *
       * dashboard/page.tsx
       *
       * are completely different files.
       */
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

      /*
       * Automatically select the new file.
       */
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

  /*
   * =========================================================
   * CREATE FOLDER
   * =========================================================
   */

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

      /*
       * Check FULL PATH.
       */
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

      /*
       * Select the newly created folder.
       */
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

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (isLoading) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        Loading files...
      </div>
    );
  }

  /*
   * =========================================================
   * ERROR
   * =========================================================
   */

  if (isError) {
    return (
      <div className="p-3 text-sm text-red-500">
        Failed to load files.
      </div>
    );
  }

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <div className="flex h-full flex-col">

      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">

        <span className="text-sm font-medium">
          Explorer
        </span>

        <div className="flex items-center gap-1">

          {/* New File */}
          <button
            type="button"
            onClick={handleCreateFile}
            title={
              selectedFolderPath
                ? `New file in ${selectedFolderPath}`
                : "New file in root"
            }
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
          >
            📄
          </button>

          {/* New Folder */}
          <button
            type="button"
            onClick={handleCreateFolder}
            title={
              selectedFolderPath
                ? `New folder in ${selectedFolderPath}`
                : "New folder in root"
            }
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
          >
            📁
          </button>

        </div>
      </div>

      {/* Current folder */}
      <div className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
        {selectedFolderPath
          ? `Creating in: ${selectedFolderPath}`
          : "Creating in: root"}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2">
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
  );
}

/*
 * =========================================================
 * FILE TREE
 * =========================================================
 */

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
    <div>
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

/*
 * =========================================================
 * TREE NODE
 * =========================================================
 */

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

  /*
   * =======================================================
   * FOLDER
   * =======================================================
   */

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
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
        >
          <span>
            {isOpen
              ? "📂"
              : "📁"}
          </span>

          <span>
            {node.name}
          </span>
        </div>

        {isOpen &&
          node.children &&
          node.children.length >
            0 && (
            <div className="ml-4 border-l pl-2">

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

  /*
   * =======================================================
   * FILE
   * =======================================================
   */

  return (
    <div
      onClick={() =>
        onFileClick(node)
      }
      title={node.path}
      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent hover:text-blue-500"
    >
      <span>📄</span>

      <span>
        {node.name}
      </span>
    </div>
  );
}

/*
 * =========================================================
 * NORMALIZE TREE
 * =========================================================
 *
 * Converts backend data like:
 *
 * [
 *   {
 *     name: "app",
 *     type: "folder",
 *     children: [
 *       {
 *         name: "page.tsx",
 *         type: "file"
 *       }
 *     ]
 *   }
 * ]
 *
 * into:
 *
 * app
 *   path: "app"
 *
 * app/page.tsx
 *   path: "app/page.tsx"
 */

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

/*
 * =========================================================
 * FIND NODE BY FULL PATH
 * =========================================================
 */

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

/*
 * =========================================================
 * INSERT NODE
 * =========================================================
 *
 * folderPath = null
 * -> insert at root
 *
 * folderPath = "app"
 * -> insert into app
 *
 * folderPath = "app/components"
 * -> insert into app/components
 */

function insertNode(
  nodes: FileNode[],
  folderPath: string | null,
  newNode: FileNode
): FileNode[] | null {

  /*
   * ROOT
   */
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

  /*
   * Find target folder by
   * FULL PATH.
   */
  let foundFolder =
    false;

  const updated =
    nodes.map((node) => {

      /*
       * This is the target folder.
       */
      if (
        node.type === "folder" &&
        node.path === folderPath
      ) {
        foundFolder = true;

        const children =
          node.children ?? [];

        /*
         * Duplicate check is
         * ONLY inside this folder.
         */
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

      /*
       * Recursively search
       * nested folders.
       */
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

  if (!foundFolder) {
    return null;
  }

  return updated;
}
