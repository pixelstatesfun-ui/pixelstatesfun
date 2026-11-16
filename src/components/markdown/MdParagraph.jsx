/*
 * Renders Markdown that got parsed by core/MarkdownParser
 */
import { useState, useMemo, useEffect } from 'preact/hooks';
import { memo } from 'preact/compat';

import MdLink from './MdLink.jsx';
import MdMention from './MdMention.jsx';
import EMBEDS from '../embeds/index.js';
import EmbedContext from '../context/embed.js';
import { parseParagraph } from '../../utils/markdown/MarkdownParser.js';
import { api } from '../../utils/utag.js';

const EMOJI_TOKEN = /:([A-Z0-9_]{1,32}):|:emoji:([A-Za-z0-9_-]+\.(?:gif|webp|png)):/g;
let emojiCatalogPromise;
const emojiCatalogSubscribers = new Set();
let emojiCatalogGeneration = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('emoji-catalog-updated', () => {
    emojiCatalogPromise = null;
    emojiCatalogGeneration += 1;
    emojiCatalogSubscribers.forEach((refresh) => refresh());
  });
}

function fetchEmojiCatalog() {
  if (!emojiCatalogPromise) {
    emojiCatalogPromise = fetch(api`/api/emojis`, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Emoji catalog returned HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(({ emojis }) => Object.fromEntries(
        emojis.map(({ code, filename }) => [code, filename]),
      ))
      .catch((error) => {
        emojiCatalogPromise = null;
        throw error;
      });
  }
  return emojiCatalogPromise;
}

function renderText(text, emojiFiles) {
  if (typeof text !== 'string' || !emojiFiles || !text.includes(':')) {
    return text;
  }
  const result = [];
  let previousIndex = 0;
  let match;
  EMOJI_TOKEN.lastIndex = 0;
  while ((match = EMOJI_TOKEN.exec(text))) {
    const filename = match[2] || emojiFiles[match[1]];
    if (!filename) {
      continue;
    }
    if (match.index > previousIndex) {
      result.push(text.slice(previousIndex, match.index));
    }
    result.push(
      <img
        key={`${filename}-${match.index}`}
        src={match[2]
          ? api`/api/emojis/file/${filename}`
          : api`/api/emojis/code/${match[1]}`}
        alt={match[0]}
        title={match[0]}
        loading="lazy"
        style={{
          width: 50,
          height: 50,
          maxWidth: '100%',
          objectFit: 'contain',
          verticalAlign: 'middle',
        }}
      />,
    );
    previousIndex = EMOJI_TOKEN.lastIndex;
  }
  if (!result.length) {
    return text;
  }
  if (previousIndex < text.length) {
    result.push(text.slice(previousIndex));
  }
  return result;
}

/**
 * parse a markdown paragraph,
 * either text or pArray should be given, not both
 * @param {
 *   text: markdown text
 *   pArray: parsed markdown array
 * }
 */
const RecursiveMdParagraph = ({ pArray, emojiFiles }) => pArray.map((part) => {
  if (!Array.isArray(part)) {
    return renderText(part, emojiFiles);
  }
  const type = part[0];
  switch (type) {
    case 'c':
      return (<code>{part[1]}</code>);
    case '*':
      return (
        <strong>
          <RecursiveMdParagraph pArray={part[1]} emojiFiles={emojiFiles} />
        </strong>
      );
    case '~':
      return (
        <s>
          <RecursiveMdParagraph pArray={part[1]} emojiFiles={emojiFiles} />
        </s>
      );
    case '+':
      return (
        <em>
          <RecursiveMdParagraph pArray={part[1]} emojiFiles={emojiFiles} />
        </em>
      );
    case '_':
      return (
        <u>
          <RecursiveMdParagraph pArray={part[1]} emojiFiles={emojiFiles} />
        </u>
      );
    case 'img':
    case 'l':
      return (
        <MdLink href={part[2]} title={part[1]} />
      );
    case '@':
      return (
        <MdMention uid={part[2]} name={part[1]} />
      );
    default:
      return type;
  }
});

const MdParagraph = ({
  text, attachmentInfo = [], className, scrollRef, compact,
  pArray: gPArray, pAttachments: gPAttachments,
}) => {
  /*
   * [[desc, href], ...]
   */
  const [shownEmbeds, setShownEmbeds] = useState([]);
  const [emojiFiles, setEmojiFiles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      const generation = emojiCatalogGeneration;
      fetchEmojiCatalog()
        .then((files) => {
          if (!cancelled && generation === emojiCatalogGeneration) {
            setEmojiFiles(files);
          }
        })
        .catch((error) => {
          console.error(`Could not load chat emoji catalog: ${error.message}`);
        });
    };
    emojiCatalogSubscribers.add(refresh);
    refresh();
    return () => {
      cancelled = true;
      emojiCatalogSubscribers.delete(refresh);
    };
  }, []);

  const contextData = useMemo(() => ({
    isEmbedOpen: (href) => shownEmbeds.some(
      (embedOpts) => embedOpts[1] === href,
    ),
    openEmbed: (embedOpts) => {
      if (scrollRef?.current) {
        requestAnimationFrame(() => {
          scrollRef?.current?.();
        });
      }
      return setShownEmbeds((cs) => [...cs, embedOpts]);
    },
    closeEmbed: (href) => setShownEmbeds(
      (cs) => cs.filter((embedOpts) => embedOpts[1] !== href),
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [shownEmbeds]);

  const [pArray, pAttachments] = useMemo(() => {
    if (gPArray) {
      return [gPArray, gPAttachments || []];
    }
    return parseParagraph(text);
  }, [text, gPArray, gPAttachments]);

  const Attachment = EMBEDS['/'][0];

  return (
    <EmbedContext.Provider value={contextData}>
      <div className={className || 'md-paragraph'}>
        <RecursiveMdParagraph pArray={pArray} emojiFiles={emojiFiles} />
        {(shownEmbeds.length > 0 || pAttachments.length > 0) && (
          <div className="att-and-embeds">
            {shownEmbeds.map(([desc, href]) => {
              const Embed = EMBEDS[desc][0];
              return (
                <Embed
                  key={href}
                  url={href}
                  maxHeight={300}
                  scrollRef={scrollRef}
                />
              );
            })}
            {pAttachments.map(([title, mediaId]) => {
              const fileInfo = attachmentInfo.find(([id]) => id === mediaId);
              if (!fileInfo) {
                return null;
              }
              const [, type, , width, height, avgColor] = fileInfo;
              return (
                <Attachment
                  key={mediaId}
                  mediaId={mediaId}
                  title={title}
                  width={width}
                  height={height}
                  avgColor={avgColor}
                  type={type}
                  scrollRef={scrollRef}
                  compact={compact}
                />
              );
            })}
          </div>
        )}
      </div>
    </EmbedContext.Provider>
  );
};

export default memo(MdParagraph);
