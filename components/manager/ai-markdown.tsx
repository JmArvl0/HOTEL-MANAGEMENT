import { Fragment, type ReactNode } from "react";

/**
 * Minimal safe Markdown renderer for HAVEN AI assistant answers.
 * Zero dependencies, no dangerouslySetInnerHTML — everything renders as
 * React text nodes, so raw HTML/script output is inert by construction.
 *
 * Supported subset: ## / ### headings, paragraphs, unordered lists,
 * ordered lists (with one nested level via indented continuation lines),
 * **bold**, *italic*, `inline code`, --- rules, line breaks.
 * Anything else (tables, images, links, raw HTML) renders as plain text.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Split on **bold**, *italic*, `code` — unmatched markers stay literal.
  const pattern = /(\*\*.+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;
  const parts = text.split(pattern);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 5) {
      return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 3) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 3) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

interface ListItem {
  content: string;
  children: string[];
}

interface Block {
  kind: "heading2" | "heading3" | "rule" | "ul" | "ol" | "para";
  lines?: string[];
  items?: ListItem[];
}

const UL_MARKER = /^\s*([-*+])\s+(.*)$/;
const OL_MARKER = /^\s*(\d+)[.)]\s+(.*)$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let index = 0;

  const flushPara = (lines: string[]) => {
    if (lines.length) blocks.push({ kind: "para", lines });
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const heading = line.match(/^\s*(#{2,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: heading[1].length === 2 ? "heading2" : "heading3", lines: [heading[2]] });
      index += 1;
      continue;
    }
    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    const listKind: Block["kind"] | null =
      UL_MARKER.test(line) ? "ul" : OL_MARKER.test(line) ? "ol" : null;
    if (listKind) {
      const items: ListItem[] = [];
      while (index < lines.length) {
        const current = lines[index];
        if (!current.trim()) {
          // A blank line ends the list unless the next line continues it.
          const next = lines[index + 1] ?? "";
          if (!UL_MARKER.test(next) && !OL_MARKER.test(next) && !/^\s{2,}\S/.test(next)) break;
          index += 1;
          continue;
        }
        const marker = listKind === "ul" ? current.match(UL_MARKER) : current.match(OL_MARKER);
        if (marker) {
          items.push({ content: marker[marker.length - 1], children: [] });
          index += 1;
          continue;
        }
        const continuation = current.match(/^\s{2,}(\S.*)$/);
        if (continuation && items.length) {
          items[items.length - 1].children.push(continuation[1]);
          index += 1;
          continue;
        }
        break;
      }
      if (items.length) blocks.push({ kind: listKind, items });
      continue;
    }

    const para: string[] = [];
    while (index < lines.length && lines[index].trim()
      && !/^\s*#{2,3}\s+/.test(lines[index])
      && !/^\s*-{3,}\s*$/.test(lines[index])
      && !UL_MARKER.test(lines[index]) && !OL_MARKER.test(lines[index])) {
      para.push(lines[index].trim());
      index += 1;
    }
    flushPara(para);
  }
  return blocks;
}

function renderChildren(lines: string[], keyPrefix: string): ReactNode[] {
  // Nested continuation lines: bullets become a sub-list, text stays as lines.
  const bullets: string[] = [];
  const texts: string[] = [];
  for (const line of lines) {
    const bullet = line.match(/^([-*+])\s+(.*)$/);
    if (bullet) bullets.push(bullet[2]);
    else texts.push(line);
  }
  return [
    ...texts.map((text, i) => <span key={`${keyPrefix}-t${i}`} className="ai-md-sub">{renderInline(text, `${keyPrefix}-t${i}`)}</span>),
    ...(bullets.length ? [(
      <ul key={`${keyPrefix}-u`}>
        {bullets.map((bullet, i) => <li key={i}>{renderInline(bullet, `${keyPrefix}-u${i}`)}</li>)}
      </ul>
    )] : [])
  ];
}

export default function AiMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "heading2") return <h3 key={index}>{renderInline(block.lines![0], `h${index}`)}</h3>;
        if (block.kind === "heading3") return <h4 key={index}>{renderInline(block.lines![0], `h${index}`)}</h4>;
        if (block.kind === "rule") return <hr key={index} />;
        if (block.kind === "ul") {
          return (
            <ul key={index}>
              {block.items!.map((item, i) => (
                <li key={i}>{renderInline(item.content, `b${index}u${i}`)}{renderChildren(item.children, `b${index}u${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={index}>
              {block.items!.map((item, i) => (
                <li key={i}>{renderInline(item.content, `b${index}o${i}`)}{renderChildren(item.children, `b${index}o${i}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={index}>{block.lines!.map((line, i) => (
          <Fragment key={i}>{i > 0 && <br />}{renderInline(line, `p${index}-${i}`)}</Fragment>
        ))}</p>;
      })}
    </>
  );
}
