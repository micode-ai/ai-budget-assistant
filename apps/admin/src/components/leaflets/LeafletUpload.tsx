"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { leafletErrorMessage, useUploadLeaflet } from "@/hooks/use-leaflets";

const MAX_PAGES = 60;
const MAX_MB = 50;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Client-side check mirroring the server: images, or exactly one PDF. */
function validate(files: File[]): string | null {
  if (files.length === 0) return "Choose leaflet images or one PDF.";
  const pdfs = files.filter((f) => f.type === "application/pdf");
  if (pdfs.length > 0 && files.length > 1) return "Upload either images or exactly one PDF.";
  if (pdfs.length === 0 && files.some((f) => !IMAGE_TYPES.includes(f.type))) {
    return "Only PNG, JPEG or WebP images, or one PDF.";
  }
  if (files.length > MAX_PAGES) return `At most ${MAX_PAGES} pages per upload.`;
  if (files.reduce((s, f) => s + f.size, 0) > MAX_MB * 1024 * 1024) return `At most ${MAX_MB} MB per upload.`;
  return null;
}

export function LeafletUpload({ onUploaded }: { onUploaded: (id: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useUploadLeaflet();

  const submit = async (files: File[]) => {
    const problem = validate(files);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      const { id } = await upload.mutateAsync(files);
      toast.success("Uploaded. Reading the leaflet...");
      onUploaded(id);
    } catch (err) {
      toast.error(await leafletErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a leaflet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void submit(Array.from(e.dataTransfer.files));
          }}
          className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-8 text-center ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop PNG/JPEG/WebP pages, or one PDF (up to {MAX_PAGES} pages, {MAX_MB} MB).
          </p>
          <Button disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
            {upload.isPending ? "Uploading..." : "Choose files"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void submit(files);
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Files are read once and discarded. Only the extracted offers are kept, and images are never shown again.
        </p>
      </CardContent>
    </Card>
  );
}
