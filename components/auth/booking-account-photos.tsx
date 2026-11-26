"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize, Star } from "lucide-react";
import { RoomPhotoLightbox } from "@/components/booking/room-photo-lightbox";
import { roomPhotoNeedsDirectUrl } from "@/lib/room-images";

export function BookingAccountPhotos({ photos, roomName }: { photos: string[]; roomName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const count = photos.length;
  if (count === 0) return null;

  const index = activeIndex % count;
  const image = photos[index];
  const step = (offset: number) => setActiveIndex(current => (current + offset + count) % count);

  return (
    <div className="booking-account-media">
      <Image
        className="booking-account-photo"
        src={image}
        alt={count === 1 ? `${roomName} representative room photo` : `${roomName} room photo ${index + 1} of ${count}`}
        fill
        sizes="(max-width: 680px) calc(100vw - 32px), (max-width: 900px) 660px, (max-width: 1440px) 42vw, 585px"
        loading="eager"
        unoptimized={roomPhotoNeedsDirectUrl(image)}
      />
      <span className="booking-account-selected"><Star size={17} fill="currentColor" aria-hidden="true" /> Selected Room</span>
      <button
        type="button"
        className="booking-account-expand"
        aria-label={`Open ${roomName} photo gallery`}
        aria-haspopup="dialog"
        onClick={() => setExpanded(true)}
      >
        <Maximize size={23} aria-hidden="true" />
      </button>

      {count > 1 && (
        <div className="booking-account-pagination" role="group" aria-label="Room photos">
          <button type="button" aria-label="Previous room photo" onClick={() => step(-1)}>
            <ChevronLeft size={21} aria-hidden="true" />
          </button>
          <span className="booking-account-photo-count" role="status">
            <span aria-hidden="true">{index + 1} / {count}</span>
            <span className="booking-account-photo-announcement">Photo {index + 1} of {count}</span>
          </span>
          <button type="button" aria-label="Next room photo" onClick={() => step(1)}>
            <ChevronRight size={21} aria-hidden="true" />
          </button>
        </div>
      )}

      <RoomPhotoLightbox
        photos={photos}
        roomName={roomName}
        index={expanded ? index : null}
        onClose={() => setExpanded(false)}
        onIndexChange={setActiveIndex}
      />
    </div>
  );
}
