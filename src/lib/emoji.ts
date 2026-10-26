const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

// True for messages made of 1–3 emoji (whitespace ignored); rendered large without a bubble.
export function isEmojiOnly(text: string | null, max = 3) {
  if (!text || !segmenter) return false;
  const graphemes = Array.from(segmenter.segment(text.replace(/\s+/g, "")), (s) => s.segment);
  return (
    graphemes.length >= 1 &&
    graphemes.length <= max &&
    graphemes.every((grapheme) => PICTOGRAPHIC.test(grapheme))
  );
}
