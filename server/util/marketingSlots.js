// Where a piece of marketing can actually appear on the website.
//
// This is the half his design added and ours was missing. A testimonial, a
// freebie or a flyer sitting in a table does nothing on its own — it has to
// land somewhere a visitor looks. Naming the places turns "we have three
// testimonials" into "one of them is on a page that exists and two are not".
//
// `built` IS A FACT ABOUT THIS CODEBASE, NOT AN ASPIRATION
//
// Each flag below was checked against what the client actually renders, not
// against what we would like to be true:
//
//   /testimonials renders three sections — TestInd reads /showcase/industry-
//   leaders, TestComp reads /showcase/companies, TestUser reads
//   /showcase/testimonials. All three are real.
//
//   Home.jsx renders none of them, so there is no customer proof on the home
//   page however many testimonials are filed against it.
//
//   /freebies exists but sits behind ProtectedRoute, so it is a members'
//   page. There is no public downloads page at all.
//
//   Flyers are referenced by no public page. They exist only in the admin.
//
//   Trainings.jsx uses imageUrls, so event artwork does reach a visitor.
//
// When one of these gets built, flip the flag here and every item filed
// against it stops being marked as going nowhere.

export const SLOTS = [
  {
    id: "testimonials-leaders",
    name: "Testimonials · industry leaders",
    takes: "Testimonial",
    built: true,
    where: "The logo strip of firms at the top of the testimonials page.",
  },
  {
    id: "testimonials-companies",
    name: "Testimonials · trained companies",
    takes: "Testimonial",
    built: true,
    where: "The list of companies whose teams we have trained.",
  },
  {
    id: "testimonials-people",
    name: "Testimonials · what people said",
    takes: "Testimonial",
    built: true,
    where: "The quotes, with a name and a role against each.",
  },
  {
    id: "home-proof",
    name: "Home · customer proof",
    takes: "Testimonial",
    built: false,
    where: "A logo strip and a quote below the hero. The home page has no such section.",
  },
  {
    id: "members-freebies",
    name: "Freebies · for signed-in members",
    takes: "Freebie",
    built: true,
    where: "The downloads page an account holder sees.",
  },
  {
    id: "resources-public",
    name: "Resources · public downloads",
    takes: "Freebie",
    built: false,
    where: "A page of templates anyone could download without an account. Not built.",
  },
  {
    id: "home-banner",
    name: "Home · promotion banner",
    takes: "Flyer",
    built: false,
    where: "A band above the footer. No public page renders a flyer.",
  },
  {
    id: "events-art",
    name: "Trainings · event artwork",
    takes: "Flyer",
    built: true,
    where: "The image on a training card and at the top of its page.",
  },
];

export const slotById = new Map(SLOTS.map((s) => [s.id, s]));

/** The slots a given kind may be filed against. */
export const slotsFor = (kind) => SLOTS.filter((s) => s.takes === kind);
