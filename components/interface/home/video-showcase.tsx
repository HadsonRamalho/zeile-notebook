"use client";

import { Play } from "lucide-react";
import { useState } from "react";

const DEMOS = [
  { id: "1166077256", title: "Zeile Demo Left" },
  { id: "1166078982", title: "Zeile Demo Right" },
];

function demoSrc(id: string) {
  return `https://player.vimeo.com/video/${id}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1&background=1`;
}

function DemoPane({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div style={{ paddingBottom: "100%", position: "relative" }}>
      {playing ? (
        <iframe
          src={demoSrc(id)}
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "block",
          }}
          title={title}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={title}
          className="absolute inset-0 flex h-full w-full items-center justify-center bg-black transition-colors hover:bg-neutral-900"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25 backdrop-blur-sm transition-transform group-hover:scale-105">
            <Play className="ml-0.5 h-7 w-7 fill-white text-white" />
          </span>
        </button>
      )}
    </div>
  );
}

export function VideoShowcase() {
  return (
    <section className="relative z-20 mt-10 w-full px-4 md:mx-auto md:max-w-7xl md:px-6">
      <div className="relative overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <div className="mx-auto flex h-6 items-center rounded bg-background px-4 text-xs font-medium text-muted-foreground shadow-sm">
            zeile.app/demo
          </div>
        </div>

        <div className="flex w-full flex-col md:flex-row bg-black">
          <div className="relative w-full md:w-1/2 border-b md:border-b-0 md:border-r border-white/10">
            <DemoPane id={DEMOS[0].id} title={DEMOS[0].title} />
          </div>

          <div className="relative w-full md:w-1/2">
            <DemoPane id={DEMOS[1].id} title={DEMOS[1].title} />
          </div>
        </div>
      </div>
    </section>
  );
}
