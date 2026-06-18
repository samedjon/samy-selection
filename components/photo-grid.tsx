"use client";

import { Check, Crown, Eye, Maximize2 } from "lucide-react";
import clsx from "clsx";
import type { Photo, SelectionState, SelectionType } from "@/types/selection";

export default function PhotoGrid({ currentType, photos, selections, togglePhoto }: {
  currentType: SelectionType;
  photos: Photo[];
  selections: SelectionState;
  togglePhoto: (photo: Photo, type: SelectionType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {photos.map((photo) => {
        const selected = selections[currentType].includes(photo.id);
        const isPremium = selections.premium.includes(photo.id);
        const isEnlargement = selections.enlargement.includes(photo.id);
        return (
          <button
            key={photo.id}
            className={clsx("group relative overflow-hidden rounded-lg bg-ink/10 text-left ring-2 transition", selected ? "ring-leaf" : "ring-transparent")}
            onClick={() => togglePhoto(photo, currentType)}
          >
            <div className="photo-protection relative aspect-[3/4] overflow-hidden">
              <img alt={photo.filename} className="h-full w-full object-cover" src={photo.watermarkedUrl} />
            </div>
            <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[11px] font-bold text-white">{photo.filename}</span>
            <span className={clsx("absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full text-white shadow-lg", selected ? "bg-leaf" : "bg-black/45")}>
              {selected ? <Check size={22} /> : <Eye size={20} />}
            </span>
            <div className="absolute bottom-2 left-2 flex gap-1">
              {isPremium ? <span className="rounded-full bg-gold px-2 py-1 text-[11px] font-black text-ink">Premium</span> : null}
              {isEnlargement ? <span className="rounded-full bg-clay px-2 py-1 text-[11px] font-black text-white">Grand</span> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
