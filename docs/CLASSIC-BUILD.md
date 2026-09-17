# The classic build

"Classic" is the website customers use today: `/dashboard`, `/projects/:tool`,
`/learn`, `/learn/course/:sku`, `/profile`, `/purchase`, the classic admin
screens, and the classic Ada look. It stays exactly as it is until the new
build (Richard Enoch's redesign, branch `feat/video-notifications`) goes live.

## Who sees what, until go-live

| Where | Customers | Admin roles (admin, Design Access, mini-admin) |
|---|---|---|
| adlmstudio.net | Classic only. `/manage`, `/work` and `/dash-*` send them to the classic page for the same job (`client/src/components/NewBuildGate.jsx`). | Classic, plus the new-build screens by URL |
| `/preview/*`, `/fit` | Sent home | The staged redesign |
| preview.adlmstudio.com | Sign-in page only | The whole new build |

## At go-live: retire, do not delete

1. Tag the last classic commit on main: `git tag classic-build-final <sha>` and
   push the tag. That tag is the archive; it can be checked out and run at any
   time for reference.
2. Revert the hold-backs on main (see the release notes: `6de46ea`, `1a51cde`,
   `7f328b8`) and this gate, then merge the new build.
3. Classic pages that the new build no longer routes stay in the tree only
   until the tag exists; after that they may be removed from main, because the
   tag keeps them.
