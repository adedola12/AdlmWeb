# Open in QUIV / HERON: the web-to-desktop contract

Work board item `r2-open-in-quiv-heron`. Four repos take part:

| Repo | Part |
|---|---|
| ADLMWebsite | Issues and redeems tickets; the web button |
| ADLMInstallerHub | Registers `adlm://`; `ADLMOpen.exe` validates the link, writes the request file, starts or focuses the product |
| RevitPluginArch (QUIV) | Picks up `quiv.json`, redeems, opens the project |
| ADLMPlanswiftApp (HERON) | Picks up `heron.json`, redeems, opens the project |

## Flow

1. The QS presses **Open in QUIV** on a web project.
2. The page calls `POST /projects/open-intent/issue { projectId }` with the web session and gets
   `{ url, product, label, expiresAt }`.
3. The browser navigates to `url`. Windows asks once whether to open the ADLM handler.
4. `ADLMOpen.exe "<url>"` validates the link, writes the request file, then starts or focuses
   the product.
5. QUIV or HERON reads the request file (at start-up, after sign-in, or when it is already
   running), deletes it, and calls `POST /projects/open-intent/redeem` with **its own** Bearer token.
6. On 200 it opens `projectId` through the route it already uses: `GET /projects/revit/:id` or
   `GET /projects/planswift/:id`.

## 1. The link

```
adlm://open?v=1&product=<quiv|heron>&project=<24 lowercase hex>&ticket=<JWT>
```

Rules. The handler rejects anything else, and the plugins re-check them on the file:

- Scheme `adlm`, host `open`. No user info, no port, no path other than empty or `/`, no fragment.
- The whole link is at most 2048 characters.
- Query keys are exactly `v`, `product`, `project`, `ticket`, each exactly once. No other keys.
- `v` = `1`.
- `product` = `quiv` or `heron`.
- `project` matches `^[a-f0-9]{24}$`.
- `ticket` matches `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$` and is at most 1024 characters.

The ticket is **not** a credential. It is a signed, 10-minute, single-use note that says
"user U asked to open project P in product X". Redeeming it needs a Bearer token for user U.
The desktop never decodes or trusts the ticket's contents; only the API verifies it.

## 2. The request file

`%LOCALAPPDATA%\ADLM\open-requests\<product>.json`, one file per product (the newest click wins):

```json
{
  "v": 1,
  "product": "quiv",
  "projectId": "66f1c0ffee0000000000abcd",
  "ticket": "eyJ...",
  "createdUtc": "2026-09-27T14:05:00Z"
}
```

- **Writer (ADLMOpen.exe):** create the folder if missing; write `<product>.json.tmp`, then
  move it over `<product>.json` so a reader never sees half a file. UTF-8, no BOM.
- **Reader (QUIV / HERON):**
  - Ignore and delete a file larger than 8 KB, one that fails to parse, or one that fails any rule
    in section 1.
  - Ignore and delete a file whose `createdUtc` is more than 10 minutes old, or more than 2 minutes
    in the future.
  - Only read it when the product is signed in. If it is not, leave the file and check again right
    after sign-in. The ticket's 10 minutes cover a cold start and a sign-in.
  - Delete the file **before** calling redeem, so one click opens the project at most once.

## 3. Redeem

```
POST {ADLM_API_BASE_URL}/projects/open-intent/redeem
Authorization: Bearer <the product's own access token>
Content-Type: application/json

{ "ticket": "...", "projectId": "...", "product": "quiv" }
```

| Status | `code` | What the product shows |
|---|---|---|
| 200 | – | Opens the project. The body is `{ ok, projectId, product, productKey, name, modelTitle, clientProjectKey, role }` |
| 400 | `BAD_REQUEST`, `BAD_TICKET` | "This link is not valid. Open the project from the web again." |
| 401 | – | Refresh once. If it is still 401, ask the user to sign in and keep nothing. |
| 403 | `WRONG_ACCOUNT` | "This link was made for a different ADLM account…" (use the body's `error`) |
| 403 | no code (`No active subscription` / `Subscription expired`) | The product's usual licence message |
| 404 | `NOT_FOUND` | "You no longer have access to this project." |
| 410 | `EXPIRED`, `USED` | "This link has expired. Open the project from the web again." |
| 429 | `RATE_LIMITED` | The body's `error` |
| 5xx / network | – | "Could not reach ADLM Cloud. Open the project from the product's cloud list." |

Every non-200 body has `{ error, code }`, and `error` is written for the user, so show it as is.

## 4. Opening the model

The web cannot tell Revit or PlanSwift which file to open, and `modelPath` is the author's own
disk path. So:

- **QUIV:** when a document is active, open the project with the normal open-by-id flow. The
  existing model-mismatch check still applies. When no document is open, show
  "Opening <name> from ADLM Cloud. Open the Revit model <modelTitle> to continue." and open the
  project as soon as a document becomes active.
- **HERON:** open the project with the normal open-by-id flow. Building in PlanSwift still needs a
  PlanSwift job open, as today.

## 5. Security notes

- Nothing in the link or the request file signs anyone in.
- The ticket key is derived from `JWT_ACCESS_SECRET` with a purpose label, so a ticket can never
  pass as an access token.
- Access is checked at redeem time with the same owner / collaborator rule as `GET /projects/...`.
  Samples and combined (merged) projects are refused.
- `ADLMOpen.exe` runs `asInvoker` (no UAC prompt), never runs anything named in the link, and only
  starts `Revit.exe` or the HERON exe from locations it found itself.

## 6. Measuring it

`OpenIntent` holds one row per ticket for 30 days: issued, redeemed, and the last refusal reason.
A redeem also writes a `project.opened-desktop` activity entry. Issued-but-never-redeemed rows are
the "handler missing or gave up" failure rate.

## 7. Old installs

Old Hub installs have no handler, so the web shows the link and a fallback: "Nothing opened?
Install or update the ADLM Installer Hub", with the project ID to paste into the product's
"Open from Cloud" box. Plugins without this feature ignore the request file; it expires on its own.
