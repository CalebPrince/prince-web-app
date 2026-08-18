"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ProjectLiveDemo({ title, url }: { title: string; url: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        <Play className="size-4 fill-current" aria-hidden="true" />
        Live Demo
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Live Demo — ${title}`} className="h-[90vh]">
        {open && <iframe src={url} title="Live demo" className="h-full w-full border-0" />}
      </Modal>
    </>
  );
}
