import { create } from "zustand";
import {
  persist,
  createJSONStorage,
} from "zustand/middleware";

/* =========================================================
   FILE TYPES
========================================================= */

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

/* =========================================================
   SELECTED FILE
========================================================= */

export type SelectedFile = {
  name: string;
  path: string;
  content: string;
  type: "file";
};

/* =========================================================
   PROJECT STATE
========================================================= */

interface ProjectState {
  project: {
    projectId: string | null;
    ownerId: string | null;
  };

  files: FileNode[];

  selectedFile: SelectedFile | null;

  setProjectId: (
    id: string,
    ownerId: string
  ) => void;

  setFiles: (
    files: FileNode[]
  ) => void;

  setSelectedFile: (
    file: SelectedFile | null
  ) => void;

  updateFileContent: (
    filePath: string,
    content: string
  ) => void;

  getFileByPath: (
    filePath: string
  ) => FileNode | null;

  clearProject: () => void;
}

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function normalizePath(
  value?: string
): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

/* =========================================================
   UPDATE FILE TREE
========================================================= */

function updateFileTree(
  nodes: FileNode[],
  targetPath: string,
  content: string,
  parentPath = ""
): {
  files: FileNode[];
  updated: boolean;
} {
  const normalizedTarget =
    normalizePath(targetPath);

  let updated = false;

  const updatedNodes =
    nodes.map((node) => {
      const currentPath =
        normalizePath(
          parentPath
            ? `${parentPath}/${node.name}`
            : node.name
        );

      /* =====================================================
         FILE
      ===================================================== */

      if (
        node.type === "file" &&
        currentPath === normalizedTarget
      ) {
        updated = true;

        return {
          ...node,
          path: currentPath,
          content,
        };
      }

      /* =====================================================
         FOLDER
      ===================================================== */

      if (
        node.type === "folder" &&
        Array.isArray(node.children)
      ) {
        const result =
          updateFileTree(
            node.children,
            normalizedTarget,
            content,
            currentPath
          );

        if (result.updated) {
          updated = true;
        }

        return {
          ...node,
          path: currentPath,
          children: result.files,
        };
      }

      return {
        ...node,
        path: currentPath,
      };
    });

  return {
    files: updatedNodes,
    updated,
  };
}

/* =========================================================
   FIND FILE
========================================================= */

function findFile(
  nodes: FileNode[],
  targetPath: string,
  parentPath = ""
): FileNode | null {
  const normalizedTarget =
    normalizePath(targetPath);

  for (const node of nodes) {
    const currentPath =
      normalizePath(
        parentPath
          ? `${parentPath}/${node.name}`
          : node.name
      );

    if (
      node.type === "file" &&
      currentPath === normalizedTarget
    ) {
      return {
        ...node,
        path: currentPath,
      };
    }

    if (
      node.type === "folder" &&
      Array.isArray(node.children)
    ) {
      const result =
        findFile(
          node.children,
          normalizedTarget,
          currentPath
        );

      if (result) {
        return result;
      }
    }
  }

  return null;
}

/* =========================================================
   ZUSTAND STORE
========================================================= */

export const useProjectState =
  create<ProjectState>()(
    persist(
      (set, get) => ({
        /* ===================================================
           PROJECT
        =================================================== */

        project: {
          projectId: null,
          ownerId: null,
        },

        /* ===================================================
           FILES
        =================================================== */

        files: [],

        /* ===================================================
           SELECTED FILE
        =================================================== */

        selectedFile: null,

        /* ===================================================
           SET PROJECT
        =================================================== */

        setProjectId: (
          id,
          ownerId
        ) => {
          set({
            project: {
              projectId: id,
              ownerId,
            },
          });
        },

        /* ===================================================
           SET FILES
        =================================================== */

        setFiles: (
          files
        ) => {
          set({
            files,
          });

          /*
           * Keep selectedFile synchronized
           * with the new file tree.
           */

          const selected =
            get().selectedFile;

          if (!selected) {
            return;
          }

          const updatedSelected =
            findFile(
              files,
              selected.path
            );

          if (!updatedSelected) {
            return;
          }

          set({
            selectedFile: {
              name:
                updatedSelected.name,

              path:
                normalizePath(
                  updatedSelected.path
                ),

              content:
                updatedSelected.content ??
                "",

              type: "file",
            },
          });
        },

        /* ===================================================
           SELECT FILE
        =================================================== */

        setSelectedFile: (
          file
        ) => {
          if (!file) {
            set({
              selectedFile: null,
            });

            return;
          }

          set({
            selectedFile: {
              ...file,
              path:
                normalizePath(
                  file.path
                ),
            },
          });

        },

        /* ===================================================
           UPDATE FILE CONTENT
        =================================================== */

        updateFileContent: (
          filePath,
          content
        ) => {
          const normalizedPath =
            normalizePath(filePath);

          const currentFiles =
            get().files;

          const result =
            updateFileTree(
              currentFiles,
              normalizedPath,
              content
            );

          if (!result.updated) {
            console.warn("Operation failed in useStates/projectStates.ts.");

            return;
          }

          const selected =
            get().selectedFile;

          set({
            files:
              result.files,

            selectedFile:
              selected &&
              normalizePath(
                selected.path
              ) === normalizedPath
                ? {
                    ...selected,

                    path:
                      normalizedPath,

                    content,
                  }
                : selected,
          });

        },

        /* ===================================================
           GET FILE
        =================================================== */

        getFileByPath: (
          filePath
        ) => {
          return findFile(
            get().files,
            normalizePath(filePath)
          );
        },

        /* ===================================================
           CLEAR PROJECT
        =================================================== */

        clearProject: () => {
          set({
            project: {
              projectId: null,
              ownerId: null,
            },

            files: [],

            selectedFile: null,
          });
        },
      }),

      /* =====================================================
         PERSIST
      ===================================================== */

      {
        name: "project-storage",

        storage:
          createJSONStorage(
            () => sessionStorage
          ),

        version: 3,

        migrate: (
          persistedState: any,
          version
        ) => {
          if (!persistedState) {
            return undefined;
          }

          /*
           * Version 1/2 may contain an invalid
           * selectedFile.
           */

          if (version < 3) {
            return {
              ...persistedState,

              selectedFile:
                persistedState
                  ?.selectedFile
                  ?.path
                  ? {
                      ...persistedState.selectedFile,

                      path:
                        normalizePath(
                          persistedState
                            .selectedFile
                            .path
                        ),
                    }
                  : null,
            };
          }

          return persistedState;
        },
      }
    )
  );