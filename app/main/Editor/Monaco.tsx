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
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, CodeIcon, FloppyDiskIcon, LayoutIcon, MonitorIcon, PlayIcon, DeviceMobileIcon, FileCodeIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useWorkspacePreferences } from "@/app/components/use-workspace-preferences";

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
  const { dark, compact, reducedMotion } = useWorkspacePreferences();
  const [view, setView] = useState<"editor" | "preview" | "split">("split");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const files = useProjectState(state => state.files);
  const visibleView = compact && view === "split" ? "editor" : view;

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
          console.warn("Operation failed in app/main/Editor/Monaco.tsx.");

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

            updateFileInStore(
              modelPath,
              content
            );
          });

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

        return SaveFile(
          ownerId,
          projectId,
          files
        );
      },

      onMutate: () => {

        setIsSaving(true);
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
        console.warn("Operation failed in app/main/Editor/Monaco.tsx.");

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

        return runPreview(
          projectId,
          files
        );
      },

      onMutate: () => {

        setIsRunning(true);
      },

      onSuccess: (data) => {

        setPreviewUrl(
          data.previewUrl
        );
        if (compact) setView("preview");
      },



      onSettled: () => {

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

        const observer = () => {
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

      },
      [
        cleanupBinding,
        updateFileInStore,
      ]
    );

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

    const syncHandler = (
      isSynced: boolean
    ) => {

      syncedRef.current = isSynced;
      setConnectionStatus(isSynced ? "synced" : "connecting");
      if (!isSynced) return;

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

    const statusHandler = ({ status }: { status: string }) => {
      if (status !== "connected") { syncedRef.current = false; setConnectionStatus(status); }
    };
    provider.on("status", statusHandler);

    provider.on(
      "sync",
      syncHandler
    );



    return () => {

      cleanupBinding();

      if (
        editorChangeListenerRef.current
      ) {
        editorChangeListenerRef.current.dispose();

        editorChangeListenerRef.current =
          null;
      }

      provider.off(
        "sync",
        syncHandler
      );



      provider.off("status", statusHandler);
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
    bindFileToYjs,
  ]);


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

    setupEditorChangeListener(
      editor
    );

    if (!syncedRef.current) {

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

  const defaultContent = "";

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


  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="editor-workspace">
      <div className="editor-toolbar">
        <div className="workspace-view-switch" role="group" aria-label="Workspace layout">
          <button type="button" aria-pressed={visibleView === "editor"} onClick={() => setView("editor")}><CodeIcon size={17} aria-hidden="true" /><span>Code</span></button>
          <button type="button" aria-pressed={visibleView === "preview"} onClick={() => setView("preview")}><MonitorIcon size={17} aria-hidden="true" /><span>Preview</span></button>
          {!compact && <button type="button" aria-pressed={visibleView === "split"} onClick={() => setView("split")}><LayoutIcon size={17} aria-hidden="true" /><span>Split</span></button>}
        </div>
        <div className="editor-actions">
          <button type="button" className="secondary-button" onClick={handleSave} disabled={isSaving || !files.length} title="Save project (Ctrl or Cmd + S)"><FloppyDiskIcon size={17} aria-hidden="true" />{isSaving ? "Saving..." : "Save"}</button>
          <button type="button" className="primary-button" onClick={handleRun} disabled={isRunning || !files.length}><PlayIcon size={17} aria-hidden="true" />{isRunning ? "Starting..." : "Run"}</button>
        </div>
      </div>
      {(saveMutation.isError || runMutation.isError) && <div role="alert" className="editor-error">{saveMutation.isError ? "Could not save your files. Your edits are still in this workspace; try Save again." : "Could not start the preview. Check your project and try Run again."}</div>}
      <div className="editor-panes" data-view={visibleView}>
        <section className="code-pane" aria-label="Code editor" hidden={visibleView === "preview"}>
          <div className="pane-header"><div className="pane-title"><FileCodeIcon size={17} aria-hidden="true" /><span title={currentPath}>{selectedFile ? currentFileName : "No file selected"}</span></div><span className="language-label">{selectedFile ? currentLanguage.replace("typescriptreact", "TSX") : "Monaco"}</span></div>
          <div className="monaco-container">
            {selectedFile ? <Editor
              path={currentPath}
              height="100%"
              width="100%"
              defaultValue={selectedFile.content ?? defaultContent}
              language={currentLanguage}
              theme={dark ? "vs-dark" : "vs"}
              beforeMount={handleBeforeMount}
              onMount={handleEditorMount}
              loading={<div role="status" className="editor-loading">Loading code editor...</div>}
              options={{ automaticLayout: true, minimap: { enabled: !compact }, fontSize: 14, fontFamily: "var(--font-geist-mono), monospace", padding: { top: 18, bottom: 18 }, tabSize: 2, smoothScrolling: !reducedMotion, cursorSmoothCaretAnimation: reducedMotion ? "off" : "on", cursorBlinking: reducedMotion ? "solid" : "blink", renderWhitespace: "selection", scrollBeyondLastLine: false, roundedSelection: true, folding: true, bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true }, wordWrap: compact ? "on" : "off", lineNumbers: "on", lineNumbersMinChars: 3, glyphMargin: !compact, renderLineHighlight: "all", overviewRulerBorder: false, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false }, contextmenu: true }}
            /> : <div className="pane-empty"><FileCodeIcon size={34} weight="light" aria-hidden="true" /><h2>Start with a file.</h2><p>Open Files and select a file to begin editing. Your changes stay in the workspace until you save.</p></div>}
          </div>
          <div className="pane-footer"><span className="file-path" title={currentPath}>{selectedFile ? currentPath : "Select a file from the explorer"}</span><span>UTF-8</span></div>
        </section>
        <section className="preview-pane" aria-label="Project preview" hidden={visibleView === "editor"}>
          <div className="pane-header"><div className="pane-title"><MonitorIcon size={17} aria-hidden="true" /><span>Preview</span></div>
            <div className="preview-tools">
              <button type="button" className="pane-icon-button" aria-label="Desktop preview" aria-pressed={previewDevice === "desktop"} onClick={() => setPreviewDevice("desktop")}><MonitorIcon size={17} aria-hidden="true" /></button>
              <button type="button" className="pane-icon-button" aria-label="Mobile preview" aria-pressed={previewDevice === "mobile"} onClick={() => setPreviewDevice("mobile")}><DeviceMobileIcon size={17} aria-hidden="true" /></button>
              <button type="button" className="pane-icon-button" aria-label="Reload preview" disabled={!previewUrl || isRunning} onClick={() => setPreviewKey(key => key + 1)}><ArrowsClockwiseIcon size={17} aria-hidden="true" /></button>
              {previewUrl && <a className="pane-icon-button" href={previewUrl} target="_blank" rel="noopener noreferrer" aria-label="Open preview in a new tab"><ArrowSquareOutIcon size={17} aria-hidden="true" /></a>}
            </div>
          </div>
          <div className="preview-canvas" data-device={previewDevice}>
            {isRunning ? <div className="pane-empty" role="status"><PlayIcon size={34} weight="light" aria-hidden="true" /><h2>Starting your preview.</h2><p>Preparing the workspace and installing project dependencies. This can take a moment.</p></div>
              : previewUrl ? <iframe key={previewUrl + previewKey} src={previewUrl} className="project-preview-frame" title="Project Preview" />
              : <div className="pane-empty"><MonitorIcon size={36} weight="light" aria-hidden="true" /><h2>See what you&apos;re building.</h2><p>Run your project to launch a preview here. Keep coding alongside it, or give it the full workspace.</p><button type="button" className="primary-button" onClick={handleRun} disabled={!files.length}><PlayIcon size={17} aria-hidden="true" /> Run project</button></div>}
          </div>
          <div className="pane-footer"><span>{isRunning ? "Starting sandbox" : previewUrl ? "Preview available" : "Not running"}</span><span>{previewDevice === "mobile" ? "Mobile viewport" : "Fit to panel"}</span></div>
        </section>
      </div>
      <footer className="editor-statusbar"><span className="collaboration-status" role="status"><UsersThreeIcon size={15} aria-hidden="true" />{connectionStatus === "synced" ? "Collaboration connected" : connectionStatus === "disconnected" ? "Collaboration disconnected" : "Connecting to collaboration..."}</span><span role="status">{isSaving ? "Saving files..." : saveMutation.isSuccess ? "Last save succeeded" : "Save to keep your changes"}</span></footer>
    </div>
  );
}
