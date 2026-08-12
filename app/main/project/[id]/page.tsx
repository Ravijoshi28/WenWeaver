import { use } from "react";
import { MainEditor } from "../../Editor/Monaco";
import FileExplorer from "./fetchedFiles";

export default function MainFile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="flex h-screen">
      {/* Side Navigation */}
      <div className="w-64 border-r border-zinc-800">
        <FileExplorer id={id} />
      </div>

      {/* Editor */}
      <div className="flex-1">
        <MainEditor />
      </div>
    </div>
  );
}

