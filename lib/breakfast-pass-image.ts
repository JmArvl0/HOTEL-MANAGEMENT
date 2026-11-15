import QRCode from "qrcode";
import sharp from "sharp";

const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);

export async function breakfastPassPng(pass: { code: string; date: string; hours: string; venue: string; room: string; reference: string; allowance: number }) {
  const qr = await QRCode.toDataURL(pass.code, { width: 440, margin: 4, errorCorrectionLevel: "M" });
  function text(value: string, y: number, max = 34, serif = false, color = "#19382e") {
    const size = Math.min(max, Math.floor(1260 / Math.max(1, [...value].length)));
    return `<text x="450" y="${y}" text-anchor="middle" fill="${color}" font-family="${serif ? "Georgia, serif" : "Arial, sans-serif"}" font-size="${size}">${escape(value)}</text>`;
  }
  const words = pass.venue.split(/\s+/);
  const split = words.findIndex((_, index) => words.slice(0, index + 1).join(" ").length >= 32);
  const venueLines = split >= 0 && split < words.length - 1 ? [words.slice(0, split + 1).join(" "), words.slice(split + 1).join(" ")] : [pass.venue];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1260">
    <rect width="900" height="1260" fill="#ede9df"/>
    <rect x="35" y="35" width="830" height="1190" rx="24" fill="#fffdf8"/>
    <path d="M59 35h782a24 24 0 0 1 24 24v214H35V59a24 24 0 0 1 24-24" fill="#143b2c"/>
    ${text("Haven", 108, 42, true, "#ddc78a")}${text("Breakfast pass", 208, 62, true, "#fff9e8")}
    ${text(pass.date, 356, 44, true)}${text(pass.hours, 405, 26)}
    ${venueLines.map((line, index) => text(line, 453 + index * 32, 30, true)).join("")}${text(`Breakfast for ${pass.allowance} ${pass.allowance === 1 ? "guest" : "guests"}`, 526, 27)}
    <image href="${qr}" x="230" y="554" width="440" height="440"/>
    ${text(pass.room, 1039, 24)}${text(pass.reference, 1081, 21)}
    <path d="M95 1114h710" stroke="#c9c9bd" stroke-width="2" stroke-dasharray="7 8"/>
    ${text("Present this pass at the restaurant.", 1154, 22)}${text("Staff verify remaining meals when scanned.", 1188, 20)}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
