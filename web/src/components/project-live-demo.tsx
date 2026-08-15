"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ProjectLiveDemo({ title, url }: { title: string; url: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="brand" size="pill" onClick={() => setOpen(true)}>
        ▶ Live Demo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[90vh] w-[min(1100px,calc(100%-2rem))] max-w-none p-0">
          <DialogHeader className="border-b border-line p-4">
            <DialogTitle>Live Demo {title}</DialogTitle>
          </DialogHeader>
          {open && <iframe src={url} title="Live demo" className="h-full w-full flex-1 border-0" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
