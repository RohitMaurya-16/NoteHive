import { Fragment, useMemo } from 'react';

function parseInline(text, keyPrefix = 'inline') {
  const value = String(text || '');
  if (!value) return '';

  const parts = [];
  const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(value)) !== null) {
    const [token] = match;
    const start = match.index;

    if (start > lastIndex) {
      parts.push(value.slice(lastIndex, start));
    }

    if (match[2] && match[3]) {
      parts.push(
        <a
          href={match[3]}
          key={`${keyPrefix}-link-${start}`}
          target="_blank"
          rel="noreferrer"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      parts.push(<code key={`${keyPrefix}-code-${start}`}>{match[4]}</code>);
    } else if (match[5]) {
      parts.push(<strong key={`${keyPrefix}-strong-${start}`}>{match[5]}</strong>);
    } else if (match[6] || match[7]) {
      parts.push(<em key={`${keyPrefix}-em-${start}`}>{match[6] || match[7]}</em>);
    } else {
      parts.push(token);
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  return parts;
}

function renderInlineWithBreaks(text, keyPrefix) {
  const lines = String(text || '').split('\n');
  return lines.map((line, idx) => (
    <Fragment key={`${keyPrefix}-line-${idx}`}>
      {parseInline(line, `${keyPrefix}-${idx}`)}
      {idx < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function startsNewBlock(line) {
  return (
    /^#{1,4}\s+/.test(line)
    || /^>\s?/.test(line)
    || /^```/.test(line)
    || /^[-*]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || /^-{3,}\s*$/.test(line)
  );
}

function parseBlocks(content) {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      continue;
    }

    const headingMatch = line.trim().match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line.trim())) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', content: quoteLines.join('\n') });
      continue;
    }

    if (/^[-*]\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (/^-{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const paragraphLines = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !startsNewBlock(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trimEnd());
      i += 1;
    }

    blocks.push({
      type: 'paragraph',
      content: paragraphLines.join('\n').trim(),
    });
  }

  return blocks;
}

export default function NoteContentRenderer({
  content,
  className = '',
  emptyMessage = 'No note content yet.',
}) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  if (!String(content || '').trim()) {
    return <div className="note-empty-state">{emptyMessage}</div>;
  }

  return (
    <div className={`note-content-renderer ${className}`.trim()}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = `h${block.level}`;
          return (
            <Tag key={`block-heading-${index}`}>
              {parseInline(block.content, `block-heading-${index}`)}
            </Tag>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`block-paragraph-${index}`}>
              {renderInlineWithBreaks(block.content, `block-paragraph-${index}`)}
            </p>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={`block-quote-${index}`}>
              {renderInlineWithBreaks(block.content, `block-quote-${index}`)}
            </blockquote>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={`block-ul-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`block-ul-${index}-item-${itemIndex}`}>
                  {parseInline(item, `block-ul-${index}-item-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={`block-ol-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`block-ol-${index}-item-${itemIndex}`}>
                  {parseInline(item, `block-ol-${index}-item-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'code') {
          return (
            <figure className="note-code-block" key={`block-code-${index}`}>
              <figcaption>{block.lang || 'code'}</figcaption>
              <pre>
                <code>{block.content}</code>
              </pre>
            </figure>
          );
        }

        if (block.type === 'hr') {
          return <hr key={`block-hr-${index}`} />;
        }

        return null;
      })}
    </div>
  );
}
