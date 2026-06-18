"use client";

import { ChevronLeft, ChevronRight, Check, X, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Photo } from "@/types/selection";

export default function ImageViewer({ photos, startIndex, onClose, onToggleSelect, selectedIds, type }: {
  photos: Photo[];
  startIndex: number;
  onClose: () => void;
  onToggleSelect: (photo: Photo) => void;
  selectedIds: string[];
  type: string;
}) {
  const [index, setIndex] = useState(startIndex);
  const photo = photos[index];
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [photos.length, onClose]);

  if (!photo) return null;

  const isSelected = selectedIds.includes(photo.id);
  const prev = index > 0;
  const next = index < photos.length - 1;

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4"
      onClick={handleBackdropClick}>
      {/* Close button top-left */}
      <button className="absolute left-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
        onClick={onClose} aria-label="Fermer">
        <X size={22} />
      </button>

      {/* Counter top-center */}
      <span className="absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-sm font-bold text-white">
        {index + 1} / {photos.length}
      </span>

      {/* Select button top-right */}
      <button
        className={clsx(
          "absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black shadow-lg transition",
          isSelected ? "bg-leaf text-white" : "bg-white/20 text-white hover:bg-white/30"
        )}
        onClick={() => onToggleSelect(photo)}
      >
        {isSelected ? <Check size={20} /> : <Square size={20} />}
        {isSelected ? "Selectionne" : "Selectionner"}
      </button>

      {/* Previous arrow */}
      {prev && (
        <button
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60"
          onClick={() => setIndex(index - 1)}
          aria-label="Precedente">
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Image */}
      <div className="relative flex items-center justify-center">
        <div className="photo-protection max-h-[85vh] max-w-[90vw] overflow-hidden rounded-lg">
          <img
            alt={photo.filename}
            className="max-h-[85vh] max-w-[90vw] object-contain"
            src={photo.watermarkedUrl}
          />
        </div>
      </div>

      {/* Next arrow */}
      {next && (
        <button
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60"
          onClick={() => setIndex(index + 1)}
          aria-label="Suivante">
          <ChevronRight size={28} />
        </button>
      )}

      {/* Filename bottom */}
      <span className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-xs text-white/70">
        {photo.filename}
      </span>
    </div>
  );
}
