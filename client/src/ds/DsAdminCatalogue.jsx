// Catalogue — products, the price book, and the rate data.
//
// Same arrangement his admin-catalogue.js uses: these are one table with
// different columns, so the screen says which it is and that decides the
// columns.
//
// THE PRICE BOOK IS THE ONE WORTH READING
//
// A product carries a dozen price fields — monthly, six-month and yearly, each
// in naira and dollars, each with a discounted twin. What a customer actually
// pays is none of them on its own; it is what getEffectivePrices() decides. So
// the server computes this with the very function checkout and the renewal
// cron call, and the screen shows the effective price beside the list price
// wherever they differ — because "why is this cheaper than the website says"
// is the question a price book gets opened to answer.
//
// His Catalogue has Rate data as a separate editor with a publish step
// (admin-rates.js). This is the register half only: what the library holds,
// what it is worth, and which rates could drive a programme as well as a
// price. Editing a rate stays where it already works.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { toneFor, useAdmToast } from "./adminKit.jsx";

const money = (n, cur = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: cur || "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const SCREENS = {
  products: {
    title: "Products",
    lede:
      "What is on sale, what it costs and which installer is current. A product that is not " +
      "published does not appear on the site at all, so the state here is the difference between " +
      "something being buyable and being a draft.",
    path: "/admin/catalogue/products",
    filters: (c) => [
      ["all", "Everything", c.all],
      ["active", "On sale", c.active],
      ["pending", "Coming soon", c.pending],
      ["disabled", "Unpublished", c.disabled],
    ],
    local: true,
    empty: ["No products", "Nothing is on sale, which should not be possible."],
    newHref: "/admin/products",
    newLabel: "Open the product editor",
    cols: (A) => [
      { h: "Product", w: "28%", cell: (p) => <AdmTwo top={p.name} under={p.tag} /> },
      { h: "Monthly", num: true, cell: (p) => (p.monthly ? money(p.monthly) : <AdmDim>—</AdmDim>) },
      { h: "Yearly", num: true, cell: (p) => (p.yearly ? money(p.yearly) : <AdmDim>—</AdmDim>) },
      { h: "Install", num: true, cell: (p) => (p.install ? money(p.install) : <AdmDim>free</AdmDim>) },
      {
        h: "Latest installer",
        cell: (p) =>
          p.release ? (
            <AdmTwo top={p.release.version || p.release.name} under={when(p.release.at)} />
          ) : (
            <AdmDim>none matched</AdmDim>
          ),
      },
      { h: "State", cell: (p) => <AdmChip tone={toneFor(p.state)}>{p.state}</AdmChip> },
      {
        h: "",
        cell: (p) => {
          // Deleting a product removes what orders and entitlements point at
          // by key, so it names the product and warns before it will do it.
          if (A.confirming === p.id) {
            return (
              <span className="adm-log">
                <button
                  type="button"
                  className="adm-b pri"
                  disabled={A.busy}
                  onClick={() =>
                    A.act(`/admin/products/${p.id}`, {
                      method: "DELETE",
                      done: `${p.name} deleted. Orders and licences that named it still do.`,
                    })
                  }
                >
                  delete {p.name} for good
                </button>
                <button type="button" className="adm-b" onClick={() => A.setConfirming(null)}>
                  cancel
                </button>
              </span>
            );
          }
          return (
            <span className="adm-rowacts">
              {/* Publishing is a switch, reversible by the same click, so it
                  does not ask. It is also the only thing on this register that
                  changes what a customer sees. */}
              <button
                type="button"
                className="adm-b"
                disabled={A.busy}
                onClick={() =>
                  A.act(`/admin/products/${p.id}`, {
                    method: "PATCH",
                    body: { isPublished: p.state === "disabled" },
                    done:
                      p.state === "disabled"
                        ? `${p.name} is on sale.`
                        : `${p.name} taken off sale. It disappears from the site.`,
                  })
                }
              >
                {p.state === "disabled" ? "Publish" : "Unpublish"}
              </button>
              <Link className="adm-b" to={`/admin/products/${p.id}/edit`}>
                Edit
              </Link>
              <button type="button" className="adm-b" onClick={() => A.setConfirming(p.id)}>
                Delete
              </button>
            </span>
          );
        },
      },
    ],
  },

  pricing: {
    title: "Price book",
    lede:
      "What a customer is actually charged, worked out by the same code checkout and the renewal " +
      "cron use. Where a discount is live, the list price is shown beside it — that gap is what " +
      "this screen exists to make visible.",
    path: "/admin/catalogue/pricing",
    empty: ["No prices", "No product carries a price."],
    cols: () => [
      { h: "Product", w: "26%", cell: (p) => <AdmTwo top={p.name} under={p.key} /> },
      {
        h: "Monthly",
        num: true,
        cell: (p) =>
          p.list.monthly && p.ngn.monthly < p.list.monthly ? (
            <AdmTwo top={money(p.ngn.monthly)} under={`was ${money(p.list.monthly)}`} />
          ) : (
            money(p.ngn.monthly)
          ),
      },
      {
        h: "Yearly",
        num: true,
        cell: (p) =>
          p.list.yearly && p.ngn.yearly < p.list.yearly ? (
            <AdmTwo top={money(p.ngn.yearly)} under={`was ${money(p.list.yearly)}`} />
          ) : (
            money(p.ngn.yearly)
          ),
      },
      {
        h: "Yearly, USD",
        num: true,
        cell: (p) => (
          <AdmTwo
            top={usd(p.usd.yearly)}
            under={p.usdIsConverted ? "converted at the FX rate" : "set explicitly"}
          />
        ),
      },
      {
        h: "State",
        cell: (p) => (
          <>
            <AdmChip tone={p.published ? "ok" : "calm"}>
              {p.published ? "on sale" : "unpublished"}
            </AdmChip>
            {p.discounted ? <AdmChip tone="due">discount live</AdmChip> : null}
          </>
        ),
      },
      {
        h: "",
        // Prices live on the product, so changing one is editing the product.
        // A second place to set a price is a second place for them to disagree.
        cell: (p) => (
          <Link className="adm-b" to={`/admin/products/${p.id}/edit`}>
            Edit prices
          </Link>
        ),
      },
    ],
  },

  rates: {
    title: "Rate data",
    lede:
      "The published rate library — what a unit of work costs, and what it is built from. This is " +
      "what RateGen prices with, and what the Programme screen would take its durations from if " +
      "the rates carried outputs.",
    path: "/admin/catalogue/rates",
    empty: ["No rates", "The library is empty."],
    newHref: "/admin/rategen/build",
    newLabel: "Build a rate",
    cols: () => [
      { h: "Rate", w: "34%", cell: (r) => <AdmTwo top={r.description} under={r.section} /> },
      { h: "Unit", cell: (r) => r.unit || <AdmDim>—</AdmDim> },
      {
        h: "Net",
        num: true,
        // A Carbon and Others entry is a recipe, not a costed rate: it has no
        // stored total until its lines are priced. A zero here would read as
        // a free rate.
        cell: (r) => (r.recipe ? <AdmDim>priced live</AdmDim> : money(r.net)),
      },
      { h: "O/P", num: true, cell: (r) => `${r.overheadPercent}% / ${r.profitPercent}%` },
      { h: "Total", num: true, cell: (r) => (r.recipe ? <AdmDim>—</AdmDim> : money(r.total)) },
      {
        h: "Built from",
        cell: (r) => (
          <>
            <AdmChip tone="">{r.lines} lines</AdmChip>
            {/* Whether the rate can drive a programme as well as a price. */}
            {r.hasLabour ? <AdmChip tone="ok">has an output</AdmChip> : null}
          </>
        ),
      },
      {
        h: "",
        // View only. Editing an existing rate happens in Rate Gen — this
        // register says where rather than offering a control that would put a
        // second editor on the same figure.
        cell: () => <AdmDim>edited in Rate Gen</AdmDim>,
      },
    ],
  },
};

