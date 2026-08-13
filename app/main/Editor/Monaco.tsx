"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Editor,
  BeforeMount,
  OnMount,
} from "@monaco-editor/react";

import type * as Monaco from "monaco-editor";

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";

import { useProjectState } from "@/useStates/projectStates";

import { useMutation } from "@tanstack/react-query";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

// =====================================================
// NORMALIZE PATH
// =====================================================

function normalizePath(
  value?: string
): string {
  if (!value) return "";

  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

// =====================================================
// GET NODE PATH
// =====================================================

function getNodePath(
  node: FileNode,
  parentPath = ""
): string {
  return normalizePath(
    parentPath
      ? `${parentPath}/${node.name}`
      : node.name
  );
}

// =====================================================
// FIND FILE BY PATH
// =====================================================

function findFileByPath(
  nodes: FileNode[],
  targetPath: string,
  parentPath = ""
): FileNode | null {
  const normalizedTarget =
    normalizePath(targetPath);

  for (const node of nodes) {
    const currentPath =
      getNodePath(node, parentPath);

    if (
      node.type === "file" &&
      normalizePath(currentPath) ===
        normalizedTarget
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
      const found =
        findFileByPath(
          node.children,
          normalizedTarget,
          currentPath
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}

// =====================================================
// LANGUAGE
// =====================================================

function getLanguageFromFileName(
  filename?: string
): string {
  if (!filename) {
    return "typescriptreact";
  }

  const name =
    filename.toLowerCase();

  if (name.endsWith(".tsx"))
    return "typescriptreact";

  if (name.endsWith(".jsx"))
    return "javascriptreact";

  if (name.endsWith(".ts"))
    return "typescript";

  if (name.endsWith(".js"))
    return "javascript";

  if (name.endsWith(".css"))
    return "css";

  if (name.endsWith(".scss"))
    return "scss";

  if (name.endsWith(".json"))
    return "json";

  if (name.endsWith(".md"))
    return "markdown";

  return "plaintext";
}

// =====================================================
// UPDATE FILE IN ZUSTAND
// =====================================================

function updateFileInTree(
  files: FileNode[],
  targetPath: string,
  content: string
): {
  files: FileNode[];
  updated: boolean;
} {
  const normalizedTarget =
    normalizePath(targetPath);

  let updated = false;

  function updateRecursive(
    nodes: FileNode[],
    parentPath = ""
  ): FileNode[] {
    return nodes.map((node) => {
      const currentPath =
        getNodePath(
          node,
          parentPath
        );

      if (
        node.type === "file" &&
        normalizePath(currentPath) ===
          normalizedTarget
      ) {
        updated = true;

        return {
          ...node,
          path: currentPath,
          content,
        };
      }

      if (
        node.type === "folder" &&
        Array.isArray(node.children)
      ) {
        return {
          ...node,
          path: currentPath,
          children:
            updateRecursive(
              node.children,
              currentPath
            ),
        };
      }

      return {
        ...node,
        path: currentPath,
      };
    });
  }

  return {
    files: updateRecursive(files),
    updated,
  };
}

// =====================================================
// PREVIEW RESPONSE
// =====================================================

type PreviewResponse = {
  success: boolean;
  projectId: string;
  previewUrl: string;
  message?: string;
};

// =====================================================
// MAIN EDITOR
// =====================================================

export function MainEditor() {
  const selectedFile =
    useProjectState(
      (state) =>
        state.selectedFile
    );

  const project =
    useProjectState(
      (state) =>
        state.project
    );

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null);

  const [isRunning, setIsRunning] =
    useState(false);

  // ===================================================
  // EDITOR REFS
  // ===================================================

  const editorRef =
    useRef<
      Monaco.editor.IStandaloneCodeEditor | null
    >(null);

  const ydocRef =
    useRef<Y.Doc | null>(null);

  const providerRef =
    useRef<WebsocketProvider | null>(null);

  const bindingRef =
    useRef<MonacoBinding | null>(null);

  const currentYTextRef =
    useRef<Y.Text | null>(null);

  const syncedRef =
    useRef(false);

  const ytextObserverRef =
    useRef<{
      ytext: Y.Text;
      observer: (
        event: any
      ) => void;
    } | null>(null);

  // ===================================================
  // CLEANUP BINDING
  // ===================================================

  const cleanupBinding =
    useCallback(() => {
      if (
        ytextObserverRef.current
      ) {
        const {
          ytext,
          observer,
        } =
          ytextObserverRef.current;

        ytext.unobserve(
          observer
        );

        ytextObserverRef.current =
          null;
      }

      if (
        bindingRef.current
      ) {
        bindingRef.current.destroy();

        bindingRef.current =
          null;
      }

      currentYTextRef.current =
        null;
    }, []);

  // ===================================================
  // UPDATE ZUSTAND
  // ===================================================

  const updateFileInStore =
    useCallback(
      (
        filePath: string,
        content: string
      ): FileNode[] => {
        const state =
          useProjectState.getState();

        const files =
          state.files as FileNode[];

        const result =
          updateFileInTree(
            files,
            filePath,
            content
          );

        if (!result.updated) {
          console.warn(
            "File not found:",
            filePath
          );

          return files;
        }

        const selected =
          state.selectedFile;

        const selectedPath =
          normalizePath(
            selected?.path ??
              selected?.name
          );

        useProjectState.setState({
          files: result.files,

          selectedFile:
            selectedPath ===
            normalizePath(filePath)
              ? {
                  ...(selected ?? {}),

                  path:
                    normalizePath(
                      filePath
                    ),

                  name:
                    selected?.name ??
                    normalizePath(
                      filePath
                    )
                      .split("/")
                      .pop() ??
                    "",

                  content,

                  type: "file",
                }
              : selected,
        });

        return result.files;
      },
      []
    );

  // ===================================================
  // YJS CONNECTION
  // ===================================================

  useEffect(() => {
    const projectId =
      project?.projectId;

    if (!projectId) {
      return;
    }

    if (
      ydocRef.current &&
      providerRef.current
    ) {
      return;
    }

    const ydoc =
      new Y.Doc();

    const room =
      `project:${projectId}`;

    const provider =
      new WebsocketProvider(
        "https://webweaver-m0is.onrender.com",
        room,
        ydoc,
        {
          connect: true,
        }
      );

    ydocRef.current =
      ydoc;

    providerRef.current =
      provider;

    provider.awareness.setLocalStateField(
      "user",
      {
        id: String(
          ydoc.clientID
        ),

        name:
          `User ${ydoc.clientID}`,

        color:
          "#3b82f6",
      }
    );

    const statusHandler = ({
      status,
    }: {
      status: string;
    }) => {
      console.log(
        "YJS STATUS:",
        status
      );
    };

    provider.on(
      "status",
      statusHandler
    );

    const syncHandler = (
      isSynced: boolean
    ) => {
      if (!isSynced) {
        return;
      }

      syncedRef.current =
        true;

      const editor =
        editorRef.current;

      const path =
        useProjectState
          .getState()
          .selectedFile?.path;

      if (
        editor &&
        path
      ) {
        bindFileToYjs(
          editor,
          path
        );
      }
    };

    provider.on(
      "sync",
      syncHandler
    );

    const awarenessHandler =
      () => {
        console.log(
          "Collaborators:",
          provider.awareness
            .getStates()
            .size
        );
      };

    provider.awareness.on(
      "change",
      awarenessHandler
    );

    return () => {
      cleanupBinding();

      provider.off(
        "status",
        statusHandler
      );

      provider.off(
        "sync",
        syncHandler
      );

      provider.awareness.off(
        "change",
        awarenessHandler
      );

      provider.destroy();

      ydoc.destroy();

      providerRef.current =
        null;

      ydocRef.current =
        null;

      syncedRef.current =
        false;
    };
  }, [
    project?.projectId,
    cleanupBinding,
  ]);

  // ===================================================
  // BIND FILE TO YJS
  // ===================================================

  const bindFileToYjs =
    useCallback(
      (
        editor: Monaco.editor.IStandaloneCodeEditor,
        filePath: string
      ) => {
        const ydoc =
          ydocRef.current;

        const provider =
          providerRef.current;

        if (
          !ydoc ||
          !provider
        ) {
          return;
        }

        if (
          !syncedRef.current
        ) {
          return;
        }

        const model =
          editor.getModel();

        if (!model) {
          return;
        }

        const normalizedPath =
          normalizePath(
            filePath
          );

        cleanupBinding();

        const filesMap =
          ydoc.getMap<Y.Text>(
            "files"
          );

        let ytext =
          filesMap.get(
            normalizedPath
          );

        if (!ytext) {
          ytext =
            new Y.Text();

          const state =
            useProjectState.getState();

          const existingFile =
            findFileByPath(
              state.files as FileNode[],
              normalizedPath
            );

          const initialContent =
            existingFile?.content ??
            "";

          if (
            initialContent
          ) {
            ytext.insert(
              0,
              initialContent
            );
          }

          filesMap.set(
            normalizedPath,
            ytext
          );
        }

        currentYTextRef.current =
          ytext;

        const observer = (
          _event: any,
          _transaction: Y.Transaction
        ) => {
          updateFileInStore(
            normalizedPath,
            ytext!.toString()
          );
        };

        ytext.observe(
          observer as any
        );

        ytextObserverRef.current =
          {
            ytext,
            observer:
              observer as any,
          };

        const binding =
          new MonacoBinding(
            ytext,
            model,
            new Set([editor]),
            provider.awareness
          );

        bindingRef.current =
          binding;
      },
      [
        cleanupBinding,
        updateFileInStore,
      ]
    );

  // ===================================================
  // EDITOR MOUNT
  // ===================================================

  const handleEditorMount:
    OnMount = (
      editor,
      monaco
    ) => {
      editorRef.current =
        editor;

      const filePath =
        useProjectState
          .getState()
          .selectedFile?.path;

      if (
        filePath &&
        syncedRef.current
      ) {
        bindFileToYjs(
          editor,
          filePath
        );
      }

      // ===============================================
      // CTRL + S
      // ===============================================

      editor.addAction({
        id: "save-and-run",

        label:
          "Save and Run Preview",

        keybindings: [
          monaco.KeyMod.CtrlCmd |
            monaco.KeyCode.KeyS,
        ],

        run: () => {
          handleRun();
        },
      });
    };

  // ===================================================
  // SWITCH FILE
  // ===================================================

  useEffect(() => {
    const editor =
      editorRef.current;

    const filePath =
      selectedFile?.path;

    if (
      !editor ||
      !filePath
    ) {
      return;
    }

    if (
      !syncedRef.current
    ) {
      return;
    }

    bindFileToYjs(
      editor,
      filePath
    );
  }, [
    selectedFile?.path,
    bindFileToYjs,
  ]);

  // ===================================================
  // START VERCEL SANDBOX PREVIEW
  // ===================================================

  const runMutation =
    useMutation({
      mutationFn:
        async ({
          projectId,
          files,
        }: {
          projectId: string;
          files: FileNode[];
        }) => {
          const response =
            await fetch(
              "/api/preview",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    projectId,
                    files,
                  }),
              }
            );

          const data =
            (await response.json()) as PreviewResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.message ??
                "Preview failed"
            );
          }

          return data;
        },

      onMutate: () => {
        setIsRunning(true);
      },

      onSuccess: (data) => {
        console.log(
          "🟢 Preview ready:",
          data.previewUrl
        );

        setPreviewUrl(
          data.previewUrl
        );
      },

      onError: (error) => {
        console.error(
          "❌ Preview error:",
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : "Preview failed"
        );
      },

      onSettled: () => {
        setIsRunning(false);
      },
    });

  // ===================================================
  // RUN PROJECT
  // ===================================================

  const handleRun =
    useCallback(() => {
      const projectId =
        project?.projectId;

      if (!projectId) {
        console.warn(
          "Project ID missing"
        );

        return;
      }

      const state =
        useProjectState.getState();

      const files =
        state.files as FileNode[];

      if (
        !files ||
        files.length === 0
      ) {
        console.warn(
          "No project files"
        );

        return;
      }

      console.log(
        "🚀 Starting preview:",
        projectId
      );

      console.log(
        "📁 Sending files:",
        files.length
      );

      runMutation.mutate({
        projectId,
        files,
      });
    }, [
      project?.projectId,
      runMutation,
    ]);

  // ===================================================
  // MONACO CONFIG
  // ===================================================

  const handleBeforeMount:
    BeforeMount = (
      monaco
    ) => {
      monaco.languages.typescript
        .typescriptDefaults
        .setCompilerOptions({
          jsx:
            monaco.languages.typescript
              .JsxEmit.ReactJSX,

          target:
            monaco.languages.typescript
              .ScriptTarget.Latest,

          allowJs: true,

          allowNonTsExtensions:
            true,
        });

      monaco.languages.typescript
        .javascriptDefaults
        .setCompilerOptions({
          jsx:
            monaco.languages.typescript
              .JsxEmit.ReactJSX,

          allowJs: true,

          allowNonTsExtensions:
            true,
        });
    };

  // ===================================================
  // RENDER
  // ===================================================

  const defaultContent =
