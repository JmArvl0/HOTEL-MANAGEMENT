import Image from "next/image";

// Share the landing page's cropped, transparent mark across every surface.
export function HavenLogo({ size = 29 }: { size?: number; small?: boolean }) {
  return (
    <span className="haven-logo-tile haven-logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Image
        src="/haven-logo-small.png"
        alt=""
        width={size}
        height={size}
      />
    </span>
  );
}
