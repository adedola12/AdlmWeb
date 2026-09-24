// Turning schema.org blocks into <script> tags in the served HTML.
//
// Lifted out of src/api/meta.js so it can be tested without pulling that
// module in. The Vercel function dynamically imports the compiled SSR bundle
// from dist-ssr/, which does not exist until a build has run, so importing the
// function into a unit test is a build-order dependency for a thirty-line
// string operation. This file has no imports at all and the function imports
// it, which means the test exercises the same code that ships rather than a
// copy of it that can quietly drift.

/**
 * JSON-LD blocks, as script tags a crawler can read.
 *
 * The data-seo attribute is not decoration. <Seo> writes the same blocks from
 * an effect after hydration, and it clears the old ones by querying exactly
 * that attribute. Without it the server's copies are invisible to that cleanup
 * and the page ends up carrying every block twice — which describes a page
 * with two of everything and is the kind of thing Google penalises rather than
 * ignores. Tagging them here makes the client replace ours instead of adding to
 * them.
 *
 * Every "<" is escaped, not just "</script". A JSON string is allowed to carry
 * a unicode escape anywhere, so this costs nothing and leaves no sequence that
 * can close the tag early — which is the difference between a name with an
 * angle bracket in it and an injection point.
 */
export function injectJsonLd(html, blocks) {
  if (!blocks?.length) return html;

  const tags = blocks
    .map(
      (block) =>
        `<script type="application/ld+json" data-seo="1">${JSON.stringify(
          block,
        ).replace(/</g, "\\u003c")}</script>`,
    )
    .join("\n");

  return html.replace(/<\/head>/i, `${tags}\n</head>`);
}

export default injectJsonLd;
