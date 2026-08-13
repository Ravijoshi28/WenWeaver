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
      getNodePath(
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
      const currentPath =
        getNodePath(
          node,
          parentPath
        );

      // -----------------------------------------------
      // FILE
      // -----------------------------------------------

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

      // -----------------------------------------------
      // FOLDER
      // -----------------------------------------------

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

      // -----------------------------------------------
      // OTHER
      // -----------------------------------------------

      return {
        ...node,

        path: currentPath,
      };
    });
  }

  return {
    files:
      updateRecursive(files),

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
  // ===================================================
  // ZUSTAND
  // ===================================================

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

  // ===================================================
  // LOCAL STATE
  // ===================================================

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState<string | null>(
    null
  );

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
    useRef<
      Monaco.editor.IStandaloneCodeEditor | null
    >(null);

  // ===================================================
  // YJS REFS
  // ===================================================

  const ydocRef =
    useRef<Y.Doc | null>(null);

  const providerRef =
    useRef<WebsocketProvider | null>(
      null
    );

  const bindingRef =
    useRef<MonacoBinding | null>(
      null
    );

  const currentYTextRef =
    useRef<Y.Text | null>(null);

  const syncedRef =
    useRef(false);

  // ===================================================
  // YJS OBSERVER REF
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
    useRef<Monaco.IDisposable | null>(
      null
    );

  // ===================================================
  // CLEANUP YJS BINDING
  // ===================================================

  const cleanupBinding =
    useCallback(() => {
      console.log(
        "🧹 Cleaning YJS binding"
      );

      // -----------------------------------------------
      // YJS OBSERVER
      // -----------------------------------------------

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

      // -----------------------------------------------
      // MONACO BINDING
      // -----------------------------------------------

      if (
        bindingRef.current
      ) {
        bindingRef.current.destroy();

        bindingRef.current =
          null;
      }

      // -----------------------------------------------
      // CURRENT YTEXT
      // -----------------------------------------------

      currentYTextRef.current =
        null;
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

        if (
          !normalizedFilePath
        ) {
          console.warn(
            "⚠️ Cannot update file without path"
          );

          return (
            useProjectState.getState()
              .files as FileNode[]
          );
        }

        const state =
          useProjectState.getState();

        const files =
          state.files as FileNode[];

        // ---------------------------------------------
        // UPDATE BY FULL PATH
        // ---------------------------------------------

        const result =
          updateFileInTree(
            files,
            normalizedFilePath,
            content
          );

        // ---------------------------------------------
        // FILE NOT FOUND
        // ---------------------------------------------

        if (!result.updated) {
          console.warn(
            "⚠️ File not found in Zustand:",
            normalizedFilePath
          );

          return files;
        }

        // ---------------------------------------------
        // CURRENT SELECTED FILE
        // ---------------------------------------------

        const selected =
          state.selectedFile;

        const selectedPath =
          normalizePath(
            selected?.path ??
              selected?.name
          );

        // ---------------------------------------------
        // UPDATE ZUSTAND
        // ---------------------------------------------

        useProjectState.setState({
          files:
            result.files,

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
        // ---------------------------------------------
        // REMOVE OLD LISTENER
        // ---------------------------------------------

        if (
          editorChangeListenerRef.current
        ) {
          editorChangeListenerRef.current.dispose();

          editorChangeListenerRef.current =
            null;
        }

        // ---------------------------------------------
        // CREATE NEW LISTENER
        // ---------------------------------------------

        editorChangeListenerRef.current =
          editor.onDidChangeModelContent(
            () => {
              const model =
                editor.getModel();

              if (!model) {
                console.warn(
                  "⚠️ Monaco model missing"
                );

                return;
              }

              // Monaco URI path can begin with /
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

              console.log(
                "📏 Content length:",
                content.length
              );

              // -----------------------------------------
              // IMPORTANT:
              // MONACO → ZUSTAND
              // -----------------------------------------

              updateFileInStore(
                modelPath,
                content
              );
            }
          );

        console.log(
          "👂 Monaco change listener attached"
        );
      },
      [
        updateFileInStore,
      ]
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

      onSuccess: (
        data
      ) => {
        console.log(
          "✅ Files saved successfully:",
          data
        );
      },

      onError: (
        error
      ) => {
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
  //
  // CTRL + S USES THIS
  // ===================================================

  const handleSave =
    useCallback(() => {
      const ownerId =
        project?.ownerId;

      const projectId =
        project?.projectId;

      // -----------------------------------------------
      // VALIDATE PROJECT
      // -----------------------------------------------

      if (
        !ownerId ||
        !projectId
      ) {
        console.warn(
          "⚠️ Owner ID or Project ID missing",
          {
            ownerId,
            projectId,
          }
        );

        return;
      }

      // -----------------------------------------------
      // ALWAYS GET LATEST ZUSTAND STATE
      // -----------------------------------------------

      const state =
        useProjectState.getState();

      const files =
        state.files as FileNode[];
        console.log(files);

      // -----------------------------------------------
      // VALIDATE FILES
      // -----------------------------------------------

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

      console.log(
        "📁 Saving file nodes:",
        files.length
      );

      // -----------------------------------------------
      // SAVE
      // -----------------------------------------------
      console.log(files);
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
  //
  // RUN BUTTON USES THIS
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

        console.log(
          "📁 Preview files:",
          files.length
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

      onSuccess: (
        data
      ) => {
        console.log(
          "🟢 Preview ready:",
          data.previewUrl
        );

        setPreviewUrl(
          data.previewUrl
        );
      },

      onError: (
        error
      ) => {
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
  //
  // IMPORTANT:
  // DOES NOT SAVE TO SUPABASE
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

      // -----------------------------------------------
      // GET ABSOLUTELY LATEST ZUSTAND STATE
      // -----------------------------------------------

      const state =
        useProjectState.getState();

      const files =
        state.files as FileNode[];

      // -----------------------------------------------
      // VALIDATE
      // -----------------------------------------------

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

      console.log(
        "📁 Sending current Zustand files:",
        files.length
      );

      // -----------------------------------------------
      // PREVIEW ONLY
      // -----------------------------------------------

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
      console.log(
        "⏳ Waiting for project ID..."
      );

      return;
    }

    // -----------------------------------------------
    // PREVENT DUPLICATE CONNECTION
    // -----------------------------------------------

    if (
      ydocRef.current &&
      providerRef.current
    ) {
      return;
    }

    console.log(
      "🔌 Connecting YJS..."
    );

    console.log(
      "🆔 Project:",
      projectId
    );

    const ydoc =
      new Y.Doc();

    const room =
      `project:${projectId}`;

    console.log(
      "🚪 YJS room:",
      room
    );

    // -----------------------------------------------
    // RENDER YJS SERVER
    // -----------------------------------------------

    const provider =
      new WebsocketProvider(
        "wss://webweaver-m0is.onrender.com",
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

    // -----------------------------------------------
    // AWARENESS
    // -----------------------------------------------

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

    // -----------------------------------------------
    // STATUS
    // -----------------------------------------------

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

    // -----------------------------------------------
    // SYNC
    // -----------------------------------------------

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

      syncedRef.current =
        true;

      const editor =
        editorRef.current;

      const path =
        useProjectState
          .getState()
          .selectedFile?.path;

      console.log(
        "📂 Synced selected path:",
        path
      );

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

    // -----------------------------------------------
    // AWARENESS
    // -----------------------------------------------

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

    // -----------------------------------------------
    // CLEANUP
    // -----------------------------------------------

    return () => {
      console.log(
        "🔴 Disconnecting YJS:",
        room
      );

      cleanupBinding();

      // Monaco listener
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

        // ---------------------------------------------
        // VALIDATE YJS
        // ---------------------------------------------

        if (
          !ydoc ||
          !provider
        ) {
          console.warn(
            "⚠️ YJS not available"
          );

          return;
        }

        if (
          !syncedRef.current
        ) {
          console.warn(
            "⚠️ YJS not synced yet"
          );

          return;
        }

        // ---------------------------------------------
        // GET MONACO MODEL
        // ---------------------------------------------

        const model =
          editor.getModel();

        if (!model) {
          console.warn(
            "⚠️ Monaco model missing"
          );

          return;
        }

        // ---------------------------------------------
        // NORMALIZE PATH
        // ---------------------------------------------

        const normalizedPath =
          normalizePath(
            filePath
          );

        if (!normalizedPath) {
          console.warn(
            "⚠️ Cannot bind empty path"
          );

          return;
        }

        console.log(
          "🔗 Binding file:",
          normalizedPath
        );

        // ---------------------------------------------
        // CLEAN OLD BINDING
        // ---------------------------------------------

        cleanupBinding();

        // ---------------------------------------------
        // FILES MAP
        // ---------------------------------------------

        const filesMap =
          ydoc.getMap<Y.Text>(
            "files"
          );

        // ---------------------------------------------
        // GET YTEXT BY FULL PATH
        // ---------------------------------------------

        let ytext =
          filesMap.get(
            normalizedPath
          );

        // ---------------------------------------------
        // CREATE YTEXT IF MISSING
        // ---------------------------------------------

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

          console.log(
            "📄 Initial content length:",
            initialContent.length
          );

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

        // ---------------------------------------------
        // YJS → ZUSTAND INITIAL SYNC
        // ---------------------------------------------

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
          console.log(
            "🔄 YJS → Zustand:",
            normalizedPath
          );

          console.log(
            "YJS length:",
            yjsContent.length
          );

          console.log(
            "Zustand length:",
            zustandContent.length
          );

          updateFileInStore(
            normalizedPath,
            yjsContent
          );
        }

        // ---------------------------------------------
        // STORE CURRENT YTEXT
        // ---------------------------------------------

        currentYTextRef.current =
          ytext;

        // ---------------------------------------------
        // YJS → ZUSTAND OBSERVER
        // ---------------------------------------------

        const observer = (
          _event: Y.YTextEvent,
          _transaction: Y.Transaction
        ) => {
          const content =
            ytext!.toString();

          console.log(
            "🔄 YJS changed:",
            normalizedPath
          );

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

        // ---------------------------------------------
        // MONACO ↔ YJS
        // ---------------------------------------------

        const binding =
          new MonacoBinding(
            ytext,

            model,

            new Set([
              editor,
            ]),

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

      // -----------------------------------------------
      // MONACO → ZUSTAND
      // -----------------------------------------------

      setupEditorChangeListener(
        editor
      );

      // -----------------------------------------------
      // CURRENT FILE
      // -----------------------------------------------

      const filePath =
        useProjectState
          .getState()
          .selectedFile?.path;

      console.log(
        "📂 Initial editor file:",
        filePath
      );

      if (
        filePath &&
        syncedRef.current
      ) {
        bindFileToYjs(
          editor,
          filePath
        );
      }

      // -----------------------------------------------
      // CTRL + S
      // SAVE ONLY
      // -----------------------------------------------

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

    // -----------------------------------------------
    // MAKE SURE MONACO → ZUSTAND LISTENER EXISTS
    // -----------------------------------------------

    setupEditorChangeListener(
      editor
    );

    // -----------------------------------------------
    // WAIT FOR YJS
    // -----------------------------------------------

    if (
      !syncedRef.current
    ) {
      console.log(
        "⏳ Waiting for YJS sync before binding:",
        filePath
      );

      return;
    }

    // -----------------------------------------------
    // BIND NEW FILE
    // -----------------------------------------------

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
  // CLEANUP MONACO ON UNMOUNT
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
  // RENDER
  // ===================================================

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
            automaticLayout: true,

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

        {/* =================================================
            BUTTONS
        ================================================= */}

        <div className="absolute right-4 top-4 z-30 flex gap-2">

          {/* SAVE */}

          <button
            type="button"
            onClick={
              handleSave
            }
            disabled={
              isSaving
            }
            className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "Saving..."
              : "Save"}
          </button>

          {/* RUN */}

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
            key={previewUrl}
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