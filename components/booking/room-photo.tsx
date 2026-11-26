"use client";

import Image from "next/image";
import { useState } from "react";
import { roomPhotoNeedsDirectUrl } from "@/lib/room-images";

export function RoomPhoto({ src, alt, fill = false, sizes }: {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (failedSrc === src) return <span className="room-photo-unavailable">Photo unavailable</span>;
  const onError = () => setFailedSrc(src);
  if (fill) return <Image src={src} alt={alt} fill sizes={sizes} unoptimized={roomPhotoNeedsDirectUrl(src)} onError={onError} />;
  // Catalog dimensions vary. The containing figure owns the aspect ratio.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={onError} />;
}
