import { crc32 } from "node:zlib";
import type { FinanceCloseExport } from "@/lib/finance-export";

const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const xml = (content: string) => `<?xml version="1.0" encoding="UTF-8"?>${content}`;
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function writeCloseWorkbook(batch: FinanceCloseExport): Uint8Array<ArrayBuffer> {
  const table: [string, string | number][] = [
    ["HAVEN · Closed-day finance summary", ""],
    ["Business date", batch.date],
    ["Batch ID", batch.id],
    ["Closed at (UTC)", batch.closedAt],
    ["Status", batch.status],
    ["Measure", `Amount (${batch.currency})`],
    ...batch.lines.map((line): [string, number] => [line.label, line.minor / 100]),
  ];
  const rows = table.map((values, index) => {
    const number = index + 1;
    const cells = values.map((value, column) => {
      const ref = `${column === 0 ? "A" : "B"}${number}`;
      const style = index === 0 || index === 5 ? 1 : typeof value === "number" ? 2 : 0;
      return typeof value === "number"
        ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
        : `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
    });
    return `<row r="${number}" ht="${index === 0 ? 29 : 21}" customHeight="1">${cells.join("")}</row>`;
  }).join("");
  return packWorkbook({
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${spreadsheet}" xmlns:r="${relationships}">
      <bookViews><workbookView/></bookViews>
      <sheets><sheet name="Closed day" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="rId1" Type="${relationships}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relationships}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${spreadsheet}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173F3C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${spreadsheet}"><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="41" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/></cols><sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`,
  });
}

/** Small, uncompressed ZIP for the fixed Office Open XML package. */
function packWorkbook(parts: Record<string, string>): Uint8Array<ArrayBuffer> {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [path, value] of Object.entries(parts)) {
    const name = Buffer.from(path, "ascii");
    const body = Buffer.from(xml(value), "utf8");
    const checksum = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(33, 12); // ZIP date 1980-01-01 for reproducible bytes.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE(offset, 42);
    files.push(local, name, body);
    directory.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(directory.reduce((sum, part) => sum + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...files, ...directory, end]));
}
