
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

  /*
   * Full path from project root.
   *
   * Examples:
   *
   * app/page.tsx
   * app/components/Button.tsx
   * dashboard/page.tsx
   */
  path: string;

  type: "file" | "folder";

  content?: string;

  children?: FileNode[];
};

/* =========================================================
   SELECTED FILE
========================================================= */

export type SelectedFile = {
  /*
   * File name only.
   *
   * Example:
   * page.tsx
   */
  name: string;

  /*
   * FULL unique path.
   *
   * Example:
   * app/page.tsx
   */
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

  clearProject: () => void;
}

/* =========================================================
   ZUSTAND STORE
========================================================= */

export const useProjectState =
  create<ProjectState>()(
    persist(
      (set) => ({
        /* =================================================
           PROJECT
        ================================================= */

        project: {
          projectId: null,
          ownerId: null,
        },

        /* =================================================
           FILES
        ================================================= */

        files: [],

        /* =================================================
           SELECTED FILE
        ================================================= */

        selectedFile: null,

        /* =================================================
           SET PROJECT
        ================================================= */

        setProjectId: (
          id,
          ownerId
        ) =>
          set({
            project: {
              projectId: id,
              ownerId,
            },
          }),

        /* =================================================
           SET FILES
        ================================================= */

        setFiles: (
          files
        ) =>
          set({
            files,
          }),

        /* =================================================
           SELECT FILE
        ================================================= */

        setSelectedFile: (
          file
        ) =>
          set({
            selectedFile: file,
          }),

        /* =================================================
           CLEAR PROJECT
        ================================================= */

        clearProject: () =>
          set({
            project: {
              projectId: null,
              ownerId: null,
            },

            files: [],

            selectedFile: null,
          }),
      }),

      {
        name: "project-storage",

        storage:
          createJSONStorage(
            () => sessionStorage
          ),

        /*
         * Important:
         *
         * Zustand persisted state from an older
         * version may not contain selectedFile.path.
         *
         * This migration removes an invalid old
         * selectedFile rather than allowing the
         * editor to accidentally update the wrong file.
         */
        version: 2,

        migrate: (
          persistedState: any,
          version
        ) => {
          if (
            version < 2
          ) {
            return {
              ...persistedState,

              selectedFile:
                persistedState
                  ?.selectedFile
                  ?.path
                  ? persistedState.selectedFile
                  : null,
            };
          }

          return persistedState;
        },
      }
    )
  );