SCREENS.saved = {
  title: "Saved rates",
  lede:
    "Rates people built for themselves in RateGen. These are not ours and are not editable here " +
    "— they are shown so that somebody taking a support call can see what the caller is actually " +
    "pricing with.",
  path: "/admin/catalogue/saved-rates",
  empty: [
    "Nobody has built their own rate",
    "Every practice is pricing with the published library as it stands.",
  ],
  cols: () => [
    { h: "Rate", w: "28%", cell: (r) => <AdmTwo top={r.name} under={r.note} /> },
    { h: "Whose", w: "20%", cell: (r) => <AdmTwo top={r.who} under={r.email} /> },
    { h: "Unit", cell: (r) => r.unit || <AdmDim>—</AdmDim> },
    {
      h: "Built from",
      cell: (r) => (
        <span className="adm-two">
          <b>
            {r.materials} material{r.materials === 1 ? "" : "s"}
          </b>
          <span>
            {r.labour} labour line{r.labour === 1 ? "" : "s"}
          </span>
        </span>
      ),
    },
    { h: "Net", num: true, cell: (r) => money(r.net) },
    { h: "Total", num: true, cell: (r) => money(r.total) },
  ],
};

export default function DsAdminCatalogue({ screen }) {
  const S = SCREENS[screen];
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("all");
  const [section, setSection] = React.useState("");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [confirming, setConfirming] = React.useState(null);
  const [say, toast] = useAdmToast();

  React.useEffect(() => {
    if (!accessToken || !S) return undefined;
    let alive = true;
    setD(null);
    apiAuthed(S.path, { token: accessToken, params: screen === "rates" ? { section } : {} })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, S, screen, section, reload]);

  /**
   * Every write on these registers.
   *
   * The reversible ones — publishing, unpublishing — act on the click. The
   * destructive ones ask on the row, naming what is about to go, because a
   * browser confirm() cannot say which product or which rate.
   */
  async function act(path, { method = "POST", body, done } = {}) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(path, {
        token: accessToken,
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body || {}),
      });
      setConfirming(null);
      setReload((n) => n + 1);
      say(done || "Done.");
    } catch (e) {
      say(e?.message || "The server refused that. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!S) return <p className="adm-note">No such screen.</p>;
  if (failed) {
    return <p className="adm-note">{S.title} could not be loaded just now. Please refresh.</p>;
  }

  const all = d?.items || [];
  const items = S.local && view !== "all" ? all.filter((r) => r.state === view) : all;
  /**
   * Try the desktop app; fall back to the inline editor.
   *
   * Deliberately not a link: a plain <a href="adlm-rategen://..."> on a
   * machine with nothing registered does nothing at all and gives the person
   * no reason why. This says so, and opens the editor they can actually use.
   */
  /**
   * The link has been followed. Say what we did, not what happened next.
   *
   * Whether the application opened is not knowable from here — no browser
   * exposes it. An earlier version guessed from focus loss and announced
   * "nothing opened", which it could not support and which was sometimes
   * flatly wrong. This states the action and leaves the outcome to the
   * person, who can see their own screen.
   */
  function handedOver(rate) {
    // Do NOT clear the confirm here.
    //
    // Clearing it re-renders and unmounts the <a> this click is still being
    // processed on, and a browser cancels the navigation of an anchor that has
    // left the DOM. The link therefore never reached Windows: the toast fired,
    // the row snapped back, and nothing launched. Proved by pointing the scheme
    // at a logging wrapper — the shell wrote a line every time, the browser
    // click wrote none.
    //
    // The row is put back on a timer instead, well after the navigation has
    // been handed off.
    setTimeout(() => setConfirming(null), 1200);
    say(
      `Asked Windows to open ${rate.description ? "that rate" : "the library"} in Rate Gen. ` +
        "If nothing appeared, Rate Gen is not installed on this machine.",
    );
  }

  const A = { act, busy, confirming, setConfirming, handedOver };

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">{S.title}</h1>
          <p className="adm-lede">{S.lede}</p>
        </div>
        {S.newHref ? (
          <div className="adm-acts">
            <Link className="ds-btn btn-p ds-btn-sm" to={S.newHref}>
              {S.newLabel}
            </Link>
          </div>
        ) : null}
      </div>

      {S.filters ? (
        <AdmFilters current={view} onPick={setView} options={S.filters(d?.counts || {})} />
      ) : null}

      {/* Rate sections are a filter the server does, because 130 rates across
          eight sections is a list somebody narrows before reading. */}
      {screen === "rates" && d?.sections ? (
        <AdmFilters
          current={section}
          onPick={setSection}
          options={[
            ["", "Every section", d.total],
            // Keyed on the canonical section, not its label: the stored labels
            // disagree with each other and a section with no rates still has
            // to be selectable. Carbon and Others is the case that proved it.
            ...d.sections.map((x) => [x.key, x.name, x.n]),
          ]}
        />
      ) : null}

      {!d ? (
        <p className="adm-note">Reading the catalogue…</p>
      ) : (
        <AdmTable cols={S.cols(A)} rows={items} rowKey={(r) => r.id} empty={S.empty} />
      )}

      {screen === "rates" && d ? (
        <p className="adm-foot-note">
          {d.withLabour} of {d.total} rates carry a labour line, which is the only thing in the
          library that could tell a programme how long work takes. The other{" "}
          {d.total - d.withLabour} price the work without saying how fast it goes, which is why the
          Programme screen has to be told its outputs. {d.recipes} build-up recipes sit behind
          these rates.
          <br />
          A rate can be edited but not deleted. Every product prices against this library and a
          bill names the rate that priced it, so removing one would leave those figures
          unexplainable — the server refuses it. An edit reaches RateGen, QUIV and HERON on their
          next sync, and bills already priced keep the figures they were built with.
        </p>
      ) : null}

      {screen === "saved" && d ? (
        <p className="adm-foot-note">
          {d.total} rate{d.total === 1 ? "" : "s"} built by {d.practices} practice
          {d.practices === 1 ? "" : "s"}, and {d.overrides.toLocaleString("en-NG")} override
          {d.overrides === 1 ? "" : "s"} of rates we publish. That second number is the one to
          read: an override is somebody correcting OUR figure rather than writing their own, and
          four thousand of them says the published library is not matching what people pay.
        </p>
      ) : null}

      {screen === "pricing" && d ? (
        <p className="adm-foot-note">
          Prices are computed by util/pricing.js — the same rules checkout and the renewal cron
          apply — so this cannot quote a figure a customer would not be charged. Dollar prices
          marked converted move with the FX rate, currently {d.fx}.
        </p>
      ) : null}

      {toast}
    </>
  );
}
