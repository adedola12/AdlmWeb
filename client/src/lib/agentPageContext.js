// Which project the reader is looking at, from the address bar.
//
// WHY ADA NEEDS THIS
//
// The assistant is mounted on every route and used to send nothing about the
// page. So a QS standing on their own project, asking "what is still to buy on
// this job", got asked which project they meant — while the page they were on
// already knew. The only project-aware surface faked it by prefixing the
// question with the project's NAME and letting the server fuzzy-match it back.
//
// This reads the reference the address already carries and sends that instead.
// It is a hint, never an authorisation: the server resolves it against the
// caller's own projects, so a reference to somebody else's finds nothing.
//
// TWO ADDRESSES, TWO SHAPES
//
//   /work/project/:productKey/:id     the new workspace — :id is a SLUG
//   /projects/:tool?project=<ref>     the classic one — a slug or an ObjectId
//
// Both are returned as an opaque `projectRef`; the server tries an ObjectId
// first and falls back to a slug, so neither side has to know which it got.

/**
 * @param {{pathname?: string, search?: string}} location
 * @returns {{projectRef: string, productKey: string}} empty strings off a project page
 */
export function agentPageContext(location) {
  const path = String(location?.pathname || "");
  const search = String(location?.search || "");
  const none = { projectRef: "", productKey: "" };

  // The new workspace.
  const work = path.match(/^\/work\/project\/([^/]+)\/([^/?#]+)/);
  if (work) {
    return {
      productKey: decodeURIComponent(work[1]).toLowerCase(),
      projectRef: decodeURIComponent(work[2]),
    };
  }

  // The classic workspace. The project rides in the query, not the path.
  const classic = path.match(/^\/projects\/([^/?#]+)/);
  if (classic) {
    let ref = "";
    try {
      ref = new URLSearchParams(search).get("project") || "";
    } catch {
      ref = "";
    }
    // No ?project= means the gallery for that tool, not a project. The product
    // is still worth sending: it narrows a name match to the right tool.
    return { productKey: decodeURIComponent(classic[1]).toLowerCase(), projectRef: ref };
  }

  return none;
}

export default agentPageContext;
