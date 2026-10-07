// /product/:key — Richard's product page for the six products he designed.
//
// Until 7 Oct 2026 this path still rendered the classic ProductDetail page,
// even though his home and products pages link straight to it and every post
// we share points at it (LinkedIn's "See QUIV" landed on the classic page).
// His product pages existed only at the staff-only /preview/<slug>.
//
// This retires the classic product page:
//   - the six product keys render his page, in his shell;
//   - a course key goes to /learn, where his course cards are;
//   - any other key goes to /products.
// pages/ProductDetail.jsx stays in the tree (and in the classic-build-final
// tag and the Drive archive) but is no longer routed.
//
// Two things the classic page did are kept, because people rely on them:
//   - the head: the same title, description, share image and structured data,
//     read from the product the server preloads for this path, so a LinkedIn
//     or WhatsApp card for /product/revit looks exactly as it did;
//   - "Get QUIV" opens checkout WITH the product in it. His buttons link to a
//     bare /purchase; this adds ?product=<key>, which Purchase already reads.

import React from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { API_BASE } from "../config.js";
import { readPreloaded } from "../lib/preload.js";
import { PRODUCT_KEY } from "../lib/dsRoutes.js";
import { breadcrumbSchema, softwareApplicationSchema } from "../lib/schema.js";

// Catalogue key -> his page slug (the reverse of PRODUCT_KEY).
const PRODUCT_SLUG = Object.freeze(
  Object.fromEntries(Object.entries(PRODUCT_KEY).map(([slug, key]) => [key, slug])),
);

// The certificated courses are catalogue rows too, but his design gives them
// course cards on /learn rather than a product page.
const COURSE_KEYS = new Set(["bimbld", "BIMMEP"]);

// Used for the head only until the product arrives (or if it never does), so
// a share card is never titled "undefined".
const NAMES = {
  revit: "QUIV for Revit",
  planswift: "HERON for PlanSwift",
  rategen: "RateGen",
  mep: "SERVIQ for Revit MEP",
  "qs-takeoff": "ADLM Time Pro",
  civil3d: "CIVIQ for Civil 3D",
};

function useCatalogueProduct(key) {
  const preloaded = readPreloaded(`product:${key}`);
  const [p, setP] = React.useState(preloaded ?? null);
  React.useEffect(() => {
    if (p && (p.key === key || p.slug === key)) return undefined;
    let alive = true;
    fetch(`${API_BASE}/products/${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (alive && raw) setP(raw.product || raw);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return p;
}

/**
 * @param {object} props
 * @param {Record<string, React.ComponentType>} props.pages  his slug -> page
 * @param {(node: React.ReactNode) => React.ReactNode} props.wrap
 *   puts the page in his shell: lazily in the browser, eagerly on the server
 */
export default function DsProductRoute({ pages, wrap }) {
  const { key: raw = "" } = useParams();
  const key = String(raw).trim();
  const slug = PRODUCT_SLUG[key];

  if (!slug || !pages[slug]) {
    return <Navigate to={COURSE_KEYS.has(key) ? "/learn" : "/products"} replace />;
  }
  return <ProductPage productKey={key} Page={pages[slug]} wrap={wrap} />;
}

function ProductPage({ productKey, Page, wrap }) {
  const navigate = useNavigate();
  const p = useCatalogueProduct(productKey);

  const name = p?.name || NAMES[productKey];
  const canonicalPath = `/product/${productKey}`;
  const description =
    p?.blurb ||
    (p?.description ? String(p.description).replace(/\s+/g, " ").slice(0, 155) : "") ||
    `${name} from ADLM Studio.`;

  // His "Get <product>" buttons carry data-ds-page="cart". Send them to
  // checkout with this product already in the order.
  const onClickCapture = React.useCallback(
    (e) => {
      const a = e.target.closest?.('a[data-ds-page="cart"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(`/purchase?product=${encodeURIComponent(productKey)}`);
    },
    [navigate, productKey],
  );

  return (
    <>
      <Seo
        title={name}
        description={description}
        path={canonicalPath}
        image={p?.thumbnailUrl || undefined}
        type="product"
        jsonLd={[
          softwareApplicationSchema({
            name,
            description,
            image: p?.thumbnailUrl,
            url: `https://www.adlmstudio.net${canonicalPath}`,
            priceNGN: Number(p?.price?.monthlyNGN) || undefined,
            interval: "month",
            operatingSystem: "Windows",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Products", path: "/products" },
            { name, path: canonicalPath },
          ]),
        ]}
      />
      <div onClickCapture={onClickCapture}>{wrap(<Page />)}</div>
    </>
  );
}
