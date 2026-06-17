"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

type MindMapBranch = {
  name: string;
  nodes?: string[];
  branches?: MindMapBranch[];
};

type MindMapRoot = {
  name: string;
  nodes?: string[];
  branches?: MindMapBranch[];
};

export type MindMapDocument = {
  root?: MindMapRoot;
  name?: string;
  branches?: MindMapBranch[];
  nodes?: string[];
};

function normalizeRoot(data: unknown): MindMapRoot | null {
  if (!data || typeof data !== "object") return null;
  const doc = data as MindMapDocument;
  if (doc.root && typeof doc.root.name === "string") {
    return doc.root;
  }
  if (typeof doc.name === "string") {
    return {
      name: doc.name,
      nodes: doc.nodes,
      branches: doc.branches,
    };
  }
  return null;
}

function BranchSection({
  branch,
  depth = 0,
  defaultOpen,
}: {
  branch: MindMapBranch;
  depth?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 2);
  const hasChildren =
    (branch.nodes?.length ?? 0) > 0 || (branch.branches?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-700/80 bg-zinc-900/60",
        depth > 0 && "ml-4 border-l-2 border-l-violet-500/40",
      )}
    >
      <button
        type="button"
        onClick={() => hasChildren && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
          hasChildren && "cursor-pointer hover:bg-zinc-800/80",
          !hasChildren && "cursor-default",
        )}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-violet-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-violet-400" />
          )
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <span className="text-sm font-semibold text-white">{branch.name}</span>
        {hasChildren && (
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            {open ? "Collapse" : "Expand"}
          </span>
        )}
      </button>

      {open && hasChildren && (
        <div className="space-y-2 border-t border-zinc-800 px-3 pb-3 pt-2">
          {branch.nodes?.map((node) => (
            <div
              key={node}
              className="rounded-md border border-zinc-700/60 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-[#f15a24]/30 hover:bg-zinc-900"
            >
              {node}
            </div>
          ))}
          {branch.branches?.map((child) => (
            <BranchSection key={child.name} branch={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MindMapPlayground({
  data,
  title,
}: {
  data: unknown;
  title?: string;
}) {
  const root = useMemo(() => normalizeRoot(data), [data]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const zoomIn = () => setScale((s) => Math.min(1.6, s + 0.1));
  const zoomOut = () => setScale((s) => Math.max(0.6, s - 0.1));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset.x, offset.y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (!root) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-400">
        Mind map JSON format is not recognized. Expected a <code className="text-zinc-300">root</code>{" "}
        object with <code className="text-zinc-300">name</code> and <code className="text-zinc-300">branches</code>.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Drag to pan · click branches to expand
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[3rem] text-center text-xs font-mono text-zinc-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
            aria-label="Reset view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(46,49,146,0.12),transparent_45%),radial-gradient(circle_at_70%_80%,rgba(241,90,36,0.08),transparent_40%),#0a0a0b] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute left-1/2 top-1/2 w-[min(100%,720px)] p-6"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <div className="mb-5 flex flex-col items-center gap-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-950/40 px-4 py-1.5">
              <Maximize2 className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                Interactive mind map
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {root.name}
            </h3>
            {title && <p className="text-xs text-zinc-500">{title}</p>}
          </div>

          {root.nodes?.length ? (
            <div className="mb-4 flex flex-wrap justify-center gap-2">
              {root.nodes.map((node) => (
                <span
                  key={node}
                  className="rounded-full border border-[#f15a24]/30 bg-[#f15a24]/10 px-3 py-1 text-xs font-medium text-[#f15a24]"
                >
                  {node}
                </span>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            {root.branches?.map((branch) => (
              <BranchSection key={branch.name} branch={branch} defaultOpen />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
