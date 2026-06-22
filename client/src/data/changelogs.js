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
    "category": "Revit Plugin",
    "accent": "violet",
    "icon": "map",
    "status": "coming-soon",
    "compatibility": "",
    "summary": "Model-based takeoff for civil and infrastructure works. In active development.",
    "order": 2,
    "latest": null,
    "lastUpdated": null,
    "itemCount": 0,
    "releases": []
  },
  {
    "slug": "heron",
    "name": "HERON",
    "tagline": "2D quantity takeoff for PlanSwift",
    "category": "PlanSwift Plugin",
    "accent": "emerald",
    "icon": "layers",
    "status": "live",
    "compatibility": "PlanSwift 10+",
    "summary": "Fast, standards-aligned 2D measurement and takeoff inside PlanSwift.",
    "order": 3,
    "latest": "1.0",
    "lastUpdated": "2022",
    "itemCount": 3,
    "releases": [
      {
        "version": "1.0",
        "date": "2022",
        "latest": true,
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
    "status": "coming-soon",
    "compatibility": "",
    "summary": "Mechanical, electrical & plumbing takeoff for Revit. Coming soon.",
    "order": 4,
    "latest": null,
    "lastUpdated": null,
    "itemCount": 0,
    "releases": []
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
    "latest": "1.0",
    "lastUpdated": "2025",
    "itemCount": 3,
    "releases": [
      {
        "version": "1.0",
        "date": "2025",
        "latest": true,
        "title": "RateGen launches",
        "changes": [
          {
            "type": "new",
            "items": [
              "Instant rate build-ups for fast, accurate cost estimates.",
              "Location-based pricing and vendor insights.",
              "Cloud-synced Rate Library so your whole team works from the same numbers."
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
