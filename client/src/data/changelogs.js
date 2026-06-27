/* eslint-disable */
// ⚠️  AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Source of truth: src/data/changelogs/*.md  (one markdown file per product)
// Regenerate:      npm run gen:changelogs  (also runs on build & dev)
export const products = [
  {
    "slug": "quiv",
    "name": "QUIV",
    "tagline": "Quantity takeoff & estimating for Autodesk Revit",
    "category": "Revit Plugin",
    "accent": "orange",
    "icon": "cube",
    "status": "live",
    "compatibility": "Revit 2024, 2026 & 2027",
    "summary": "Model-based quantity takeoff, priced budgets and a dockable workspace — right inside Revit.",
    "order": 1,
    "latest": "3.1.1",
    "lastUpdated": "June 2026",
    "itemCount": 18,
    "releases": [
      {
        "version": "3.1.1",
        "date": "June 2026",
        "latest": true,
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
    "category": "PlanSwift Plugin",
    "accent": "emerald",
    "icon": "layers",
    "status": "live",
    "compatibility": "PlanSwift 10+",
    "summary": "2D takeoff with automatic material + labour budgets, RateGen pricing and a fully-linked Excel BoQ — right inside PlanSwift.",
    "order": 3,
    "latest": "2.3",
    "lastUpdated": "8 June 2026",
    "itemCount": 39,
    "releases": [
      {
        "version": "2.3",
        "date": "8 June 2026",
        "latest": true,
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
    "category": "Revit Plugin",
    "accent": "sky",
    "icon": "zap",
    "status": "live",
    "compatibility": "Revit 2024, 2025, 2026 & 2027",
    "summary": "Mechanical, electrical & plumbing quantity takeoff right inside Revit — covers ductwork, pipework, electrical and plumbing disciplines in a dockable, cloud-connected workspace.",
    "order": 4,
    "latest": "1.2",
    "lastUpdated": "June 2026",
    "itemCount": 29,
    "releases": [
      {
        "version": "1.2",
        "date": "June 2026",
        "latest": true,
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
    "latest": "1.3",
    "lastUpdated": "May 2026",
    "itemCount": 14,
    "releases": [
      {
        "version": "1.3",
        "date": "May 2026",
        "latest": true,
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
    "slug": "courses",
    "name": "Courses",
    "tagline": "Professional QS & BIM training",
    "category": "Learning",
    "accent": "amber",
    "icon": "play",
    "status": "live",
    "compatibility": "",
    "summary": "Hands-on, BIM-focused training and certifications for QS professionals.",
    "order": 6,
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
