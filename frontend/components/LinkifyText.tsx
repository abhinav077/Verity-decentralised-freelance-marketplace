"use client";

/**
 * Renders plain text with URLs converted to clickable links.
 * Usage: <LinkifyText text={user.bio} className="text-sm" />
 */
export default function LinkifyText({
  text,
  className = "",
  style,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  // Split text on URLs while capturing the matched URLs
  const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
  const URL_TEST = /^https?:\/\/[^\s<>"']+$/;
  const parts = text.split(URL_RE);

  return (
    <span className={className} style={style}>
      {parts.map((part, i) =>
        URL_TEST.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
            style={{ color: "inherit", textDecorationColor: "currentColor" }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}
