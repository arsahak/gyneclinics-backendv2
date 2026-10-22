import sanitizeHtml from "sanitize-html";

// Content bodies come from the dashboard's rich-text editor and are shown to
// patients as HTML, so only formatting tags survive.

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "blockquote",
    "ul", "ol", "li", "a", "img", "figure", "figcaption", "span", "sub", "sup", "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    "*": ["style"],
  },
  // Text alignment from the editor; nothing else in style.
  allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/] } },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https", "http", "data"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

export const cleanContentHtml = (html: string) => sanitizeHtml(html ?? "", OPTIONS).trim();

/** Body as plain text. */
export const contentText = (html: string) =>
  // Space out block tags first, so "<h2>Intro</h2><p>Your…" reads "Intro Your…".
  sanitizeHtml((html ?? "").replace(/<\/(p|h[1-6]|li|div|blockquote|td|th|figcaption)>|<br\s*\/?>/gi, "$& "), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** First ~160 characters, cut at a word. */
export function contentExcerpt(html: string, length = 160) {
  const text = contentText(html);
  if (text.length <= length) return text;
  return `${text.slice(0, length).replace(/\s+\S*$/, "")}…`;
}

/** About 200 words a minute, at least 1. */
export const estimateReadTime = (html: string) =>
  Math.max(1, Math.round(contentText(html).split(" ").filter(Boolean).length / 200));
