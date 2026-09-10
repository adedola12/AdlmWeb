// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { AuthProvider } from "./store.jsx";
import { StepUpProvider } from "./features/security/useStepUp.jsx";
import { ThemeProvider, initThemeBeforeRender } from "./theme.jsx";
import App from "./App.jsx";
import "./index.css";
// Richard's design system, ported and namespaced under `.ds`. Loading it here
// is inert until a page opts in by wrapping its content in <div className="ds">
// — see client/scripts/port-ds-css.mjs for why it is scoped that way.
import "./styles/ds.css";
import "./styles/ds-local.css";

// Apply the saved theme class BEFORE React mounts so users on dark mode
// don't see a brief flash of light UI on reload.
initThemeBeforeRender();

import AppError from "./pages/AppError.jsx";
import Home from "./pages/Home.jsx";
import Products from "./pages/Products.jsx";
import Quote from "./pages/Quote.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Login from "./pages/Login.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminToday from "./pages/AdminToday.jsx";
import AdminPurchases from "./pages/AdminPurchases.jsx";
import AdminInstallationsQueue from "./pages/AdminInstallationsQueue.jsx";
import AdminPeople from "./pages/AdminPeople.jsx";
import AdminEnrolments from "./pages/AdminEnrolments.jsx";
import AdminSubmissions from "./pages/AdminSubmissions.jsx";
import AdminFollowUpsDesk from "./pages/AdminFollowUpsDesk.jsx";
import AdminDsOrganisations from "./pages/AdminDsOrganisations.jsx";
import AdminDsRoles from "./pages/AdminDsRoles.jsx";
import AdminDsSupport from "./pages/AdminDsSupport.jsx";
import AdminDsSubscriptions from "./pages/AdminDsSubscriptions.jsx";
import AdminDsEntitlements from "./pages/AdminDsEntitlements.jsx";
import AdminDsQuotations from "./pages/AdminDsQuotations.jsx";
import AdminDsInvoices from "./pages/AdminDsInvoices.jsx";
import AdminDsCoupons from "./pages/AdminDsCoupons.jsx";
import AdminCatProducts from "./pages/AdminCatProducts.jsx";
import AdminCatPricing from "./pages/AdminCatPricing.jsx";
import AdminCatRates from "./pages/AdminCatRates.jsx";
import AdminCatSaved from "./pages/AdminCatSaved.jsx";
import AdminRateBuilder from "./pages/AdminRateBuilder.jsx";
import AdminDocAi from "./pages/AdminDocAi.jsx";
import AdminTimeSaved from "./pages/AdminTimeSaved.jsx";
import AdminDocAudit from "./pages/AdminDocAudit.jsx";
import AdminDocTemplates from "./pages/AdminDocTemplates.jsx";
import AdminDocSaved from "./pages/AdminDocSaved.jsx";
import AdminDocIssued from "./pages/AdminDocIssued.jsx";
import AdminDocProduced from "./pages/AdminDocProduced.jsx";
import AdminDocSystem from "./pages/AdminDocSystem.jsx";
import AdminStorage from "./pages/AdminStorage.jsx";
import AdminEmails from "./pages/AdminEmails.jsx";
import AdminCampaigns from "./pages/AdminCampaigns.jsx";
import AdminVideos from "./pages/AdminVideos.jsx";
import AdminBillboard from "./pages/AdminBillboard.jsx";
import AdminDsWaitlist from "./pages/AdminDsWaitlist.jsx";
import AdminDsOrgVideos from "./pages/AdminDsOrgVideos.jsx";
import AdminLcCourses from "./pages/AdminLcCourses.jsx";
import AdminLcQuizzes from "./pages/AdminLcQuizzes.jsx";
import AdminLcLessons from "./pages/AdminLcLessons.jsx";
import AdminLcEvents from "./pages/AdminLcEvents.jsx";
import AdminLcClassrooms from "./pages/AdminLcClassrooms.jsx";
import AdminLcChangelogs from "./pages/AdminLcChangelogs.jsx";
import AdminLcShowcase from "./pages/AdminLcShowcase.jsx";
import AdminLcFreebies from "./pages/AdminLcFreebies.jsx";
import Signup from "./pages/Signup.jsx";
import Purchase from "./pages/Purchase.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Profile from "./pages/Profile.jsx";
import Learn from "./pages/Learn.jsx";
import FreeVideoDetail from "./pages/FreeVideoDetail.jsx";
import Admin from "./pages/Admin.jsx";
import AdminLearn from "./pages/AdminLearn.jsx";
import AdminCourses from "./pages/AdminCourses.jsx";
import AdminProducts from "./pages/AdminProducts.jsx";
import AdminProductEdit from "./pages/AdminProductEdit.jsx";
import AdminCourseGrading from "./pages/AdminCourseGrading.jsx";
import AdminCourseCockpit from "./pages/AdminCourseCockpit.jsx";
import AdminQuizzes from "./pages/AdminQuizzes.jsx";
import CheckoutThanks from "./pages/CheckoutThanks.jsx";
import AboutADLM from "./pages/About.jsx";
import WhatsNew from "./pages/WhatsNew.jsx";
import WhatsNewProduct from "./pages/WhatsNewProduct.jsx";
import Trainings from "./pages/Trainings.jsx";
import AdminTrainings from "./pages/AdminTrainings.jsx";
import NotFound from "./pages/NotFound.jsx";
import Testimonials from "./pages/Testimonials.jsx";
import AdminShowcase from "./pages/AdminShowcase.jsx";
import AdminChangelogs from "./pages/AdminChangelogs.jsx";
import TrainingDetail from "./pages/TrainingDetail.jsx";
import AdminCoupons from "./pages/AdminCoupons.jsx";
import AdminInvoices from "./pages/AdminInvoices.jsx";
// Lazy: it pulls in the document engine and two stylesheets that no other
// admin screen needs.
const AdminDocuments = React.lazy(() => import("./pages/AdminDocuments.jsx"));
import AdminProposals from "./pages/AdminProposals.jsx";
import AdminRoles from "./pages/AdminRoles.jsx";
import PublicProposal from "./pages/PublicProposal.jsx";
import Support from "./pages/Support.jsx";
import RequestTechnicalHelp from "./pages/RequestTechnicalHelp.jsx";
import AdminWaitlist from "./pages/AdminWaitlist.jsx";
import AdminSupportTickets from "./pages/AdminSupportTickets.jsx";
import AdminAuditLog from "./pages/AdminAuditLog.jsx";
import RevitProjects from "./pages/RevitProjects.jsx";
import ProjectsGeneric from "./pages/ProjectsGeneric.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import PmTracker from "./pages/PmTracker.jsx";
import PortfolioDashboard from "./pages/PortfolioDashboard.jsx";
import JoinProject from "./pages/JoinProject.jsx";
import RateGenLibrary from "./pages/RateGenLibrary.jsx";
import AdminRateLibrary from "./pages/AdminRateLibrary.jsx";
import AdminAddRate from "./pages/AdminAddRate.jsx";
import RateGenUpdates from "./pages/RateGenUpdates.jsx";
import ServiceConstants from "./pages/ServiceConstants.jsx";
import MaterialConstants from "./pages/MaterialConstants.jsx";
import Receipt from "./pages/Receipt.jsx";
import OrderDetail from "./pages/OrderDetail.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
// His Manage overview. Lazy because it pulls in the app shell and ~91KB of his
// dashboard CSS, which no marketing visitor should pay for.
const ManageOverview = React.lazy(() => import("./pages/ManageOverview.jsx"));
const ManageProducts = React.lazy(() => import("./pages/ManageProducts.jsx"));
const ManageTeam = React.lazy(() => import("./pages/ManageTeam.jsx"));
const ManageBilling = React.lazy(() => import("./pages/ManageBilling.jsx"));
const ManageDownloads = React.lazy(() => import("./pages/ManageDownloads.jsx"));
const ManageSettings = React.lazy(() => import("./pages/ManageSettings.jsx"));
const WorkHome = React.lazy(() => import("./pages/WorkHome.jsx"));
const WorkProjects = React.lazy(() => import("./pages/WorkProjects.jsx"));
const ManageSupport = React.lazy(() => import("./pages/ManageSupport.jsx"));
const WorkLibrary = React.lazy(() => import("./pages/WorkLibrary.jsx"));
const WorkRate = React.lazy(() => import("./pages/WorkRate.jsx"));
const WorkProject = React.lazy(() => import("./pages/WorkProject.jsx"));
const WorkProgramme = React.lazy(() => import("./pages/WorkProgramme.jsx"));
const Learning = React.lazy(() => import("./pages/Learning.jsx"));
const Certificates = React.lazy(() => import("./pages/Certificates.jsx"));
const LearningCourse = React.lazy(() => import("./pages/LearningCourse.jsx"));
const LearnCourseRedirect = React.lazy(() => import("./pages/LearnCourseRedirect.jsx"));
const WorkShellRoute = React.lazy(() => import("./pages/WorkShellRoute.jsx"));
import UserInvoice from "./pages/UserInvoice.jsx";

