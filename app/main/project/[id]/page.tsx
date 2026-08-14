"use client";

import { use } from "react";

import { MainEditor } from "../../Editor/Monaco";
import FileExplorer from "./fetchedFiles";

import { useProjectState } from "@/useStates/projectStates";

export default function MainFile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { selectedFile } =
    useProjectState();

  const { id } = use(params);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#070a10] text-white">

      {/* =================================================
          TOP NAVIGATION BAR
      ================================================= */}

      <header className="relative z-50 flex h-12 shrink-0 items-center border-b border-white/[0.07] bg-[#0d111a]/95 px-4 shadow-lg shadow-black/10 backdrop-blur-xl">

        {/* LEFT — BRAND */}

        <div className="flex w-1/3 items-center gap-3">

          {/* Logo */}

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

          <div className="flex flex-col">

            <span className="text-sm font-semibold tracking-tight text-white">
              WebWeaver
            </span>

            <span className="hidden text-[9px] uppercase tracking-widest text-gray-600 sm:block">
              Development Workspace
            </span>

          </div>

        </div>

        {/* CENTER — CURRENT FILE */}

        <div className="flex min-w-0 flex-1 items-center justify-center">

          <div className="flex min-w-0 max-w-[70%] items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 shadow-inner">

            {/* File Icon */}

            <svg
              className="h-3.5 w-3.5 shrink-0 text-blue-400"
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

            <span className="truncate text-xs font-medium text-gray-300">
              {selectedFile?.path ||
                "Unnamed File"}
            </span>

          </div>

        </div>

        {/* RIGHT — PREVIEW */}

        <div className="flex w-1/3 items-center justify-end">

          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-1.5">

            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60" />

            <span className="text-xs font-medium text-gray-400">
              Preview
            </span>

          </div>

        </div>

      </header>

      {/* =================================================
          MAIN WORKSPACE
      ================================================= */}

      <div className="flex min-h-0 flex-1">

        {/* =================================================
            FILE EXPLORER
        ================================================= */}

        <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.07] bg-[#0a0d14]">

          {/* Explorer Header */}

          <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0d111a] px-3">

            <div className="flex items-center gap-2">

              <svg
                className="h-3.5 w-3.5 text-gray-500"
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

              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                Explorer
              </span>

            </div>

            <div className="h-1.5 w-1.5 rounded-full bg-blue-500/60" />

          </div>

          {/* Explorer Content */}

          <div className="min-h-0 flex-1 overflow-hidden">

            <FileExplorer id={id} />

          </div>

        </aside>

        {/* =================================================
            EDITOR
        ================================================= */}

        <main className="min-w-0 flex-1 overflow-hidden">

          <MainEditor />

        </main>

      </div>

    </div>
  );
}