`export function Welcome() {
  console.log("Welcome dear Friend !!!");
}`;

  const currentPath =
    normalizePath(
      selectedFile?.path ??
        selectedFile?.name
    ) ||
    "app/page.tsx";

  const currentLanguage =
    getLanguageFromFileName(
      currentPath
    );

  return (
    <div className="flex h-full w-full">

      {/* =================================================
          EDITOR
      ================================================= */}

      <div className="relative h-full w-1/2 min-w-0">

        <Editor
          path={currentPath}
          height="100%"
          width="100%"
          defaultValue={
            selectedFile?.content ??
            defaultContent
          }
          language={
            currentLanguage
          }
          theme="vs-dark"
          beforeMount={
            handleBeforeMount
          }
          onMount={
            handleEditorMount
          }
          options={{
            automaticLayout:
              true,

            minimap: {
              enabled: true,
            },

            fontSize: 14,

            padding: {
              top: 10,
            },

            tabSize: 2,
          }}
        />

        {/* RUN BUTTON */}

        <div className="absolute right-4 top-4 z-30">

          <button
            type="button"
            onClick={
              handleRun
            }
            disabled={
              isRunning
            }
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning
              ? "Running..."
              : "Run"}
          </button>

        </div>

      </div>

      {/* =================================================
          PREVIEW
      ================================================= */}

      <div className="flex h-full w-1/2 bg-slate-900">

        {previewUrl ? (
          <iframe
            src={previewUrl}
            className="h-full w-full border-none bg-white"
            title="Project Preview"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            Run the project to see preview.
          </div>
        )}

      </div>

    </div>
  );
}