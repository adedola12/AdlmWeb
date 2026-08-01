/* eslint-disable */
// ⚠️  AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Source of truth: src/data/changelogs/*.md  (one markdown file per product)
// Regenerate:      npm run gen:changelogs  (also runs on build & dev)
export const products = [
  {
    "slug": "quiv",
    "name": "QUIV",
    "tagline": "Quantity takeoff & estimating for Autodesk Revit",
    "category": "QUIV",
    "accent": "orange",
    "icon": "cube",
    "status": "live",
    "compatibility": "Revit 2024, 2026 & 2027",
    "summary": "Model-based quantity takeoff, priced budgets and a dockable workspace — right inside Revit.",
    "order": 1,
    "latest": "3.1.7",
    "lastUpdated": "31 July 2026",
    "itemCount": 30,
    "releases": [
      {
        "version": "3.1.7",
        "date": "31 July 2026",
        "latest": true,
        "title": "Closing the last path to a sign-in failure",
        "changes": [
          {
            "type": "improved",
            "items": [
              "The built-in fallback address now points at the live service. QUIV reads the ADLM service address from your machine's settings, which is why it kept working through the move while other plugins did not. It also carries a fallback address, used only when that setting is missing — a manual install that bypassed the Installer Hub, a reset Windows profile, or a brand-new workstation. That fallback still named the retired server, so a machine in one of those states would have failed to sign in for the same reason the other plugins did. It now names the live service, so QUIV works whether or not the setting is present."
            ]
          }
        ],
        "highlight": "QUIV was not affected when ADLM's servers moved — it already read the service address from your machine rather than having it built in. This release closes the one remaining case where a QUIV install could have been caught out."
      },
      {
        "version": "3.1.6",
        "date": "July 2026",
        "latest": false,
        "title": "The AI Assistant, budgets that balance & QS-format exports",
        "changes": [
          {
            "type": "new",
            "items": [
              "QUIV AI Assistant. Type what you want measured — \"generate the entire beam and slab quantity for the first floor\" — and QUIV maps it onto the right module and the real level name, then measures it with the same engines you use by hand. The assistant never invents a quantity: every result reports the element count, the level and type it applied, and the key quantities it produced, and the measured elements are highlighted and zoomed in your Revit view so you can check them.",
              "AI Match Labour. One button in the Budget sends every labour row still priced at zero — with its work description and unit — for matching against your real labour library and the labour portion of your rate build-ups. Only genuine library rates are ever applied, units must be compatible, and anything the match isn't confident about is offered as a suggestion for you to accept rather than applied silently.",
              "Budgets that balance to your rate. RateGen rates are now decomposed into the named materials behind them, plus a single \"Other Materials\" balancing line for waste, loading and sundries, plus labour — so the build-up adds back up to the rate you priced. A rate cap makes sure the decomposed components can never imply a rate above the RateGen headline.",
              "Finishes factor & labour-rate library. A full constants library transcribed from a reference QS schedule — rendering, POP screeding, wall and floor tiling, floor screed, emulsion painting, soil poisoning, filling density, roof sheeting — plus labour rates per bill unit for concrete, formwork, rebar, blockwork, rendering, POP, tiling, painting, screed, DPM, BRC, excavation, backfill and roof covering. Finishes items now derive real materials and labour instead of coming through unpriced, and every constant is editable.",
              "Supply items priced as shares of the rate. Doors, windows, ceilings, sanitary ware, balustrades and railings, roof members, curtain walling, MEP, wardrobes and tanks now budget as an editable material / labour share of the bill rate, so the rebuilt BoQ re-prices to exactly the figure you entered.",
              "QS-format Excel export. Revit names like \"Blockwork - Lintel Concrete [L:All Floors | T:150]\" become an SMM-style preamble plus a terse measured description with size and level qualifiers. Each trade group gets an unpriced italic preamble row, and a new General Summary sheet totals every element down to Estimated Construction Cost, with editable Preliminaries, Contingency and VAT percentages."
            ]
          },
          {
            "type": "improved",
            "items": [
              "The rate you picked is remembered. QUIV stores the exact rate you chose on the bill line, so its build-up re-resolves the same way on any device instead of relying on a fuzzy re-match — and picking a rate now auto-applies it to similar unpriced lines.",
              "\"From Budget\" rates apply immediately. Bill rates driven from the budget now price the moment budget rows load or reprice, instead of staying at 0.00 until the first cloud save.",
              "Labour matches count. Automatically matched labour rows now count toward the \"Auto matched\" tally so the unpriced figure reflects reality."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Sign-in lockouts (DEVICE_MISMATCH) are gone. Your device used to be identified partly by whichever network adapter happened to be active, so switching between Wi-Fi, ethernet, a dock, a hotspot or a VPN could make the same laptop look like a brand-new machine and block sign-in. Device identity is now network-independent, and existing licences migrate themselves the first time you sign in.",
              "The Budget price refresh no longer wipes rates. Refreshing prices blanked every labour row and every rate derived from a build-up, so they could never re-match. Existing rates are now kept, and labour rows are priced from the labour library instead."
            ]
          }
        ],
        "highlight": "Ask QUIV for a takeoff in plain English, let it match your unpriced labour, and get a budget that reconciles line-for-line with the rate you priced — exported in proper QS format."
      },
      {
        "version": "3.1.1",
        "date": "June 2026",
        "latest": false,
        "title": "Priced budgets, element-level detail & a dockable workspace",
        "changes": [
          {
            "type": "new",
            "items": [
              "Per-element quantities — select any element in your model and instantly see its exact quantity and material breakdown. Available across Steelwork, Blockwork, Slab, Beam, Column, Pad & Strip Foundation, Curtain Wall, Doors, Windows, Landscaping and more.",
              "Bill of Quantities — saved takeoffs are now presented as a proper, structured Bill of Quantities. Re-save at any time to override and keep your BoQ in sync as the model evolves.",
              "Budget & margin dashboard — turn any takeoff into a priced budget in one step. Material and labour costs are derived automatically from rate build-ups, with a margin view so you can see profitability at a glance.",
              "Labour costing engine — labour is now priced directly from your rates and grouped right beside each module's materials, with a productivity build-up (gang × output → rate) and a live labour-rate library keeping figures realistic.",
              "Dockable side panel — keep QUIV open beside your model as a native Revit panel, or pop it out into its own window when you need more room."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Responsive narrow dock — when docked to a slim panel the dashboard cards stack, the Take-off List collapses to a compact tick-box summary, and the canvas scales to fit instead of clipping, then expands back when widened.",
              "New Reset Takeoff control that also clears the attached budget in one action, plus a dedicated reset for the material database.",
              "Press Enter to sign in, and a live date / time now shows in the header.",
              "Manually entered rates are now preserved when a saved view is rebuilt."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Corrected reinforcement pricing so per-tonne rates are no longer misapplied per-kilogram.",
              "Aligned and wrapped the work-item headers in the Strip Foundation materials popup.",
              "Removed a stray shadow that left a header card appearing blank."
            ]
          }
        ],
        "highlight": "Our biggest release yet — QUIV moves beyond quantities into full priced budgets, adds element-level detail, and ships a redesigned dockable workspace that lives right inside Revit."
      },
      {
        "version": "3.0.2",
        "date": "May 2026",
        "latest": false,
        "title": "Unit flexibility & Revit 2027",
        "changes": [
          {
            "type": "new",
            "items": [
              "Metric / Imperial unit switch — work in whichever unit system suits your project and switch on the fly.",
              "Revit 2027 support — added a Revit 2027 build target alongside existing supported versions."
            ]
          }
        ]
      },
      {
        "version": "3.0.1",
        "date": "April 2026",
        "latest": false,
        "title": "Model checking & multi-storey takeoffs",
        "changes": [
          {
            "type": "new",
            "items": [
              "Model Checker for Takeoff — validate your model before takeoff in a dedicated workspace, with one-click Excel export and a revamped roof workflow.",
              "Multi-storey Bill of Quantities — automatic multi-storey detection with a dynamic, per-floor BoQ export and smarter Excel cell-linking, so quantities flow straight into your spreadsheets."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Smoother recalculation that prevents overlapping calculations on rapid edits.",
              "Better linked-model handling and a new element visibility filter for cleaner takeoffs."
            ]
          }
        ],
        "highlight": "Focused on getting your quantities right — stronger model validation and full multi-storey support."
      }
    ]
  },
  {
    "slug": "civiq",
    "name": "CIVIQ",
    "tagline": "Civil & infrastructure quantity takeoff",
    "category": "Civil 3D Plugin",
    "accent": "violet",
    "icon": "map",
    "status": "coming-soon",
    "compatibility": "AutoCAD Civil 3D 2024+",
    "summary": "Model-based takeoff for civil and infrastructure works directly inside AutoCAD Civil 3D. In active development.",
    "order": 2,
    "latest": null,
    "lastUpdated": null,
    "itemCount": 0,
    "releases": []
  },
  {
    "slug": "heron",
    "name": "HERON",
    "tagline": "Takeoff-to-budget estimating for PlanSwift",
    "category": "ADLM Heron",
    "accent": "emerald",
    "icon": "layers",
    "status": "live",
    "compatibility": "PlanSwift 10+",
    "summary": "2D takeoff with automatic material + labour budgets, RateGen pricing and a fully-linked Excel BoQ — right inside PlanSwift.",
    "order": 3,
    "latest": "2.5.1",
    "lastUpdated": "31 July 2026",
    "itemCount": 66,
    "releases": [
      {
        "version": "2.5.1",
        "date": "31 July 2026",
        "latest": true,
        "title": "Sign-in restored",
        "changes": [
          {
            "type": "improved",
            "items": [
              "A server move no longer means a new download. Every part of HERON that talks to ADLM now goes through one setting, ADLM_API_BASE_URL, which the ADLM Installer Hub writes for you. This is the same mechanism QUIV already used — and the reason QUIV kept working throughout. If we ever move the service again, it is a settings change rather than a new version for every customer."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "\"Server is temporarily unavailable\" when signing in. HERON was built with ADLM's server address baked in. When the service moved to its new home, HERON kept calling the old address and every sign-in attempt failed with that message. Retrying did not help, and there was nothing you could change on your machine to point it at the working service — the address was fixed inside the plugin itself. HERON now reads the address from your machine's settings each time it starts, and sign-in works again.",
              "\"You are offline\" while your connection was fine. HERON decided whether you had a working connection by contacting that same retired address. Because nothing answered there, it could report you as offline — and fall back to offline behaviour — on a perfectly healthy internet connection. It now checks against the live service.",
              "Rates, cloud projects and licence checks were all affected by the same cause and all recover with this update. If HERON told you your subscription could not be verified during this period, that was this fault and not your licence."
            ]
          }
        ],
        "highlight": "HERON could not sign in after ADLM's servers moved. It now finds the service through your machine's settings instead of an address fixed when the plugin was built, so sign-in works again — and a future move will not need a new download."
      },
      {
        "version": "2.5",
        "date": "25 July 2026",
        "latest": false,
        "title": "The Specifications Release",
        "changes": [
          {
            "type": "new",
            "items": [
              "Specification input on every measured template. Finishes, walls (blockwork & openings), services (electrical, plumbing, HVAC, fire alarm, ELV), frame, roofing and substructure — every Area, Linear and Count template gains a \"Specification\" field on its record form. Existing installs are patched automatically on the next launch.",
              "Specifications tab. A new sidebar view lists every takeoff item in the job at a glance — trade, item, quantity, unit, the default bill description and your specification side by side. Type or clear a specification right in the table and it is saved back onto the PlanSwift item immediately, so it survives reloads and flows into every export. Includes a search box and an \"only items with a specification\" filter.",
              "Blank means default. Anywhere a description is produced, a non-blank Specification wins verbatim; blank falls back to the standard QS wording exactly as before."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Steel Tonnage crash. Clicking Steel Tonnage could take the whole app down. HERON now has an app-wide crash shield: unexpected errors show a friendly dialog and are written to a log file instead of closing the app. The steel scan also skips and reports unreadable items rather than aborting, and a theme file that fails to load no longer kills the session.",
              "Sidebar collapse now also hides the Steel Tonnage and Specifications labels."
            ]
          }
        ],
        "highlight": "Write your own bill descriptions. Every measured takeoff item now carries a free-text Specification — leave it blank and the bill keeps HERON's default wording; fill it in and your specification is what prints, in the cloud review, the Excel BoQ export and the Excel Takeoff Link."
      },
      {
        "version": "2.4.1",
        "date": "21 July 2026",
        "latest": false,
        "title": "Beam accuracy fix",
        "changes": [
          {
            "type": "fixed",
            "items": [
              "Concrete in beam section now measures correctly. The beam depth never entered the volume calculation, so the result didn't match a manual check against the measured linear metres. It now measures length × width × (thickness − slab thickness), matching the beam floor-plan tool. Thanks to the customer who reported this.",
              "Beam formwork now includes the soffit. Formwork on both beam tools was measured as the two sides only. It now measures both sides below the slab plus the soffit width, so the underside of the beam is priced.",
              "Slab Thickness on the beam section tool is now entered in metres, consistent with every other beam dimension.",
              "Note: existing drawn beam items keep their old formulas — redraw them, or re-create them from the template, to pick up the corrected calculation."
            ]
          }
        ]
      },
      {
        "version": "2.4",
        "date": "13 July 2026",
        "latest": false,
        "title": "The Excel Link & Steel Release",
        "changes": [
          {
            "type": "new",
            "items": [
              "Rates in Excel. A new Rates tab in the Excel Takeoff Link pane lists every BoQ item's Description, Unit, Rate and Amount straight from your Budget — pick a row and drop it into your sheet to fill a rate column. It stays linked, so refreshing re-pulls updated rates.",
              "Material & Labour in Excel. The Material Takeoff tab now shows your Budget's full material + labour breakdown (with unit rate and amount), instead of the old stored-breakdown view.",
              "Build a cell from several quantities. Link multiple takeoff items into one Excel cell as a running sum with Add to Cell, and pull individual items back out with Remove from Cell — the cell re-totals automatically.",
              "Steel Tonnage tab. A new tool that scans your job for steel sections (Universal Beams/Columns, channels, angles, hollow sections) in item names and converts each measured length to net / allowance / gross tonnage, with editable connection and waste allowances.",
              "Roof & truss steel. Steel Tonnage also reads the computed roof/truss members — rafters, purlins, tie beams, king posts, struts, chords, bracing — even when their names carry no section size. Assign a section from the searchable catalogue (or type a kg/m) and the tonnage fills in; your choice locks in and survives a re-scan.",
              "Live link tally. The Takeoff Link pane shows how many cells and items are currently linked in the workbook, updating as you link, add, remove or unlink."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Auto-refresh on return to Excel. Change a quantity or rate in HERON, switch back to your workbook, and the linked cells update automatically — no need to press Refresh (and unchanged cells are left untouched, so your Undo history is preserved).",
              "Findable takeoff items. Items that HERON renames to a full BoQ description (e.g. \"DPM\" → \"…waterproof sheeting…\") now keep their original name in front, so you can still search the pane for DPM, Topsoil, etc.",
              "Readable, resizable pane. Descriptions wrap to show in full, columns are drag-resizable, and hovering any cell shows its complete text.",
              "Works offline. The Rates and Material Takeoff lists appear even before you sign in to load prices — the figures read zero until prices load, then refresh in place.",
              "Professional bill export. The Excel Save / Export now writes a proper Bill of Quantities layout — ITEM · DESCRIPTION · QTY · UNIT · RATE · AMOUNT columns, QS item lettering (A, B, C … skipping I and O), a bold work-section header, wrapped descriptions and accounting number format (unpriced lines read \"-\"), with the Rate column left blank for pricing."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Takeoff Link pane now always opens. Previously, if Excel started on its Start screen with no workbook, clicking Takeoff Link did nothing. The pane is now created against the workbook you're actually in, and any error is shown instead of failing silently.",
              "Budget \"No take-off folders found.\" The Budget view now re-checks PlanSwift for the open job, so it loads your folders even when the plugin started before a job was open.",
              "Steel Tonnage startup crash fixed (a theme styling error that stopped the tab from loading)."
            ]
          }
        ],
        "highlight": "A live two-way Excel Takeoff Link, a new Steel Tonnage tool that turns measured lengths into weights, and a batch of reliability fixes."
      },
      {
        "version": "2.3",
        "date": "8 June 2026",
        "latest": false,
        "title": "The Budget Release",
        "changes": [
          {
            "type": "new",
            "items": [
              "Budget view (Material & Labour schedule). A new Budget tab replaces the old Material Breakdown view. It lists every BoQ line item, grouped by takeoff folder, with its material and labour build-up underneath — computed automatically the moment you open it.",
              "Automatic material breakdown. Each item's materials are calculated from built-in QS recipes (concrete mix ratios, reinforcement by bar diameter, formwork, blockwork, rendering and more) and priced from your RateGen material library.",
              "Labour from your real rates. Labour cost is taken from the actual labour content of the matched RateGen rate — not a guess — so your build-up reflects the rates you already maintain.",
              "Profit & margin per item. HERON shows overhead + profit and a margin % on every item (green for profit, red for loss) and rolls it up to a project-level total at the top of the view.",
              "Over-budget guardrail. If an item's material + labour cost exceeds its rate, it's flagged OVER BUDGET with a hover explanation telling you exactly which figure to adjust — and saving is blocked until it's resolved, so you never quote below cost by accident.",
              "Editable prices with inline rate search. Every price is editable. Start typing in a price cell to search your RateGen material and labour libraries and drop in a rate without leaving the schedule. Totals and margins update live as you type.",
              "Fully-linked Excel BoQ export. Export the whole budget to a multi-sheet Excel workbook. For each folder you get a BoQ sheet and a Budget sheet, connected with live cell links — change a rate and the margin recalculates in Excel — plus a master Budget Summary sheet with grand totals, overhead + profit, and margin % per section.",
              "Save Budget to Cloud. Push your budget to your ADLM cloud project so proposed-vs-actual margins can be tracked online. The budget is saved as a linked companion to its takeoff, so your quantities and your costs stay tied together.",
              "Project profit header. A colour-coded strip across the top of the Budget view shows Project Cost (Material + Labour), Take-off Value, Overhead + Profit and Margin % at a glance, with a PROFIT / LOSS badge."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Better rate matching. HERON now matches your items against both your custom rates and the master RateGen library, dramatically increasing how many items get priced automatically (typical projects went from almost no matches to roughly half matched on the first pass, before any manual matching).",
              "Keep edited rates. A new \"Keep edited rates\" option on the takeoff review screen preserves the rates you've adjusted across closing and reopening a project — choose your edited values or refresh to the latest library rates, per review."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Steel priced by the tonne is now correctly converted to a per-length rate. No more inflated figures — a single bar no longer shows as ₦1.18M because a per-tonne price was applied per length.",
              "Reinforcement bar size is now read per item (column links, main bars, etc.) so each line uses the correct diameter and binding-wire allowance instead of a fixed 12 mm.",
              "Saved budgets now persist correctly to the cloud, including your edited prices and the profit line, even when the project name comes from the takeoff flow."
            ]
          }
        ],
        "highlight": "Turn any takeoff into a costed budget automatically. HERON now builds a full Material & Labour schedule for every BoQ item, prices it from your RateGen library, works out your overhead & profit per item, and exports it all as a linked Excel workbook."
      },
      {
        "version": "2.2",
        "date": "15 May 2026",
        "latest": false,
        "title": "Units & Templates",
        "changes": [
          {
            "type": "new",
            "items": [
              "App-wide metric / imperial toggle. Switch the whole plugin between metric and imperial units from one control — quantities, rates and displays all follow.",
              "Automatic scale-unit detection. When you open a project, HERON reads PlanSwift's scale units and configures itself automatically, so quantities come out right whatever the drawing was set up in.",
              "Piling templates. New piling takeoff templates for bored / cast-in-place pile measurement.",
              "Ribbed-slab templates. New and corrected ribbed-slab templates.",
              "Native sub-items now visible. Substructure sub-items — Hardcore, DPM, Laterite, Blinding — are now shown directly from your PlanSwift takeoff."
            ]
          },
          {
            "type": "improved",
            "items": [
              "In-app sub-item engine. A new calculation engine computes sub-item quantities inside the plugin for faster, more consistent results.",
              "Result-unit inference. HERON infers an item's result unit from its type and detects pages more broadly, reducing manual unit fixes."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Corrected sub-item quantities for Beam, Slab, Staircase and Pile Cap items.",
              "Unit normalisation. Scale-unit inputs from PlanSwift are normalised to metric at the point of calculation, eliminating mixed-unit errors in derived quantities."
            ]
          }
        ],
        "highlight": "A complete units overhaul plus two new trade templates and far more accurate sub-item quantities."
      },
      {
        "version": "2.1",
        "date": "18 April 2026",
        "latest": false,
        "title": "Cloud, Rates & Security",
        "changes": [
          {
            "type": "new",
            "items": [
              "Cloud Dashboard. A new home screen for your ADLM cloud projects — open, review and manage takeoffs and material projects from one place.",
              "Material price matching. HERON matches your takeoff items to your RateGen price library automatically, bringing live rates into your takeoff.",
              "Steel truss & member templates. New templates for steel truss and member takeoff.",
              "MEP templates. New mechanical, electrical & plumbing takeoff templates.",
              "Multi-folder export. Select and export several takeoff folders at once.",
              "Currency & zone handling. Rates respect your currency and regional pricing zone, with conversion applied automatically.",
              "Splash screen & material projects. A new startup splash screen and dedicated material projects."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Excel export & offline use. A more robust Excel takeoff / BoQ export that also works offline.",
              "Automatic template repair. HERON now detects and fixes common issues in PlanSwift template definitions on load, so trade templates calculate correctly out of the box.",
              "Count-based steel accessories now correctly use the \"Nr\" (number) unit.",
              "Hardened licence validation. Licences are now validated with industry-standard RS256 / JWKS signing (with a safe fallback), replacing the previous scheme.",
              "Device-bound licensing. A hardware fingerprint ties each licence to the activated device, and hard-coded secrets have been removed from the installer.",
              "Leaner, safer footprint. Removed the legacy MongoDB dependency and self-managed the signing key, fixing a crash when reopening the app after closing."
            ]
          }
        ],
        "highlight": "The foundation release: a cloud dashboard, automatic price matching against your RateGen rates, new steel and MEP templates, multi-folder export, and a hardened licensing system."
      },
      {
        "version": "1.0",
        "date": "2022",
        "latest": false,
        "title": "HERON for PlanSwift",
        "changes": [
          {
            "type": "new",
            "items": [
              "2D quantity takeoff directly inside PlanSwift.",
              "BESMM4R / NRM-aligned measurement output.",
              "One-click export to Excel for billing."
            ]
          }
        ],
        "highlight": "HERON brings ADLM's takeoff workflow to PlanSwift, turning 2D drawings into structured, standards-aligned quantities."
      }
    ]
  },
  {
    "slug": "mep",
    "name": "ADLM MEP",
    "tagline": "MEP quantity takeoff for Autodesk Revit",
    "category": "Revit MEP Plugin",
    "accent": "sky",
    "icon": "zap",
    "status": "live",
    "compatibility": "Revit 2024, 2025, 2026 & 2027",
    "summary": "Mechanical, electrical & plumbing quantity takeoff right inside Revit — covers ductwork, pipework, electrical and plumbing disciplines in a dockable, cloud-connected workspace.",
    "order": 4,
    "latest": "1.8.3",
    "lastUpdated": "31 July 2026",
    "itemCount": 33,
    "releases": [
      {
        "version": "1.8.3",
        "date": "31 July 2026",
        "latest": true,
        "title": "Sign-in restored",
        "changes": [
          {
            "type": "improved",
            "items": [
              "A server move no longer means a new download. ADLM MEP now reads ADLM_API_BASE_URL from your machine — the setting the ADLM Installer Hub already writes — so the service address can change without a new version being shipped to every customer."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Sign-in failing after the server move. ADLM MEP had ADLM's server address built into it in three separate places — sign-in, licence-key checks and the cloud save service. When the service moved, all three kept calling the old address, so signing in failed and cloud saves could not complete. There was no setting on your machine that could redirect them. All three now read the address from one place at startup, and it is configurable.",
              "Cloud takeoff saves and reopens recover with this update; they shared the same cause."
            ]
          }
        ],
        "highlight": "ADLM MEP could not sign in after ADLM's servers moved. It now finds the service through your machine's settings rather than an address fixed when the plugin was built."
      },
      {
        "version": "1.8.2",
        "date": "July 2026",
        "latest": false,
        "title": "Sign in from any network",
        "changes": [
          {
            "type": "fixed",
            "items": [
              "Sign-in lockouts (DEVICE_MISMATCH) are gone. Your licence seat was tied to a device identity that included whichever network adapter happened to be active, so plugging into a dock, starting a VPN, or switching between Wi-Fi and ethernet could make the same machine look like a new device and get the login rejected. ADLM MEP now uses the stable hardware identity shared across every ADLM product, and an existing licence binding is migrated automatically the first time you sign in — nothing to do on your side."
            ]
          }
        ]
      },
      {
        "version": "1.2",
        "date": "June 2026",
        "latest": false,
        "title": "Dockable workspace, dark mode & pricing engine",
        "changes": [
          {
            "type": "new",
            "items": [
              "Dockable side panel — all nine MEP disciplines now live inside a native Revit dock panel. Toggle between the dock and a full floating window from the ribbon without losing your work.",
              "Dark mode — a full Revit-native dark theme (Revit 2025+) with a ThemeManager that follows Revit's own theme so the plugin always feels at home.",
              "Revit 2024 – 2027 multi-target build — a single hub installer now covers Revit 2024, 2025, 2026 and 2027 so you never need separate downloads.",
              "Pricing engine & budget dashboard — turn any takeoff into a priced budget. Enter rates manually or pick from your RateGen library; a live Bill total and margin view show profitability per discipline.",
              "Manual rate editing — every quantity row is editable; rates are stored with provenance so you can see whether each figure came from RateGen, was entered manually, or carried from a previous save.",
              "Formula-linked Budget Summary Excel export — exports a multi-sheet workbook with per-discipline budget sheets and a master Budget Summary page, all linked by live Excel formulas.",
              "GitHub Actions CI — automated build matrix covers all Revit targets on every push so broken builds are caught before they reach you."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Compact icon sidebar rail — the left sidebar collapses to icon-only mode, giving more space to the takeoff grid on narrower panels."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Duct takeoff now correctly filters by level, so quantities no longer bleed across floors.",
              "Pipe self-comparison bug fixed — pipes were occasionally matched against themselves, inflating takeoff counts.",
              "Mouse-wheel scrolling restored in the takeoff items list."
            ]
          }
        ],
        "highlight": "ADLM MEP gets its dockable workspace, a Revit-native dark mode, full Revit 2024–2027 coverage, and a pricing/budget engine that turns raw quantities into a costed, exportable budget."
      },
      {
        "version": "1.1",
        "date": "April 2026",
        "latest": false,
        "title": "Cloud save, ADLM design system & Revit 2026",
        "changes": [
          {
            "type": "new",
            "items": [
              "Cloud save — takeoff results are pushed directly to your ADLM cloud project so quantities are accessible on the web portal the moment you save.",
              "XLSX auto-save — takeoff data is also saved locally as an Excel file after every calculation, with a duplicate guard so re-runs don't create extra copies.",
              "Recent projects panel — quickly reopen any of your last cloud projects from the home screen without searching.",
              "Highlight in model — click any row in the results list to select and highlight the corresponding Revit element in the viewport.",
              "RS256 / JWKS licence validation — licences are now signed with industry-standard RS256 and validated via JWKS, replacing the previous scheme.",
              "Device-bound licensing — a hardware fingerprint ties each licence to the activated device; hardcoded secrets have been removed from the installer.",
              "Revit 2026 support — sign-in and cloud save now work correctly in Revit 2026."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Sign-in dialog now closes cleanly on any result and surfaces the actual error message instead of a generic failure.",
              "TextBox and PasswordBox were silently dropping keyboard input — fixed.",
              "DataGrid rows now auto-size and fill the window instead of being clipped to a fixed 160 px height."
            ]
          }
        ],
        "highlight": "The cloud foundation release: save quantities to your ADLM project, get live Excel backups, and work with a fully refreshed ADLM design system — now in Revit 2026."
      },
      {
        "version": "1.0",
        "date": "August 2025",
        "latest": false,
        "title": "ADLM MEP for Revit",
        "changes": [
          {
            "type": "new",
            "items": [
              "Ductwork & duct fittings takeoff — measure supply, return and exhaust ductwork by level, type and system with automatic fitting counts.",
              "Pipework takeoff — quantity takeoff for mechanical and HVAC pipework, including pipe runs and connections.",
              "Plumbing fixtures takeoff — count and schedule all plumbing fixtures from the Revit model.",
              "Lighting takeoff — scheduled count and wattage summary for all lighting fixtures by level.",
              "Power (electrical) takeoff — electrical device and panel counts extracted directly from the model.",
              "Cable takeoff — cable tray and conduit lengths measured by level and system.",
              "Air terminal takeoff — diffusers, grilles and terminal units counted and grouped by system.",
              "Export to Excel — export any discipline's takeoff to a formatted Excel sheet in one click."
            ]
          }
        ],
        "highlight": "ADLM MEP launches with full quantity takeoff across seven MEP disciplines, all extracted live from your Revit model and exportable to Excel."
      }
    ]
  },
  {
    "slug": "rategen",
    "name": "RateGen",
    "tagline": "Instant rate build-ups & market pricing for QS",
    "category": "Desktop App",
    "accent": "blue",
    "icon": "dollar",
    "status": "live",
    "compatibility": "",
    "summary": "Defensible rate build-ups with location-based pricing and a cloud-synced rate library.",
    "order": 5,
    "latest": "2.5.0",
    "lastUpdated": "July 2026",
    "itemCount": 19,
    "releases": [
      {
        "version": "2.5.0",
        "date": "July 2026",
        "latest": true,
        "title": "Build with AI & one master price library",
        "changes": [
          {
            "type": "new",
            "items": [
              "Build with AI. A new AI section on the Custom Rate form takes a plain-English description and fills in the entry form for you — components, quantities and prices, with inferred lines tagged so you can see what came from the AI. It shows a confidence figure and an advisory note, and nothing is saved automatically: you review, edit and save through the normal flow, exactly as with a rate you built by hand.",
              "Master price library sync. \"Sync from Cloud\" — and every sign-in — now pulls the zone-priced master price library maintained by ADLM and merges it with your own rows, so RateGen, QUIV, HERON and ADLM MEP all price from the same single source of truth instead of drifting apart."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Your zone follows your account. Refreshing your profile stores your account's pricing zone, so every sync prices against your real location. Signing in now refreshes prices silently even when your zone hasn't changed; the confirmation prompt is kept for an actual zone switch.",
              "Diagnosable upgrades. Data-migration problems on startup are written to a timestamped log under your local app data instead of being discarded, so a support ticket can be resolved from the log. Migrations still never block RateGen from starting."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Sign-in lockouts (DEVICE_MISMATCH) are gone. Your licence seat was bound to a fingerprint derived from whichever network adapter was fastest and active at that moment — so a dock, a USB ethernet adapter, a VPN, or simply switching between Wi-Fi and cable made the same machine look new and the server rejected the login. RateGen now identifies the machine by its hardware, existing bindings are migrated in place at sign-in, and cached offline licences issued under the old scheme keep working."
            ]
          }
        ],
        "highlight": "Describe a rate in plain English and let RateGen draft the build-up for you — and every ADLM product now prices from the same master library for your zone."
      },
      {
        "version": "1.3",
        "date": "May 2026",
        "latest": false,
        "title": "Multi-device cloud sync",
        "changes": [
          {
            "type": "new",
            "items": [
              "Multi-device cloud sync — your custom rates, materials and labour prices are now synced to the cloud and available on any device you sign into, so your library follows you."
            ]
          }
        ],
        "highlight": "Your rate library now follows you — sign in on any device and your custom rates are ready to go."
      },
      {
        "version": "1.2",
        "date": "April 2026",
        "latest": false,
        "title": "Security hardening & hub installer",
        "changes": [
          {
            "type": "new",
            "items": [
              "RS256 / JWKS licence validation — licences are now signed with industry-standard RS256 and validated via JWKS, replacing the previous scheme.",
              "Encrypted credential storage — the encryption key is registered as an environment variable at install time and never stored in plain text.",
              "Hub installer packaging — RateGen ships via a single hub installer that handles registration and environment setup automatically."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Device-bound licensing — a hardware fingerprint ties each licence to the activated device; hardcoded secrets have been removed from the build."
            ]
          }
        ],
        "highlight": "A full security pass: RS256 licensing, encrypted credentials and a clean hub installer."
      },
      {
        "version": "1.1",
        "date": "November 2025",
        "latest": false,
        "title": "Cloud rate library & zone pricing",
        "changes": [
          {
            "type": "new",
            "items": [
              "Save materials & labour to cloud — your custom material and labour prices are pushed to your ADLM account so they are available across HERON and QUIV automatically.",
              "Zone-based pricing — rates now reflect your selected regional pricing zone, with automatic conversion applied so figures are market-relevant wherever you are.",
              "Online sign-in — sign in with your ADLM credentials directly from within RateGen; the session stays active across restarts."
            ]
          }
        ],
        "highlight": "Custom rates now live in the cloud and automatically flow into your takeoff plugins — no more manual syncing."
      },
      {
        "version": "1.0",
        "date": "May 2025",
        "latest": false,
        "title": "RateGen launches",
        "changes": [
          {
            "type": "new",
            "items": [
              "Instant rate build-ups for fast, accurate cost estimates across all major construction trades.",
              "Location-based pricing and vendor insights tuned for the Nigerian construction market.",
              "Cloud-synced Rate Library so your whole team works from the same numbers.",
              "Currency conversion — switch between NGN and other currencies with conversion applied live.",
              "Dark mode — a full dark theme that is easy on the eyes during long estimating sessions.",
              "Custom rates & global search — add your own rates to every trade category and search across the entire library in one keystroke."
            ]
          }
        ],
        "highlight": "Build up rates in seconds with pricing tuned for the Nigerian construction market."
      }
    ]
  },
  {
    "slug": "timepro",
    "name": "ADLM Time Pro",
    "tagline": "Site productivity tracking & programme durations for construction teams",
    "category": "Time Pro",
    "accent": "orange",
    "icon": "trending",
    "status": "live",
    "compatibility": "Windows 10 & 11",
    "summary": "Log daily site output, turn it into realistic durations and crew sizes, and export a priced programme straight to Microsoft Project.",
    "order": 6,
    "latest": "1.1.0",
    "lastUpdated": "August 2026",
    "itemCount": 12,
    "releases": [
      {
        "version": "1.1.0",
        "date": "August 2026",
        "latest": true,
        "title": "Dark mode, a side menu you can actually read, and MS Project exports that open",
        "changes": [
          {
            "type": "new",
            "items": [
              "Dark mode, everywhere. A full dark theme across every screen — sign-in, Task Log, Duration Summary, Current Weather, the task editor and the export dialogs. Time Pro follows your Windows light/dark setting the first time you open it, and remembers your choice after that. Switch any time from the moon icon at the bottom of the side menu.",
              "Sign out from the side menu. Signing out no longer means hunting through the profile dropdown at the top of the window. It sits at the bottom of the side menu, under the theme switch.",
              "Choose the currency for your export. The Microsoft Project export now asks which currency your rates are in — Naira, Dollar, Pound, Euro, Cedi, Shilling, Rand, CFA, Dirham, Riyal, Rupee and the Canadian and Australian dollars. Time Pro starts on the currency your Windows region uses and remembers your pick. The rate fields relabel to match, and the currency travels into the file, so Microsoft Project shows costs in the same money you typed."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "The side menu buttons were unreadable. Current Weather, Task Log and Duration Summary rendered as bright empty blocks — no icon, no label, nothing to tell them apart. Every button now shows its icon and its name, with the active page in ADLM orange and a light tint on hover.",
              "Microsoft Project would not open the exported file. The export produced a file Project rejected, so a programme you had priced and scheduled simply would not load. The file is now built to Microsoft's published specification and validated against it before release, so it opens straight from File → Open.",
              "Labour and equipment came through as the wrong kind of resource. Skilled and unskilled labour were being written as materials and equipment as labour, so hourly rates landed in the wrong column and costed incorrectly. Labour is now hourly labour, equipment is a per-use material, and crews no longer open flagged as over-allocated.",
              "The Project Start Date box on the export dialog looked empty. The date was set, but the field drew nothing — so it read as though you had forgotten to pick one. It now shows the date.",
              "\"No BOQ quantity entered\" when you had entered one. Items with no logged output history cannot be given an estimated duration, and the export was quietly dropping them behind a message saying the quantity was missing — which was not true. Time Pro now names the items it cannot schedule and tells you what they need: either a Planned Duration typed in by hand, or some logged tasks to learn from.",
              "The ADLM logo vanished in dark mode. The navy wordmark disappeared into the dark side menu. Dark mode now uses a light version of the logo."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Tasks now chain in Microsoft Project. Each work item is linked finish-to-start to the one before it, so moving the first task reschedules the whole programme instead of leaving you to drag every bar by hand.",
              "Rate fields accept the numbers you actually type. 1,500.00 and ₦1500 used to fall back to zero without saying so. They are now read correctly.",
              "A tidier side menu. Collapsed, the buttons are even squares centred in the rail with the label on hover, instead of thin slivers squeezed against the edge."
            ]
          }
        ],
        "highlight": "Happy new month. August opens with the release Time Pro has been waiting for: the app now has a proper dark mode, the side menu shows its icons and labels instead of blank coloured blocks, and the Microsoft Project export produces a file Project will actually open — priced in your own currency."
      }
    ]
  },
  {
    "slug": "cloud",
    "name": "ADLM Cloud",
    "tagline": "Your projects, budgets, billing and reports on the web",
    "category": "Web Platform",
    "accent": "violet",
    "icon": "trending",
    "status": "live",
    "compatibility": "Any modern browser",
    "summary": "The web home for every ADLM product — projects and budgets from your plugins, valuations and reports, subscriptions, invoices and your AI assistant.",
    "order": 7,
    "latest": "2026.07",
    "lastUpdated": "July 2026",
    "itemCount": 19,
    "releases": [
      {
        "version": "2026.07",
        "date": "July 2026",
        "latest": true,
        "title": "Card payments, auto-renewal, reports & Ada",
        "changes": [
          {
            "type": "new",
            "items": [
              "Pay by card. Card checkout is live alongside bank transfer, so a subscription can be activated in minutes instead of waiting on a transfer to be confirmed.",
              "Subscriptions that renew themselves. Tick auto-renew at checkout, or turn it on later in Profile → Billing. Your card is charged automatically before your licence expires and the entitlement is extended without a support ticket. You can see the saved card, switch auto-renew off, or remove the card at any time — and if a renewal is declined you get an email and it retries before your access lapses.",
              "Downloadable receipts. Every paid invoice can now be downloaded as a receipt PDF from your invoices page or your account activity feed.",
              "Project, PM & Management PDF reports. Generate a report from any open project — the project report, the PM report, or a management report across your whole portfolio — preview it in the app, then download the PDF.",
              "Project activity log. Profile → Project Activity shows a full trail of everything that has happened on your projects: creations, contract locks, variations, rate and budget edits, certificates, final accounts, model uploads, collaborator changes and PM schedule updates. It exports as a branded, printable PDF.",
              "Ada, your AI assistant. Ada replaces the old help bot: she answers questions about the products and pricing grounded in the real catalogue, and — once you are signed in — about your own projects and subscriptions. She can hand you over to a human on WhatsApp whenever you would rather talk to us.",
              "Extra project storage slots. Buy additional project slots in blocks of ten for any product straight from the purchase page, with the price shown live before you pay.",
              "Excel BoQ import for QUIV. Turn an existing Excel Bill of Quantities into a full QUIV project — it lands on your projects page with the whole budget, valuation, variation, PC-sum and dashboard pipeline behind it. The importer reads real-world QS workbooks (multiple bill sheets, section headings, preambles, lump-sum preliminaries) as well as the downloadable ADLM template, and re-importing a newer copy of the same workbook updates the project in place without losing your procurement marks or completion history. Available on request for accounts with a live QUIV subscription.",
              "QUIV for ArchiCAD workspace. A new web workspace for ArchiCAD takeoffs — Bill of Quantities, element detail, budget dashboard, unit switching and versioned exports.",
              "User guides on your dashboard. Four illustrated PDF guides — the Installer Hub, QUIV for Revit, ADLM Rate Gen, and the combined Installer Hub & ADLM Heron book — are now published on your dashboard and linked from your welcome email."
            ]
          },
          {
            "type": "improved",
            "items": [
              "The portfolio dashboard now shows all of your work. It was only reading four project types, so HERON, Civil and every materials project were invisible in the rollup. All of them are now included, with the same cost and valuation totals.",
              "Buying from outside Nigeria. Card charges are processed in Naira, which most foreign cards decline — so buyers outside Nigeria are now detected automatically, shown USD pricing, and led with bank transfer instead of hitting a card error. The card route is still there behind an explicit opt-in for anyone holding a Nigerian card.",
              "A tidier projects list. Schedule-only PM tracker projects no longer clutter the takeoffs list, and the sidebar has been reordered around how the products are actually used.",
              "Faster help with sign-in problems. When a plugin sign-in is rejected for a device mismatch, the server now records exactly what happened, so support can resolve it without asking you for screenshots."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "Purchases now grant exactly the duration you paid for, and a yearly-billed course is capped at exactly one year.",
              "Dashboard project counts were wrong for some products, and a storage bar was showing on products that hold no projects.",
              "Your cart survives sign-in. A restored cart or a ?product= link now reopens the configurator with your selections intact instead of being wiped, and edits made in the configurator apply to items already in your order straight away.",
              "Budgets reflect completed BoQ items, and the daily valuation log now rebuilds measured items from the project's own state, so valuations reconcile.",
              "Nobody is locked out by the old device fingerprint. The migration that moves a licence from the old device identity to the new one no longer expires on a fixed date — it stays open until each licence has moved across."
            ]
          }
        ],
        "highlight": "A big month on the web: pay by card and let your subscription renew itself, download receipts and PDF reports, follow every change on a project, and ask Ada anything."
      }
    ]
  },
  {
    "slug": "hub",
    "name": "ADLM Installer Hub",
    "tagline": "Install, update and licence every ADLM product from one app",
    "category": "Desktop App",
    "accent": "blue",
    "icon": "book",
    "status": "live",
    "compatibility": "Windows 10 & 11",
    "summary": "One signed-in desktop app that installs your ADLM products, keeps them updated, shows what your subscription covers, and gets you help when something goes wrong.",
    "order": 8,
    "latest": "1.0",
    "lastUpdated": "July 2026",
    "itemCount": 8,
    "releases": [
      {
        "version": "1.0",
        "date": "July 2026",
        "latest": true,
        "title": "Everything you own, installed from one place",
        "changes": [
          {
            "type": "new",
            "items": [
              "Illustrated user guide, one click away. A 21-page guide walks a new user from signing in through their first install, their first update, and the things that commonly go wrong — with an annotated figure of every screen. A Download User Guide button now sits in the sidebar under \"Raise a ticket\".",
              "PlanSwift import package for ADLM Heron. Heron now ships the ADLM TakeOff Package onto your desktop so PlanSwift can merge-import the types, scripts, estimating layouts and plugin tools that cannot safely be copied into storage over your existing data.",
              "Product artwork on every card. Each product now shows its own icon in the Hub instead of a shared ADLM badge.",
              "Latest builds for every product — ADLM Heron 2.9.0, QUIV for Revit 3.1.6, ADLM Rate Gen 2.5.0, ADLM Revit MEP 1.8.2, ADLM Time Pro 1.1.0 and QUIV for ArchiCAD 1.0.0 — all installed and updated from the same place."
            ]
          },
          {
            "type": "improved",
            "items": [
              "Support can install on your machine. The device-binding check is bypassed for the main ADLM admin account, so a support engineer can install and verify a product on a customer machine without disturbing what your licence is bound to.",
              "Clearer product names. The PlanSwift plugin is now ADLM Heron and the Revit plugin is QUIV for Revit throughout the Hub, the catalogue notes and the guides — matching the names used on the website."
            ]
          },
          {
            "type": "fixed",
            "items": [
              "\"Launch\" after an install now works. Ticking Launch at the end of setup failed with a Windows error because the app needs to start elevated. It now launches correctly.",
              "Uninstall cleans up every profile — and asks first. Uninstalling only ever removed the Hub's data for the administrator who approved it, leaving other Windows users' settings behind. It now clears every profile, asks before deleting your settings (defaulting to keeping them), and a silent uninstall always keeps user data so an upgrade never wipes your setup."
            ]
          }
        ],
        "highlight": "Sign in once and the Hub shows every product your subscription covers, installs it, keeps it updated, and now ships with a full illustrated user guide."
      }
    ]
  },
  {
    "slug": "courses",
    "name": "Courses",
    "tagline": "Professional QS & BIM training",
    "category": "Learning",
    "accent": "amber",
    "icon": "play",
    "status": "live",
    "compatibility": "",
    "summary": "Hands-on, BIM-focused training and certifications for QS professionals.",
    "order": 9,
    "latest": "1.0",
    "lastUpdated": "2020",
    "itemCount": 3,
    "releases": [
      {
        "version": "1.0",
        "date": "2020",
        "latest": true,
        "title": "ADLM Learning",
        "changes": [
          {
            "type": "new",
            "items": [
              "On-demand video courses with certificates of completion.",
              "BIM-focused, hands-on curriculum built around real QS workflows.",
              "Physical and online training cohorts."
            ]
          }
        ],
        "highlight": "On-demand and instructor-led courses that take QS professionals into modern digital workflows."
      }
    ]
  }
];

export const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));

export default products;
