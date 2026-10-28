// Plain text with http(s) links made clickable. Everything else is rendered as
// text by React (never as HTML), and only http/https URLs become links.
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <p dir="auto" className={className}>
      {parts.map((part, index) => {
        // split() with a capture group puts the URLs at the odd indexes.
        if (index % 2 === 0) return part;
        const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? "";
        const url = trailing ? part.slice(0, -trailing.length) : part;
        return (
          <span key={index}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="text-primary underline underline-offset-2 break-all"
            >
              {url}
            </a>
            {trailing}
          </span>
        );
      })}
    </p>
  );
}
