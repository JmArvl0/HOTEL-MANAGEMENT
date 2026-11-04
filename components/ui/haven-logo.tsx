import Image from "next/image";

// System brand mark (reference/system logo.png → public/haven-logo.png).
// Small marks use the cropped transparent asset for box-free sidebar branding.
export function HavenLogo({ size = 29, small = false }: { size?: number; small?: boolean }) {
  return (
    <span className={`haven-logo-tile${small ? " haven-logo-mark" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <Image
        src={small ? "/haven-logo-small.png" : "/haven-logo.png"}
        alt=""
        width={size}
        height={size}
        priority={false}
      />
    </span>
  );
}
