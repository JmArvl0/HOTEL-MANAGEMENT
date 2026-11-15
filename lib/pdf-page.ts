// Shared one-page A4 primitives for the receipt and closed-day review.
const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;
export const MARGIN = 56;

const round = (value: number) => Math.round(value * 100) / 100;

/* WinAnsi covers Latin-1, so anything outside ASCII must go before it reaches a
   PDF string literal — and a stray `(` or `\` would corrupt the object. */
function ascii(value: string): string {
  return value
    .replace(/₱/g, "PHP ")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

const escapeText = (value: string) => ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export const pdfText = (font: "F1" | "F2", size: number, x: number, y: number, value: string, gray: number) =>
  `${gray} g BT /${font} ${size} Tf 1 0 0 1 ${round(x)} ${round(y)} Tm (${escapeText(value)}) Tj ET`;

export const pdfRule = (y: number) => `0.8 w 0.8 G ${MARGIN} ${round(y)} m ${round(A4_WIDTH - MARGIN)} ${round(y)} l S`;

export function assembleA4Pdf(content: string): Uint8Array<ArrayBuffer> {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${A4_WIDTH} ${A4_HEIGHT}]/Resources<</Font<</F1 4 0 R/F2 5 0 R>>>>/Contents 6 0 R>>`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`
  ];
  // Offsets are byte offsets; `content` is ASCII by construction, so string
  // length and byte length agree.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  // Re-wrapped so the result is backed by a plain ArrayBuffer, which is what
  // Blob() accepts — TextEncoder's declared return type is ArrayBufferLike.
  return new Uint8Array(new TextEncoder().encode(pdf));
}
