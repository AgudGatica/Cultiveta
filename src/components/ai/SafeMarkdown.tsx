import React from 'react';

/**
 * Renderizador mínimo y seguro de markdown para las respuestas de la IA.
 * Construye elementos de React (nunca usa HTML crudo ni dangerouslySetInnerHTML), así que
 * cualquier etiqueta HTML que venga en el texto se muestra como texto.
 *
 * Soporta: párrafos, saltos de línea, títulos (#), listas con "-", "*", "•" o "1.",
 * **negrita**, *cursiva* / _cursiva_ y `código`.
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function renderInlineMarkdown(text: string, keyPrefix = 'i'): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-track font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

export function parseMarkdownBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    const last = blocks[blocks.length - 1];

    if (trimmed === '') {
      blocks.push({ kind: 'paragraph', lines: [] });
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1] });
      continue;
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      if (last && last.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      if (last && last.kind === 'ol') last.items.push(numbered[1]);
      else blocks.push({ kind: 'ol', items: [numbered[1]] });
      continue;
    }

    if (last && last.kind === 'paragraph') last.lines.push(trimmed);
    else blocks.push({ kind: 'paragraph', lines: [trimmed] });
  }

  return blocks.filter((b) => b.kind !== 'paragraph' || b.lines.length > 0);
}

export const SafeMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        if (block.kind === 'heading') {
          return (
            <p key={bi} className="font-extrabold">
              {renderInlineMarkdown(block.text, `h${bi}`)}
            </p>
          );
        }
        if (block.kind === 'ul') {
          return (
            <ul key={bi} className="list-disc pl-5 space-y-1">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInlineMarkdown(item, `u${bi}-${ii}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'ol') {
          return (
            <ol key={bi} className="list-decimal pl-5 space-y-1">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInlineMarkdown(item, `o${bi}-${ii}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi}>
            {block.lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInlineMarkdown(l, `p${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};