// ✅ QUIV for ArchiCAD
import ArchiCADLanding from "./pages/ArchiCADLanding.jsx";
import ArchiCADBoQ from "./pages/ArchiCADBoQ.jsx";
import ArchiCADDashboard from "./pages/ArchiCADDashboard.jsx";
import ArchiCADElement from "./pages/ArchiCADElement.jsx";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import LazyScreen from "./components/LazyScreen.jsx";

import TrainingEnrollment from "./pages/TrainingEnrollment.jsx";
import AdminPTrainings from "./pages/AdminPTrainings.jsx";

import Freebies from "./pages/Freebies.jsx";
import AdminFreebies from "./pages/AdminFreebies.jsx";
import AdminUsersLite from "./pages/AdminUsersLite.jsx";
import AdminAiUsage from "./pages/AdminAiUsage.jsx";

// ✅ Physical trainings pages
import PTrainingDetail from "./pages/PTrainingDetail.jsx";
import PTrainingEnrollment from "./pages/PTrainingEnrollment.jsx";

import TimeManagement from "./pages/TimeManagement.jsx";

// Search landing pages. Shared with the server route tree in
// routes.marketing.jsx so both render the same components for these paths,
// which is what lets React hydrate the server's HTML instead of replacing it.
import { landingRoutes } from "./pages/landing/routes.jsx";

