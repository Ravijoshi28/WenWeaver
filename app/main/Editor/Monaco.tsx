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

import {
  SaveFile,
  runPreview,
} from "@/ApiCalls/docker/docker";

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
// NORMALIZE PATH
// =====================================================

function normalizePath(value?: string): string {
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
    const currentPath = getNodePath(
      node,
      parentPath
    );

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
      const found = findFileByPath(
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

  const name = filename.toLowerCase();

  if (name.endsWith(".tsx")) {
    return "typescriptreact";
  }

  if (name.endsWith(".jsx")) {
    return "javascriptreact";
  }

  if (name.endsWith(".ts")) {
    return "typescript";
  }

  if (name.endsWith(".js")) {
    return "javascript";
  }

  if (name.endsWith(".css")) {
    return "css";
  }

  if (name.endsWith(".scss")) {
    return "scss";
  }

  if (name.endsWith(".json")) {
    return "json";
  }

  if (name.endsWith(".md")) {
    return "markdown";
  }

  if (name.endsWith(".html")) {
    return "html";
  }

  return "plaintext";
}

// =====================================================
// UPDATE FILE IN TREE
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
      const currentPath = getNodePath(
        node,
        parentPath
      );

      // FILE
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

      // FOLDER
      if (
        node.type === "folder" &&
        Array.isArray(node.children)
      ) {
        return {
          ...node,
          path: currentPath,
          children: updateRecursive(
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
// MAIN EDITOR
// =====================================================

export function MainEditor() {
  // ===================================================
  // ZUSTAND
  // ===================================================

  const selectedFile = useProjectState(
    (state) => state.selectedFile
  );

  const project = useProjectState(
    (state) => state.project
  );

  // ===================================================
  // LOCAL STATE
  // ===================================================

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState<string | null>(null);

  const [
    isRunning,
    setIsRunning,
  ] = useState(false);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  // ===================================================
  // EDITOR REF
  // ===================================================

  const editorRef =
    useRef<Monaco.editor.IStandaloneCodeEditor | null>(
      null
    );

  // ===================================================
  // YJS REFS
  // ===================================================

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

  // ===================================================
  // YJS OBSERVER
  // ===================================================

  const ytextObserverRef =
    useRef<{
      ytext: Y.Text;

      observer: (
        event: Y.YTextEvent,
        transaction: Y.Transaction
      ) => void;
    } | null>(null);

  // ===================================================
  // MONACO CHANGE LISTENER
  // ===================================================

  const editorChangeListenerRef =
    useRef<Monaco.IDisposable | null>(null);

  // ===================================================
  // CLEANUP YJS BINDING
  // ===================================================

  const cleanupBinding =
    useCallback(() => {
      console.log(
        "🧹 Cleaning YJS binding"
      );

      if (ytextObserverRef.current) {
        const {
          ytext,
          observer,
        } = ytextObserverRef.current;

        ytext.unobserve(observer);

        ytextObserverRef.current = null;
      }

      if (bindingRef.current) {
        bindingRef.current.destroy();

        bindingRef.current = null;
      }

      currentYTextRef.current = null;
    }, []);

  // ===================================================
  // UPDATE FILE IN ZUSTAND
  // ===================================================

  const updateFileInStore =
    useCallback(
      (
        filePath: string,
        content: string
      ): FileNode[] => {
        const normalizedFilePath =
          normalizePath(filePath);

        if (!normalizedFilePath) {
          console.warn(
            "⚠️ Cannot update file without path"
          );

          return useProjectState.getState()
            .files as FileNode[];
        }

        const state =
          useProjectState.getState();

        const files =
          state.files as FileNode[];

        const result =
          updateFileInTree(
            files,
            normalizedFilePath,
            content
          );

        if (!result.updated) {
          console.warn(
            "⚠️ File not found in Zustand:",
            normalizedFilePath
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
            normalizedFilePath
              ? {
                  ...(selected ?? {}),

                  name:
                    selected?.name ??
                    normalizedFilePath
                      .split("/")
                      .pop() ??
                    "",

                  path:
                    normalizedFilePath,

                  type: "file",

                  content,
                }
              : selected,
        });

        console.log(
          "✅ Zustand updated:",
          normalizedFilePath
        );

        return result.files;
      },
      []
    );

  // ===================================================
  // MONACO → ZUSTAND
  // ===================================================

  const setupEditorChangeListener =
    useCallback(
      (
        editor: Monaco.editor.IStandaloneCodeEditor
      ) => {
        if (
          editorChangeListenerRef.current
        ) {
          editorChangeListenerRef.current.dispose();

          editorChangeListenerRef.current =
            null;
        }

        editorChangeListenerRef.current =
          editor.onDidChangeModelContent(() => {
            const model =
              editor.getModel();

            if (!model) {
              console.warn(
                "⚠️ Monaco model missing"
              );

              return;
            }

            const modelPath =
              normalizePath(
                model.uri.path
              );

            if (!modelPath) {
              console.warn(
                "⚠️ Monaco model has no path"
              );

              return;
            }

            const content =
              model.getValue();

            console.log(
              "📝 Monaco changed:",
              modelPath
            );

            updateFileInStore(
              modelPath,
              content
            );
          });

        console.log(
          "👂 Monaco change listener attached"
        );
      },
      [updateFileInStore]
    );

  // ===================================================
  // SAVE MUTATION
  // ===================================================

  const saveMutation =
    useMutation({
      mutationFn: ({
        ownerId,
        projectId,
        files,
      }: {
        ownerId: string;
        projectId: string;
        files: FileNode[];
      }) => {
        console.log(
          "📤 Sending files to SaveFile:",
          {
            ownerId,
            projectId,
            fileCount:
              files.length,
          }
        );

        return SaveFile(
          ownerId,
          projectId,
          files
        );
      },

      onMutate: () => {
        console.log(
          "💾 Save started"
        );

        setIsSaving(true);
      },

      onSuccess: (data) => {
        console.log(
          "✅ Files saved successfully:",
          data
        );
      },

      onError: (error) => {
        console.error(
          "❌ Save failed:",
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : "Failed to save files"
        );
      },

      onSettled: () => {
        setIsSaving(false);
      },
    });

  // ===================================================
  // SAVE PROJECT
  // ===================================================

  const handleSave =
    useCallback(() => {
      const ownerId =
        project?.ownerId;

      const projectId =
        project?.projectId;

      if (!ownerId || !projectId) {
        console.warn(
          "⚠️ Owner ID or Project ID missing",
          {
            ownerId,
            projectId,
          }
        );

        return;
      }

      const state =
        useProjectState.getState();

      const files =
        state.files as FileNode[];

      if (
        !Array.isArray(files) ||
        files.length === 0
      ) {
        console.warn(
          "⚠️ No project files to save"
        );

        return;
      }

      console.log(
        "💾 Saving project:",
        projectId
      );

      saveMutation.mutate({
        ownerId,
        projectId,
        files,
      });
    }, [
      project?.ownerId,
      project?.projectId,
      saveMutation,
    ]);

  // ===================================================
  // PREVIEW MUTATION
  // ===================================================

  const runMutation =
    useMutation({
      mutationFn: ({
        projectId,
        files,
      }: {
        projectId: string;
        files: FileNode[];
      }) => {
        console.log(
          "🚀 Calling runPreview:",
          projectId
        );

        return runPreview(
          projectId,
          files
        );
      },

      onMutate: () => {
        console.log(
          "▶️ Preview started"
        );

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
        console.log(
          "⏹️ Preview finished"
        );

        setIsRunning(false);
      },
    });

  // ===================================================
  // RUN PREVIEW
  // ===================================================

  const handleRun =
    useCallback(() => {
      const projectId =
        project?.projectId;

      if (!projectId) {
        console.warn(
          "⚠️ Project ID missing"
        );

        return;
      }

      const state =
        useProjectState.getState();

      const files =
        state.files as FileNode[];

      if (
        !Array.isArray(files) ||
        files.length === 0
      ) {
        console.warn(
          "⚠️ No project files"
        );

        return;
      }

      console.log(
        "🚀 Starting preview:",
        projectId
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

    console.log(
      "🔌 Connecting YJS..."
    );

    const ydoc = new Y.Doc();

    const room =
      `project:${projectId}`;

    const provider =
      new WebsocketProvider(
        "wss://webweaver-m0is.onrender.com",
        room,
        ydoc,
        {
          connect: true,
        }
      );

    ydocRef.current = ydoc;

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
        "🌐 YJS STATUS:",
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
      console.log(
        "🔄 YJS SYNC:",
        isSynced
      );

      if (!isSynced) {
        return;
      }

      syncedRef.current = true;

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
          "👥 Collaborators:",
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
      console.log(
        "🔴 Disconnecting YJS:",
        room
      );

      cleanupBinding();

      if (
        editorChangeListenerRef.current
      ) {
        editorChangeListenerRef.current.dispose();

        editorChangeListenerRef.current =
          null;
      }

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
          console.warn(
            "⚠️ YJS not available"
          );

          return;
        }

        if (!syncedRef.current) {
          console.warn(
            "⚠️ YJS not synced yet"
          );

          return;
        }

        const model =
          editor.getModel();

        if (!model) {
          console.warn(
            "⚠️ Monaco model missing"
          );

          return;
        }

        const normalizedPath =
          normalizePath(filePath);

        if (!normalizedPath) {
          return;
        }

        console.log(
          "🔗 Binding file:",
          normalizedPath
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
          console.log(
            "🆕 Creating YJS file:",
            normalizedPath
          );

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
            initialContent.length > 0
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

        const yjsContent =
          ytext.toString();

        const state =
          useProjectState.getState();

        const existingFile =
          findFileByPath(
            state.files as FileNode[],
            normalizedPath
          );

        const zustandContent =
          existingFile?.content ??
          "";

        if (
          yjsContent !==
          zustandContent
        ) {
          updateFileInStore(
            normalizedPath,
            yjsContent
          );
        }

        currentYTextRef.current =
          ytext;

        const observer = (
          _event: Y.YTextEvent,
          _transaction: Y.Transaction
        ) => {
          const content =
            ytext!.toString();

          updateFileInStore(
            normalizedPath,
            content
          );
        };

        ytext.observe(
          observer
        );

        ytextObserverRef.current =
          {
            ytext,
            observer,
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

        console.log(
          "✅ YJS binding complete:",
          normalizedPath
        );
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
      console.log(
        "🟢 Monaco mounted"
      );

      editorRef.current =
        editor;

      setupEditorChangeListener(
        editor
      );

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

      editor.addAction({
        id: "save-files",

        label: "Save Files",

        keybindings: [
          monaco.KeyMod.CtrlCmd |
            monaco.KeyCode.KeyS,
        ],

        run: () => {
          console.log(
            "💾 CTRL + S pressed"
          );

          handleSave();
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

    console.log(
      "📂 Selected file changed:",
      filePath
    );

    setupEditorChangeListener(
      editor
    );

    if (!syncedRef.current) {
      console.log(
        "⏳ Waiting for YJS sync:",
        filePath
      );

      return;
    }

    bindFileToYjs(
      editor,
      filePath
    );
  }, [
    selectedFile?.path,
    bindFileToYjs,
    setupEditorChangeListener,
  ]);

  // ===================================================
  // CLEANUP
  // ===================================================

  useEffect(() => {
    return () => {
      if (
        editorChangeListenerRef.current
      ) {
        editorChangeListenerRef.current.dispose();

        editorChangeListenerRef.current =
          null;
      }

      cleanupBinding();
    };
  }, [
    cleanupBinding,
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

          target:
            monaco.languages.typescript
              .ScriptTarget.Latest,

          allowJs: true,

          allowNonTsExtensions:
            true,
        });
    };

  // ===================================================
  // DEFAULT CONTENT
  // ===================================================

  const defaultContent =
`export function Welcome() {
  console.log("Welcome dear Friend !!!");
}`;

  // ===================================================
  // CURRENT PATH
  // ===================================================

  const currentPath =
    normalizePath(
      selectedFile?.path ??
        selectedFile?.name
    ) ||
    "app/page.tsx";

  // ===================================================
  // LANGUAGE
  // ===================================================

  const currentLanguage =
    getLanguageFromFileName(
      currentPath
    );

  // ===================================================
  // FILE NAME
  // ===================================================

  const currentFileName =
    currentPath
      .split("/")
      .pop() ??
    "page.tsx";

  const currentDirectory =
    currentPath
      .split("/")
      .slice(0, -1)
      .join("/");

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#080b12] text-white">

      {/* =================================================
          TOP WORKSPACE BAR
      ================================================= */}

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0d111a]/95 px-3 backdrop-blur-xl">

        {/* LEFT */}
        <div className="flex min-w-0 items-center gap-3">

          {/* IDE ICON */}
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-blue-500/20">

            <svg
              className="h-4 w-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M8 9l-3 3 3 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <path
                d="M16 9l3 3-3 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <path
                d="M14 5l-4 14"
                strokeLinecap="round"
              />
            </svg>

          </div>

          {/* FILE BREADCRUMB */}
          <div className="flex min-w-0 items-center gap-2 text-xs">

            <span className="text-gray-500">
              Workspace
            </span>

            <svg
              className="h-3 w-3 shrink-0 text-gray-700"
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

            {currentDirectory && (
              <>
                <span className="max-w-[240px] truncate text-gray-500">
                  {currentDirectory}
                </span>

                <svg
                  className="h-3 w-3 shrink-0 text-gray-700"
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
              </>
            )}

            <div className="flex min-w-0 items-center gap-2">

              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />

              <span className="truncate font-medium text-gray-200">
                {currentFileName}
              </span>

            </div>

          </div>

        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-2">

          {/* YJS STATUS */}
          <div
            className="hidden items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-[11px] text-gray-400 sm:flex"
            title={
              syncedRef.current
                ? "Collaboration connected"
                : "Connecting..."
            }
          >

            <span
              className={`h-1.5 w-1.5 rounded-full ${
                syncedRef.current
                  ? "bg-emerald-400 shadow-sm shadow-emerald-400/60"
                  : "animate-pulse bg-amber-400"
              }`}
            />

            {syncedRef.current
              ? "Synced"
              : "Connecting"}

          </div>

          {/* SAVE */}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="group flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 shadow-sm transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >

            {isSaving ? (
              <svg
                className="h-3.5 w-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeOpacity=".25"
                  strokeWidth="2.5"
                />

                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M5 4h11l3 3v13H5V4Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                <path
                  d="M8 4v6h8V4M8 20v-6h8v6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}

            <span>
              {isSaving
                ? "Saving"
                : "Save"}
            </span>

            {!isSaving && (
              <span className="hidden rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 text-[9px] text-gray-500 md:inline">
                ⌘S
              </span>
            )}

          </button>

          {/* RUN */}
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >

            {isRunning ? (
              <svg
                className="h-3.5 w-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeOpacity=".25"
                  strokeWidth="2.5"
                />

                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.59-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
              </svg>
            )}

            <span>
              {isRunning
                ? "Running"
                : "Run"}
            </span>

          </button>

        </div>
      </div>

      {/* =================================================
          MAIN WORKSPACE
      ================================================= */}

      <div className="flex min-h-0 flex-1">

        {/* =================================================
            EDITOR PANEL
        ================================================= */}

        <section className="relative flex min-w-0 flex-1 flex-col border-r border-white/[0.07] bg-[#0a0d14]">

          {/* EDITOR HEADER */}

          <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0d111a] px-3">

            <div className="flex items-center gap-2">

              {/* FILE ICON */}
              <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/10">

                <svg
                  className="h-3 w-3 text-blue-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
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

              </div>

              <span className="text-[11px] font-medium text-gray-400">
                {currentFileName}
              </span>

              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-gray-600">
                {currentLanguage ===
                "typescriptreact"
                  ? "TSX"
                  : currentLanguage.toUpperCase()}
              </span>

            </div>

            {/* RIGHT EDITOR INFO */}

            <div className="flex items-center gap-3 text-[10px] text-gray-600">

              <span>
                Spaces: 2
              </span>

              <span className="hidden sm:inline">
                UTF-8
              </span>

            </div>

          </div>

          {/* MONACO */}

          <div className="relative min-h-0 flex-1">

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
                automaticLayout: true,

                minimap: {
                  enabled: true,
                },

                fontSize: 14,

                padding: {
                  top: 14,
                  bottom: 14,
                },

                tabSize: 2,

                smoothScrolling: true,

                cursorSmoothCaretAnimation:
                  "on",

                cursorBlinking:
                  "smooth",

                renderWhitespace:
                  "selection",

                scrollBeyondLastLine:
                  false,

                roundedSelection: true,

                folding: true,

                bracketPairColorization: {
                  enabled: true,
                },

                guides: {
                  bracketPairs: true,
                  indentation: true,
                },

                suggest: {
                  showMethods: true,
                  showFunctions: true,
                },

                wordWrap: "off",

                lineNumbers:
                  "on",

                glyphMargin: true,

                renderLineHighlight:
                  "all",

                overviewRulerBorder:
                  false,

                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                  useShadows: false,
                },

                hover: {
                  enabled: true,
                },

                contextmenu: true,
              }}
            />

            {/* EDITOR STATUS */}

            <div className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-2 rounded-md border border-white/[0.06] bg-[#0b0f17]/90 px-2 py-1 text-[9px] text-gray-600 backdrop-blur-md">

              <span className="text-gray-500">
                {currentPath}
              </span>

            </div>

          </div>
        </section>

        {/* =================================================
            PREVIEW PANEL
        ================================================= */}

        <section className="flex min-w-0 flex-1 flex-col bg-[#070a10]">

          {/* PREVIEW HEADER */}

          <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0d111a] px-3">

            <div className="flex items-center gap-2">

              {/* BROWSER ICON */}

              <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/10">

                <svg
                  className="h-3 w-3 text-emerald-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect
                    x="3"
                    y="4"
                    width="18"
                    height="16"
                    rx="2"
                  />

                  <path d="M3 9h18" />

                  <path
                    d="M7 6.5h.01M10 6.5h.01"
                    strokeLinecap="round"
                    strokeWidth="2.5"
                  />
                </svg>

              </div>

              <span className="text-[11px] font-medium text-gray-400">
                Preview
              </span>

              {/* STATUS */}

              <div className="flex items-center gap-1.5 rounded-full border border-white/[0.05] bg-white/[0.025] px-2 py-0.5">

                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    previewUrl
                      ? "bg-emerald-400 shadow-sm shadow-emerald-400/60"
                      : "bg-gray-600"
                  }`}
                />

                <span className="text-[9px] text-gray-500">
                  {previewUrl
                    ? "Live"
                    : "Idle"}
                </span>

              </div>

            </div>

            {/* PREVIEW URL */}

            {previewUrl && (
              <div className="hidden max-w-[45%] items-center gap-1.5 rounded-md border border-white/[0.05] bg-black/20 px-2 py-1 md:flex">

                <svg
                  className="h-3 w-3 shrink-0 text-gray-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  <path
                    d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 7 20l1.15-1.15"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                <span className="truncate text-[9px] text-gray-600">
                  {previewUrl}
                </span>

              </div>
            )}

          </div>

          {/* PREVIEW CONTENT */}

          <div className="relative min-h-0 flex-1 overflow-hidden">

            {previewUrl ? (
              <div className="h-full w-full bg-white">

                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  className="h-full w-full border-none bg-white"
                  title="Project Preview"
                />

              </div>
            ) : (
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden">

                {/* BACKGROUND GLOW */}

                <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/5 blur-3xl" />

                {/* GRID */}

                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.025]"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
                    backgroundSize:
                      "32px 32px",
                  }}
                />

                {/* EMPTY STATE */}

                <div className="relative z-10 flex max-w-sm flex-col items-center px-6 text-center">

                  {/* ICON */}

                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-blue-500/10 to-violet-500/10 shadow-2xl shadow-blue-900/10">

                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">

                      <svg
                        className="h-5 w-5 text-gray-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          d="M8 9l-3 3 3 3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        <path
                          d="M16 9l3 3-3 3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        <path
                          d="M14 5l-4 14"
                          strokeLinecap="round"
                        />
                      </svg>

                    </div>

                  </div>

                  <h3 className="text-sm font-semibold text-gray-300">
                    Your preview is waiting
                  </h3>

                  <p className="mt-2 max-w-xs text-xs leading-5 text-gray-600">
                    Run your project to launch
                    a live preview of the
                    current workspace.
                  </p>

                  {/* RUN BUTTON */}

                  <button
                    type="button"
                    onClick={
                      handleRun
                    }
                    disabled={
                      isRunning
                    }
                    className="mt-5 flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >

                    {isRunning ? (
                      <svg
                        className="h-3.5 w-3.5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          strokeOpacity=".25"
                          strokeWidth="2.5"
                        />

                        <path
                          d="M21 12a9 9 0 0 0-9-9"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.59-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
                      </svg>
                    )}

                    {isRunning
                      ? "Starting preview..."
                      : "Run project"}

                  </button>

                </div>
              </div>
            )}

          </div>

          {/* PREVIEW FOOTER */}

          <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.05] bg-[#0b0e15] px-3">

            <div className="flex items-center gap-2 text-[9px] text-gray-600">

              <span>
                Preview
              </span>

              <span className="text-gray-800">
                •
              </span>

              <span>
                {previewUrl
                  ? "Connected"
                  : "Not running"}
              </span>

            </div>

            <div className="text-[9px] text-gray-700">
              WebWeaver
            </div>

          </div>

        </section>

      </div>
    </div>
  );
}