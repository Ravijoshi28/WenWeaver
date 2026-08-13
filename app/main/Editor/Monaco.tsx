"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, BeforeMount, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";

import { useProjectState } from "@/useStates/projectStates";
import { runDockerContainer } from "@/ApiCalls/docker/docker";
import { useMutation } from "@tanstack/react-query";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

function normalizePath(value?: string): string {
  if (!value) return "";

  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

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
      normalizePath(currentPath) === normalizedTarget
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

      if (found) return found;
    }
  }

  return null;
}

function getLanguageFromFileName(
  filename?: string
): string {
  if (!filename) return "typescriptreact";

  const name = filename.toLowerCase();

  if (name.endsWith(".tsx")) return "typescriptreact";
  if (name.endsWith(".jsx")) return "javascriptreact";
  if (name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".js")) return "javascript";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".scss")) return "scss";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".md")) return "markdown";

  return "plaintext";
}

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
        getNodePath(node, parentPath);

      if (
        node.type === "file" &&
        normalizePath(currentPath) === normalizedTarget
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

export function MainEditor() {
  const selectedFile =
    useProjectState(
      (state) => state.selectedFile
    );

  const project =
    useProjectState(
      (state) => state.project
    );

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null);

  /*
   * =====================================================
   * EDITOR / YJS REFS
   * =====================================================
   */

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

  /*
   * IMPORTANT:
   *
   * We keep track of the observer that WE created.
   * This allows us to correctly call ytext.unobserve()
   * when changing files / destroying the editor.
   */
  const ytextObserverRef =
    useRef<{
      ytext: Y.Text;
      // Yjs doesn't export a YTextObserver type from the bundled index in some
      // setups. Use a generic callback type to avoid the missing export error.
      observer: (event: any) => void;
    } | null>(null);

  /*
   * =====================================================
   * CLEANUP MONACO ↔ YJS BINDING
   * =====================================================
   */

  const cleanupBinding = useCallback(() => {
    console.log("🧹 Cleaning up Monaco ↔ YJS binding");

    /*
     * First remove our own Y.Text observer.
     */
    if (ytextObserverRef.current) {
      const {
        ytext,
        observer,
      } = ytextObserverRef.current;

      console.log(
        "🧹 Removing Y.Text observer"
      );

      ytext.unobserve(observer);

      ytextObserverRef.current = null;
    }

    /*
     * Then destroy MonacoBinding.
     */
    if (bindingRef.current) {
      console.log(
        "🧹 Destroying MonacoBinding"
      );

      bindingRef.current.destroy();

      bindingRef.current = null;
    }

    currentYTextRef.current = null;
  }, []);

  /*
   * =====================================================
   * CREATE YJS CONNECTION
   * =====================================================
   */

  useEffect(() => {
    const projectId =
      project?.projectId;

    if (!projectId) return;

    /*
     * Prevent duplicate connection.
     */
    if (
      ydocRef.current &&
      providerRef.current
    ) {
      return;
    }

    console.log(
      "🟢 Creating YJS connection"
    );

    const ydoc = new Y.Doc();

    const room =
      `project:${projectId}`;

    console.log(
      "🏠 Room:",
      room
    );

    console.log(
      "🆔 Client:",
      ydoc.clientID
    );

    /*
     * Both browsers must use the SAME
     * WebSocket server.
     */
    const provider =
      new WebsocketProvider(
        "ws://localhost:1234",
        room,
        ydoc,
        {
          connect: true,
        }
      );

    ydocRef.current = ydoc;
    providerRef.current = provider;

    /*
     * User awareness.
     */
    provider.awareness.setLocalStateField(
      "user",
      {
        id: String(ydoc.clientID),
        name: `User ${ydoc.clientID}`,
        color: "#3b82f6",
      }
    );

    /*
     * WebSocket status.
     */
    const statusHandler = ({
      status,
    }: {
      status: string;
    }) => {
      console.log(
        "🌐 WEBSOCKET STATUS:",
        status
      );
    };

    provider.on(
      "status",
      statusHandler
    );

    /*
     * Yjs synchronization.
     *
     * IMPORTANT:
     * We only set syncedRef here.
     *
     * The actual editor binding is handled
     * by handleEditorMount / selectedFile effect.
     */
    const syncHandler = (
      isSynced: boolean
    ) => {
      console.log(
        "🔄 YJS SYNC:",
        isSynced
      );

      if (isSynced) {
        syncedRef.current = true;

        console.log(
          "✅ YJS DOCUMENT SYNCED"
        );

        const filesMap =
          ydoc.getMap<Y.Text>("files");

        console.log(
          "📁 YJS FILES:",
          Array.from(filesMap.keys())
        );

        /*
         * If Monaco is already mounted,
         * bind the currently selected file.
         */
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
      }
    };

    provider.on(
      "sync",
      syncHandler
    );

    /*
     * Awareness.
     */
    const awarenessHandler = () => {
      const states =
        provider.awareness.getStates();

      console.log(
        "👥 COLLABORATORS:",
        states.size
      );

      console.log(
        "👥 USERS:",
        Array.from(states.entries())
      );
    };

    provider.awareness.on(
      "change",
      awarenessHandler
    );

    /*
     * DEBUG ALL YJS UPDATES.
     */
    const updateHandler = (
      update: Uint8Array,
      origin: unknown
    ) => {
      console.log(
        "📡 YJS UPDATE RECEIVED",
        {
          bytes: update.length,
          origin,
          clientID: ydoc.clientID,
        }
      );
    };

    ydoc.on(
      "update",
      updateHandler
    );

    /*
     * Cleanup.
     */
    return () => {
      console.log(
        "🔴 Destroying YJS:",
        room
      );

      /*
       * Remove our Monaco/Y.Text binding.
       */
      cleanupBinding();

      /*
       * Remove provider listeners.
       */
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

      ydoc.off(
        "update",
        updateHandler
      );

      /*
       * Destroy provider/doc.
       */
      provider.destroy();
      ydoc.destroy();

      providerRef.current = null;
      ydocRef.current = null;

      syncedRef.current = false;
    };
  }, [
    project?.projectId,
    cleanupBinding,
  ]);

  /*
   * =====================================================
   * UPDATE ZUSTAND
   * =====================================================
   */

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
            "⚠️ File not found:",
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
                    normalizePath(filePath),

                  name:
                    selected?.name ??
                    normalizePath(filePath)
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

  /*
   * =====================================================
   * BIND MONACO TO YJS
   * =====================================================
   */

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

        if (!ydoc || !provider) {
          console.warn(
            "⚠️ YJS not ready"
          );

          return;
        }

        /*
         * Do not create/seed Y.Text before
         * the document has synchronized.
         */
        if (!syncedRef.current) {
          console.log(
            "⏳ Waiting for YJS sync..."
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

        console.log(
          "🔗 Binding:",
          normalizedPath
        );

        /*
         * IMPORTANT:
         *
         * Always clean up the previous
         * observer + binding first.
         */
        cleanupBinding();

        const filesMap =
          ydoc.getMap<Y.Text>("files");

        let ytext =
          filesMap.get(
            normalizedPath
          );

        /*
         * Only create Y.Text if it
         * doesn't already exist.
         */
        if (!ytext) {
          console.log(
            "🆕 Creating Y.Text:",
            normalizedPath
          );

          ytext = new Y.Text();

          const state =
            useProjectState.getState();

          const existingFile =
            findFileByPath(
              state.files as FileNode[],
              normalizedPath
            );

          const initialContent =
            existingFile?.content ?? "";

          /*
           * Seed only once.
           */
          if (initialContent) {
            ytext.insert(
              0,
              initialContent
            );
          }

          filesMap.set(
            normalizedPath,
            ytext
          );
        } else {
          console.log(
            "♻️ Existing Y.Text:",
            normalizedPath
          );
        }

        currentYTextRef.current =
          ytext;

        /*
         * =================================================
         * Y.TEXT OBSERVER
         * =================================================
         *
         * This observer belongs to us.
         *
         * We store it in ytextObserverRef so that
         * cleanupBinding() can call ytext.unobserve().
         */

        const ytextObserver = (
          event: Y.YTextEvent | any,
          transaction: Y.Transaction
        ) => {
          console.log(
            "✏️ YText changed:",
            normalizedPath
          );

          console.log(
            "📄 Content:",
            ytext!.toString()
          );

          console.log(
            "🌍 Local transaction:",
            transaction.local
          );

          /*
           * Sync collaborative content
           * into Zustand.
           */
          updateFileInStore(
            normalizedPath,
            ytext!.toString()
          );
        };

        // yjs typings expect observer: (event: any) => void
        // our observer receives (event, transaction). Cast to any to satisfy TS.
        ytext.observe(
          ytextObserver as any
        );

        /*
         * IMPORTANT:
         *
         * Keep a reference to the exact
         * observer we attached.
         */
        ytextObserverRef.current = {
          ytext,
          observer: ytextObserver as any,
        };

        /*
         * =================================================
         * MONACO ↔ YJS
         * =================================================
         */

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
          "✅ Monaco ↔ YJS BOUND:",
          normalizedPath
        );
      },
      [
        cleanupBinding,
        updateFileInStore,
      ]
    );

  /*
   * =====================================================
   * MONACO MOUNT
   * =====================================================
   */

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

      const filePath =
        useProjectState
          .getState()
          .selectedFile?.path;

      /*
       * If YJS is already synced,
       * bind immediately.
       */
      if (
        filePath &&
        syncedRef.current
      ) {
        bindFileToYjs(
          editor,
          filePath
        );
      }

      /*
       * We NO LONGER add another
       * provider "sync" listener here.
       *
       * The main YJS connection effect
       * already handles sync.
       */

      /*
       * Ctrl + S.
       */
      editor.addAction({
        id: "save-and-run",

        label: "Save and Run",

        keybindings: [
          monaco.KeyMod.CtrlCmd |
            monaco.KeyCode.KeyS,
        ],

        run: () => {
          handleRun();
        },
      });
    };

  /*
   * =====================================================
   * SWITCH FILE
   * =====================================================
   */

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

    if (!syncedRef.current) {
      console.log(
        "⏳ Cannot bind yet - YJS not synced"
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
  ]);

  /*
   * =====================================================
   * RUN
   * =====================================================
   */

  const runMutation =
    useMutation({
      mutationFn: ({
        ownerId,
        id,
        files,
      }: {
        ownerId: string;
        id: string;
        files: FileNode[];
      }) =>
        runDockerContainer(
          ownerId,
          id,
          files
        ),

      onSuccess: (data) => {
        if (data?.previewUrl) {
          setPreviewUrl(
            data.previewUrl
          );
        }
      },

      onError: (error: Error) => {
        console.error(
          "Docker Error:",
          error
        );
      },
    });

  /*
   * =====================================================
   * RUN PROJECT
   * =====================================================
   */

  const handleRun =
    useCallback(() => {
      const ownerId =
        project?.ownerId;

      const projectId =
        project?.projectId;

      if (
        !ownerId ||
        !projectId
      ) {
        return;
      }

      const state =
        useProjectState.getState();

      const files =
        state.files as FileNode[];

      runMutation.mutate({
        ownerId,
        id: projectId,
        files,
      });
    }, [
      project?.ownerId,
      project?.projectId,
      runMutation,
    ]);

  /*
   * =====================================================
   * MONACO CONFIG
   * =====================================================
   */

  const handleBeforeMount:
    BeforeMount = (monaco) => {
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
          allowNonTsExtensions: true,
        });

      monaco.languages.typescript
        .javascriptDefaults
        .setCompilerOptions({
          jsx:
            monaco.languages.typescript
              .JsxEmit.ReactJSX,

          allowJs: true,
          allowNonTsExtensions: true,
        });
    };

  /*
   * =====================================================
   * RENDER
   * =====================================================
   */

  const defaultContent =
`export function Welcome() {
  console.log("Welcome dear Friend !!!");
}`;

  const currentPath =
    normalizePath(
      selectedFile?.path ??
        selectedFile?.name
    ) || "app/page.tsx";

  const currentLanguage =
    getLanguageFromFileName(
      currentPath
    );

  return (
    <div className="flex h-full w-full">

      <div className="relative h-full w-1/2 min-w-0">

        <Editor
          path={currentPath}
          height="100%"
          width="100%"
          defaultValue={
            selectedFile?.content ??
            defaultContent
          }
          language={currentLanguage}
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

        <div className="absolute right-4 top-4 z-30">

          <button
            type="button"
            onClick={handleRun}
            disabled={
              runMutation.isPending
            }
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
          >
            {runMutation.isPending
              ? "Running..."
              : "Run"}
          </button>

        </div>

      </div>

      <div className="flex h-full w-1/2 bg-slate-900">

        {previewUrl ? (
          <iframe
            src={previewUrl}
            className="h-full w-full border-none bg-white"
            title="Preview"
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