// Design-system preview (see the /preview routes at the end of the router).
// Lazy so the staged redesign costs nothing to visitors on the real pages.
// The manifest is generated by scripts/port-ds-html.mjs, so porting another
// page never means editing this file.
import DsPreview from "./ds/DsPreview.jsx";
import DsPreviewIndex from "./ds/DsPreviewIndex.jsx";
import { DS_PAGES } from "./ds/pages/manifest.js";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <AppError />,
    children: [
      { index: true, element: <Home /> },

      {
        path: "time-management",
        element: (
          <ProtectedRoute>
            <LazyScreen>
              <WorkShellRoute
                screen={TimeManagement}
                title="Programme"
                page="work-programme"
              />
            </LazyScreen>
          </ProtectedRoute>
        ),
      },

      { path: "products", element: <Products /> },
      { path: "quote", element: <Quote /> },
      { path: "product/:key", element: <ProductDetail /> },

      ...landingRoutes,

      // Public client-facing proposal view
      { path: "proposal/:token", element: <PublicProposal /> },

      { path: "login", element: <Login /> },
      // A separate door, deliberately. His reasoning, kept: an admin session
      // is not a customer session with a flag on it, so it is not reached by
      // adding ?admin to the customer sign-in.
      { path: "admin/login", element: <AdminLogin /> },
      { path: "signup", element: <Signup /> },

      { path: "learn", element: <Learn /> },
      // The player moved to /dash-course/:sku. This resolves rather than
      // 404s, because the URL is in emails and in people's history.
      { path: "learn/course/:sku", element: <LearnCourseRedirect /> },
      { path: "learn/free/:id", element: <FreeVideoDetail /> },

      { path: "about", element: <AboutADLM /> },

      // Public product changelogs / "What's New".
      // Hub lists every product; each links to its own detail page.
      // Content lives in src/data/changelogs/*.md (one file per product).
      { path: "whats-new", element: <WhatsNew /> },
      { path: "whats-new/:slug", element: <WhatsNewProduct /> },

      // Online trainings
      { path: "trainings", element: <Trainings /> },
      { path: "trainings/:id", element: <TrainingDetail /> },
      {
        path: "trainings/enrollment/:enrollmentId",
        element: (
          <ProtectedRoute>
            <TrainingEnrollment />
          </ProtectedRoute>
        ),
      },

      // ✅ Physical trainings (Public detail by slug OR id + Protected portal)
      { path: "ptrainings/:key", element: <PTrainingDetail /> },
      {
        path: "ptrainings/enrollment/:enrollmentId",
        element: (
          <ProtectedRoute>
            <PTrainingEnrollment />
          </ProtectedRoute>
        ),
      },

      { path: "testimonials", element: <Testimonials /> },
      { path: "support", element: <Support /> },
      {
        path: "support/request",
        element: (
          <ProtectedRoute>
            <RequestTechnicalHelp />
          </ProtectedRoute>
        ),
      },

      { path: "checkout/thanks", element: <CheckoutThanks /> },

      {
        path: "purchase",
        element: (
          <ProtectedRoute>
            <Purchase />
          </ProtectedRoute>
        ),
      },
      // Retired. /manage is the account overview now — his screen, on real
      // data — and two dashboards competing for the same job is how one of
      // them quietly goes stale.
      //
      // A redirect rather than a deletion, and permanently so: this path is in
      // receipts, in enrolment emails and in people's history, and the same
      // reasoning already keeps /learn/course/:sku alive a few lines below.
      { path: "dashboard", element: <Navigate to="/manage" replace /> },
      {
        path: "freebies",
        element: (
          <ProtectedRoute>
            <Freebies />
          </ProtectedRoute>
        ),
      },
      {
        // His Manage overview — what /dashboard becomes when the makeover
        // lands. Added alongside rather than over it: /dashboard keeps working
        // and keeps its data until this one is proven on real accounts.
        path: "manage",
        element: (
          <ProtectedRoute>
            <LazyScreen>
              <ManageOverview />
            </LazyScreen>
          </ProtectedRoute>
        ),
      },
      // The rest of the Manage section. Every one of these is already a
      // destination in the rail, so a missing route here is a dead link on
      // every app screen rather than a page nobody reaches.
      ...[
        { path: "manage/products", el: <ManageProducts /> },
        { path: "manage/team", el: <ManageTeam /> },
        { path: "manage/billing", el: <ManageBilling /> },
        { path: "manage/downloads", el: <ManageDownloads /> },
        { path: "manage/settings", el: <ManageSettings /> },
        // The Work group. Organised by project rather than by product, which
        // is the whole architectural point of the surface.
        { path: "work", el: <WorkHome /> },
        { path: "work/projects", el: <WorkProjects /> },
        { path: "manage/support", el: <ManageSupport /> },
        { path: "work/library", el: <WorkLibrary /> },
        { path: "work/rate/:id", el: <WorkRate /> },
        { path: "work/project/:productKey/:id", el: <WorkProject /> },
        { path: "work/programme", el: <WorkProgramme /> },
        { path: "dash-learning", el: <Learning /> },
        { path: "dash-certificates", el: <Certificates /> },
        { path: "dash-course/:sku", el: <LearningCourse /> },
      ].map(({ path, el }) => ({
        path,
        element: (
          <ProtectedRoute>
            <LazyScreen>{el}</LazyScreen>
          </ProtectedRoute>
        ),
      })),
      {
        // Where Google, Microsoft and Autodesk send the browser back to. Public
        // on purpose: the person is by definition not signed in yet when they
        // arrive here from a sign-in, and what makes it safe is the PKCE state
        // held in the tab, not a session.
        path: "auth/callback",
        element: <AuthCallback />,
      },
      {
        // An order before it is paid: what was bought, what it costs, where to
        // pay it and where the receipt goes. The proforma invoice links here —
        // /receipt/:id refuses until the order is approved, which a proforma
        // by definition is not.
        path: "order/:id",
        element: (
          <ProtectedRoute>
            <OrderDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: "receipt/:orderId",
        element: (
          <ProtectedRoute>
            <Receipt />
          </ProtectedRoute>
        ),
      },
      {
        path: "invoice/:id",
        element: (
          <ProtectedRoute>
            <UserInvoice />
          </ProtectedRoute>
        ),
      },
      {
        path: "profile",
        element: (
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        ),
      },
      {
        path: "change-password",
        element: (
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        ),
      },

      {
        path: "revit-projects",
        element: (
          <ProtectedRoute>
            <RevitProjects />
          </ProtectedRoute>
        ),
      },
      {
        path: "portfolio",
        element: (
          <ProtectedRoute>
            <Portfolio />
          </ProtectedRoute>
        ),
      },
      {
        path: "pm-tracker",
        element: (
          <ProtectedRoute>
            <PmTracker />
          </ProtectedRoute>
        ),
      },
      {
        path: "portfolio-dashboard",
        element: (
          <ProtectedRoute>
            <PortfolioDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "projects/shared/:token",
        async lazy() {
          const { default: PublicProjectDashboard } = await import("./pages/PublicProjectDashboard.jsx");
          return { element: <PublicProjectDashboard /> };
        },
      },

      // ✅ Public model check report (no auth — accessed via QR code scan)
      {
        path: "model-check/:id",
        async lazy() {
          const { default: ModelCheckReport } = await import("./pages/ModelCheckReport.jsx");
          return { element: <ModelCheckReport /> };
        },
      },
      {
        path: "projects/:tool",
        element: (
          <ProtectedRoute>
            <LazyScreen>
              <WorkShellRoute
                screen={ProjectsGeneric}
                title="Projects"
                page="work-projects"
              />
            </LazyScreen>
          </ProtectedRoute>
        ),
      },

      // Short share link / QR target — redeems a collaborator code then
      // forwards into the project.
      {
        path: "j/:code",
        element: (
          <ProtectedRoute>
            <JoinProject />
          </ProtectedRoute>
        ),
      },

      // ✅ QUIV for ArchiCAD
      {
        path: "archicad",
        element: (
          <ProtectedRoute>
            <ArchiCADLanding />
          </ProtectedRoute>
        ),
      },
      {
        path: "archicad/:projectId/boq",
        element: (
          <ProtectedRoute>
            <ArchiCADBoQ />
          </ProtectedRoute>
        ),
      },
      {
        path: "archicad/:projectId/dashboard",
        element: (
          <ProtectedRoute>
            <ArchiCADDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "archicad/:projectId/element/:guid",
        element: (
          <ProtectedRoute>
            <ArchiCADElement />
          </ProtectedRoute>
        ),
      },

      {
        path: "rategen",
        element: (
          <ProtectedRoute>
            <RateGenLibrary />
          </ProtectedRoute>
        ),
      },
      {
        path: "rategen/updates",
        element: (
          <ProtectedRoute>
            <RateGenUpdates />
          </ProtectedRoute>
        ),
      },
      {
        path: "rategen/services-constants",
        element: (
          <ProtectedRoute>
            <ServiceConstants />
          </ProtectedRoute>
        ),
      },
      {
        path: "rategen/material-constants",
        element: (
          <ProtectedRoute>
            <MaterialConstants />
          </ProtectedRoute>
        ),
      },

      // ✅ ADMIN ONLY
      // /admin is Today — his dashboard, the first admin screen ported. The
      // hub's queues keep their own routes below and the rail links to them;
      // what this replaces is the hub's front page, which was a tab strip over
      // the same lists rather than a view of what needs doing.
      {
        path: "admin",
        element: (
          <AdminRoute permission="adminhub">
            <AdminToday />
          </AdminRoute>
        ),
      },
      // Admin Hub sections — each opens as its own page instead of rendering
      // inline at the bottom of /admin. Same <Admin /> component, driven by the
      // `section` prop so all existing data-loading/effects keep working.
      {
        // His Purchases queue. The path stays /admin/pending because that is
        // what the old hub used and what people have bookmarked; the rail
        // calls it Purchases, as he does.
        path: "admin/pending",
        element: (
          <AdminRoute permission="adminhub">
            <AdminPurchases />
          </AdminRoute>
        ),
      },
      {
        path: "admin/active",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDsEntitlements />
          </AdminRoute>
        ),
      },
      {
        path: "admin/organizations",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDsOrganisations />
          </AdminRoute>
        ),
      },
      {
        path: "admin/physical-training",
        element: (
          <AdminRoute permission="adminhub">
            <AdminLcEvents />
          </AdminRoute>
        ),
      },
      {
        path: "admin/subscriptions",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDsSubscriptions />
          </AdminRoute>
        ),
      },
      {
        // His Content group has Emails; ours had no screen for what the studio
        // sends at all.
        path: "admin/emails",
        element: (
          <AdminRoute permission="adminhub">
            <AdminEmails />
          </AdminRoute>
        ),
      },
      {
        path: "admin/campaigns",
        element: (
          <AdminRoute permission="adminhub">
            <AdminCampaigns />
          </AdminRoute>
        ),
      },
      {
        path: "admin/videos",
        element: (
          <AdminRoute permission="adminhub">
            <AdminVideos />
          </AdminRoute>
        ),
      },
      {
        path: "admin/billboard",
        element: (
          <AdminRoute permission="adminhub">
            <AdminBillboard />
          </AdminRoute>
        ),
      },
      {
        path: "admin/storage",
        element: (
          <AdminRoute permission="adminhub">
            <AdminStorage />
          </AdminRoute>
        ),
      },
      {
        path: "admin/installations",
        element: (
          <AdminRoute permission="adminhub">
            <AdminInstallationsQueue />
          </AdminRoute>
        ),
      },
      {
        path: "admin/training-locations",
        element: (
          <AdminRoute permission="adminhub">
            <Admin section="tlocations" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/classrooms",
        element: (
          <AdminRoute permission="adminhub">
            <AdminLcClassrooms />
          </AdminRoute>
        ),
      },
      {
        path: "admin/settings",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDocSystem />
          </AdminRoute>
        ),
      },
      {
        path: "admin/courses",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminLcCourses />
          </AdminRoute>
        ),
      },
      {
        // Build a rate — the only place on the website a rate is created.
        // Editing an existing one happens in Rate Gen.
        path: "admin/rategen/build",
        element: (
          <AdminRoute permission="rategen">
            <AdminRateBuilder />
          </AdminRoute>
        ),
      },
      {
        // Saved rates — what people built themselves in RateGen. Never had a
        // screen; the data lives on each user own library, not in RateGenRate.
        path: "admin/saved-rates",
        element: (
          <AdminRoute permission="rategen">
            <AdminCatSaved />
          </AdminRoute>
        ),
      },
      {
        // His Price book. A new route: pricing has never had a screen, and the
        // effective price is not readable from the product record by eye.
        path: "admin/pricing",
        element: (
          <AdminRoute permission="adminhub">
            <AdminCatPricing />
          </AdminRoute>
        ),
      },
      {
        path: "admin/products",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminCatProducts />
          </AdminRoute>
        ),
      },
      {
        path: "admin/products/:id/edit",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminProductEdit />
          </AdminRoute>
        ),
      },
      {
        path: "admin/coupons",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminDsCoupons />
          </AdminRoute>
        ),
      },
      {
        // The invoice composer that already works — create, edit, send. The
        // ported register replaced /admin/invoices as the reading surface;
        // rebuilding a working composer to match it would be a week spent to
        // end up where we started, so it keeps a route and the register links
        // to it.
        path: "admin/invoices/compose",
        element: (
          <AdminRoute permission="invoices">
            <AdminInvoices />
          </AdminRoute>
        ),
      },
      {
        path: "admin/invoices",
        element: (
          <AdminRoute permission="invoices">
            <AdminDsInvoices />
          </AdminRoute>
        ),
      },
      {
        // The ADLM half of the document engine: written documents on the
        // letterhead. The product half is generated out of a project.
        // The register. The composer it replaces keeps its own route below —
        // it works, and a register that grew a document editor would be a
        // second place for the same thing to be got wrong.
        path: "admin/documents",
        element: (
          <AdminRoute permission="invoices">
            <AdminDocProduced />
          </AdminRoute>
        ),
      },
      {
        path: "admin/documents/compose",
        element: (
          <AdminRoute permission="invoices">
            <LazyScreen>
              <AdminDocuments />
            </LazyScreen>
          </AdminRoute>
        ),
      },
      {
        path: "admin/documents/templates",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDocTemplates />
          </AdminRoute>
        ),
      },
      {
        path: "admin/documents/saved",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDocSaved />
          </AdminRoute>
        ),
      },
      {
        path: "admin/documents/issued",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDocIssued />
          </AdminRoute>
        ),
      },
      {
        path: "admin/proposals",
        element: (
          <AdminRoute permission="proposals">
            <AdminDsQuotations />
          </AdminRoute>
        ),
      },
      {
        path: "admin/course-grading",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminSubmissions />
          </AdminRoute>
        ),
      },
      {
        path: "admin/course-cockpit",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminCourseCockpit />
          </AdminRoute>
        ),
      },
      {
        path: "admin/quizzes",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminLcQuizzes />
          </AdminRoute>
        ),
      },

      // ✅ STAFF (admin + mini_admin)
      {
        path: "admin/trainings",
        element: (
          <AdminRoute permission="trainings">
            <AdminTrainings />
          </AdminRoute>
        ),
      },
      {
        path: "admin/learn",
        element: (
          <AdminRoute permission="learn">
            <AdminLcLessons />
          </AdminRoute>
        ),
      },
      {
        // His People register. The path stays /admin/users-lite because that
        // is what the rail and people's bookmarks already point at.
        path: "admin/users-lite",
        element: (
          <AdminRoute permission="users">
            <AdminPeople />
          </AdminRoute>
        ),
      },
      {
        path: "admin/showcase",
        element: (
          <AdminRoute permission="showcase">
            <AdminLcShowcase />
          </AdminRoute>
        ),
      },
      {
        path: "admin/changelogs",
        element: (
          <AdminRoute permission="changelogs">
            <AdminLcChangelogs />
          </AdminRoute>
        ),
      },
      {
        path: "admin/rategen",
        element: (
          <AdminRoute permission="rategen">
            <AdminRateLibrary />
          </AdminRoute>
        ),
      },
      {
        path: "admin/rategen/add-rate",
        element: (
          <AdminRoute permission="rategen">
            <AdminAddRate />
          </AdminRoute>
        ),
      },
      {
        path: "admin/rategen-master",
        element: (
          <AdminRoute permission="rategen">
            <AdminCatRates />
          </AdminRoute>
        ),
      },

      // ✅ Physical trainings admin
      {
        path: "admin/ptrainings",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminEnrolments />
          </AdminRoute>
        ),
      },

      // ✅ Roles & Access Control (UAC) — admin-only
      {
        path: "admin/roles",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminDsRoles />
          </AdminRoute>
        ),
      },

      // ✅ AI spend, per-user allocations & AWS credit burn-down (admin-only)
      {
        path: "admin/ai-usage",
        element: (
          <AdminRoute permission="aiusage">
            <AdminDocAi />
          </AdminRoute>
        ),
      },

      // ✅ Takeoff Time Log: hours saved by HERON/QUIV against a stated baseline
      {
        path: "admin/time-saved",
        element: (
          <AdminRoute permission="adminhub">
            <AdminTimeSaved />
          </AdminRoute>
        ),
      },

      // ✅ Support tickets — staff-grantable ("support" area)
      {
        path: "admin/support-tickets",
        element: (
          <AdminRoute permission="support">
            <AdminDsSupport />
          </AdminRoute>
        ),
      },


      // ✅ Waitlist & enquiries — staff-grantable ("waitlist" area)
      {
        path: "admin/waitlist",
        element: (
          <AdminRoute permission="waitlist">
            <AdminDsWaitlist />
          </AdminRoute>
        ),
      },

      // ✅ Organisation videos — staff-grantable ("orgvideos" area)
      {
        path: "admin/org-videos",
        element: (
          <AdminRoute permission="orgvideos">
            <AdminDsOrgVideos />
          </AdminRoute>
        ),
      },

      // ✅ Renewal follow-up calls — staff-grantable ("followups" area)
      {
        path: "admin/follow-ups",
        element: (
          <AdminRoute permission="followups">
            <AdminFollowUpsDesk />
          </AdminRoute>
        ),
      },

      // ✅ Audit log & break-glass management — super-admin only ("audit" area)
      {
        path: "admin/audit-log",
        element: (
          <AdminRoute permission="audit">
            <AdminDocAudit />
          </AdminRoute>
        ),
      },

      // ✅ Mini-admin / staff freebies
      {
        path: "admin/freebies",
        element: (
          <AdminRoute permission="freebies">
            <AdminLcFreebies />
          </AdminRoute>
        ),
      },

      // ✅ Mini-admin / staff flyer engine (lazy — keeps html2canvas/jspdf/jszip
      // out of the main bundle; only loaded when an admin opens the engine)
      {
        path: "admin/flyers",
        async lazy() {
          const { default: AdminFlyers } = await import("./pages/AdminLcFlyers.jsx");
          return {
            element: (
              <AdminRoute permission="flyers">
                <AdminFlyers />
              </AdminRoute>
            ),
          };
        },
      },

      { path: "*", element: <NotFound /> },
    ],
  },

  // ── design-system preview ───────────────────────────────────────────────
  // Richard's redesign rendered in its own chrome, so it can be compared
  // against the live pages without replacing them. Deliberately OUTSIDE the
  // <App /> layout: DsShell brings its own nav and footer, and wrapping it in
  // ours would stack two navigations. Disallowed in robots.txt and absent from
  // the sitemap. These routes go away once the pages are promoted.
  ...DS_PAGES.map((page) => ({
    path: `/preview/${page.slug}`,
    element: <DsPreview page={page} />,
    errorElement: <AppError />,
  })),

  // An index of everything staged, so the pages can be reviewed without
  // anyone having to remember 25 URLs.
  { path: "/preview", element: <DsPreviewIndex />, errorElement: <AppError /> },
]);

// Find the AuthProvider wrap below; we add ThemeProvider as an outer
// wrapper so theme is available everywhere including the AuthProvider's
// internal state hooks if they ever want it.
const tree = (
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <StepUpProvider>
          <RouterProvider router={router} />
        </StepUpProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

const container = document.getElementById("root");

// Marketing routes arrive with their HTML already rendered (see
// src/entry-server.jsx). Hydrating attaches to that markup instead of
// discarding it — calling createRoot on server HTML would wipe the very
// content we sent the crawler and cause a visible repaint for everyone else.
//
// The flag is set by the server; every other route still mounts from empty, so
// the app-side routes behave exactly as they did before.
if (window.__ADLM_SSR__ === true && container.hasChildNodes()) {
  ReactDOM.hydrateRoot(container, tree);
} else {
  ReactDOM.createRoot(container).render(tree);
}
