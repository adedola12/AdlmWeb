// server/config/prospectingProfiles.js
//
// The three ideal customer profiles outbound prospecting starts with. Seeded
// by scripts/seed-prospecting-profiles.mjs, then edited in the admin; the
// seed only inserts a profile that is missing and never overwrites one an
// admin has changed.
//
// The product each segment is pitched is a first guess, meant to be changed
// in the admin once the product briefs in config/products.md are written.

export const SEED_PROFILES = [
  {
    key: "qs-consultancies-lagos-abuja",
    segment: "QS consultancies in Lagos and Abuja",
    targetProduct: "heron",
    locations: ["Lagos", "Abuja"],
    companyTypes: ["quantity surveying consultancy", "cost consultancy", "project cost management firm"],
    jobTitles: ["Managing Partner", "Principal Partner", "Senior Partner", "Director", "Head of Cost Management"],
    keywords: ["quantity surveyors", "bill of quantities", "cost planning", "NIQS", "QSRBN", "tender documentation"],
    exclusions: ["recruitment agencies", "training institutes", "sole practitioners with no website", "existing ADLM customers"],
    notes: "Firms that produce bills of quantities for building projects and would take off faster with HERON. Partners decide software purchases.",
  },
  {
    key: "contractors-nigeria",
    segment: "Construction contractors in Nigeria",
    targetProduct: "rategen",
    locations: ["Nigeria"],
    companyTypes: ["building contractor", "civil engineering contractor", "design and build contractor"],
    jobTitles: ["Managing Director", "Commercial Manager", "Head of Estimating", "Chief Quantity Surveyor", "Project Director"],
    keywords: ["construction company", "building construction", "tendering", "estimating", "COREN", "FEC contractor"],
    exclusions: ["building materials suppliers", "real estate agents only", "multinationals with in-house global systems", "existing ADLM customers"],
    notes: "Contractors that price their own tenders and build up rates for materials, labour and plant. The estimating or commercial lead feels the pain.",
  },
  {
    key: "university-qs-departments",
    segment: "University QS departments in Nigeria",
    targetProduct: "quiv",
    locations: ["Nigeria"],
    companyTypes: ["university department of quantity surveying", "polytechnic department of quantity surveying"],
    jobTitles: ["Head of Department", "Dean of Environmental Sciences", "Senior Lecturer", "Lecturer"],
    keywords: ["department of quantity surveying", "faculty of environmental sciences", "BIM", "NIQS accreditation", "QSRBN accreditation"],
    exclusions: ["private tutorial centres", "secondary schools", "departments with no quantity surveying programme"],
    notes: "Departments that teach measurement and would train students on BIM-based takeoff with QUIV. The Head of Department is the door.",
  },
];
