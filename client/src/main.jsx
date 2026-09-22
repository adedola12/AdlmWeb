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
import Dashboard from "./pages/Dashboard.jsx";
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
import AdminDsCertificates from "./pages/AdminDsCertificates.jsx";
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
import AdminYoutube from "./pages/AdminYoutube.jsx";
import AdminYoutubeStatus from "./pages/AdminYoutubeStatus.jsx";
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
import AdminFollowUps from "./pages/AdminFollowUps.jsx";
import AdminSupportTickets from "./pages/AdminSupportTickets.jsx";
import AdminAuditLog from "./pages/AdminAuditLog.jsx";
import AdminReleases from "./pages/AdminReleases.jsx";
import AdminWork from "./pages/AdminWork.jsx";
import RevitProjects from "./pages/RevitProjects.jsx";
import ProjectsGeneric from "./pages/ProjectsGeneric.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import PmTracker from "./pages/PmTracker.jsx";
import PortfolioDashboard from "./pages/PortfolioDashboard.jsx";
import JoinProject from "./pages/JoinProject.jsx";
import RateGenLibrary from "./pages/RateGenLibrary.jsx";
import AdminRateLibrary from "./pages/AdminRateLibrary.jsx";
import AdminAddRate from "./pages/AdminAddRate.jsx";
// Classic RateGen admin screens, restored until the new build goes live.
import AdminRateGen from "./pages/AdminRateGen.jsx";
import AdminRateGenMaster from "./pages/AdminRateGenMaster.jsx";
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
// Unused until go-live, when /learn/course/:sku points back at it.
const LearnCourseRedirect = React.lazy(() => import("./pages/LearnCourseRedirect.jsx"));
import CourseDetailClassic from "./pages/CourseDetailClassic.jsx";
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
import NetworkCheck from "./pages/NetworkCheck.jsx";
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
import DsPreviewGate from "./ds/DsPreviewGate.jsx";
import NewBuildGate from "./components/NewBuildGate.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import PreviewHostGate from "./components/PreviewHostGate.jsx";
import DsPreviewIndex from "./ds/DsPreviewIndex.jsx";
// Lazy: the fit page and its shell only load for someone who opens /fit.
const DsShellLazy = React.lazy(() => import("./ds/DsShell.jsx"));
const DsFit = React.lazy(() => import("./ds/DsFit.jsx"));
import { DS_PAGES } from "./ds/pages/manifest.js";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <AppError />,
    children: [
      { index: true, element: <Home /> },

      // Classic page, no app frame, until the new build goes fully live. The
      // 15 Sept release put this inside WorkShellRoute (title "Programme",
      // page "work-programme"); go-live puts it back.
      {
        path: "time-management",
        element: (
          <ProtectedRoute>
            <TimeManagement />
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
      // Enter the six-digit code sign-up emailed (pages/VerifyEmail.jsx).
      { path: "verify-email", element: <VerifyEmail /> },
      // A separate door, deliberately. His reasoning, kept: an admin session
      // is not a customer session with a flag on it, so it is not reached by
      // adding ?admin to the customer sign-in.
      { path: "admin/login", element: <AdminLogin /> },
      { path: "signup", element: <Signup /> },

      { path: "learn", element: <Learn /> },
      // The player moved to /dash-course/:sku. This resolves rather than
      // 404s, because the URL is in emails and in people's history.
      // The course page customers have, until the new build goes fully live.
      // Go-live points this back at LearnCourseRedirect (to /dash-course).
      { path: "learn/course/:sku", element: <CourseDetailClassic /> },
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
      // Public on purpose: it exists for the moment the site says "Failed to
      // fetch" and nothing else works, which is also when sign-in cannot help.
      { path: "network-check", element: <NetworkCheck /> },
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
      // The dashboard customers use today. /manage replaces it only when the
      // new build goes fully live; until then this is every signed-in user's
      // home, and receipts, enrolment emails and the nav all point here.
      // The 15 Sept release briefly turned it into a redirect to /manage.
      {
        path: "dashboard",
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
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
          <NewBuildGate>
            <LazyScreen>
              <ManageOverview />
            </LazyScreen>
          </NewBuildGate>
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
        // Admin roles only until go-live; customers go to the classic page
        // (components/NewBuildGate.jsx).
        element: (
          <NewBuildGate>
            <LazyScreen>{el}</LazyScreen>
          </NewBuildGate>
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
      // Classic page, no app frame, until the new build goes fully live. The
      // 15 Sept release put this inside WorkShellRoute (title "Projects",
      // page "work-projects"); go-live puts it back.
      {
        path: "projects/:tool",
        element: (
          <ProtectedRoute>
            <ProjectsGeneric />
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
        // Classic screen until the new build goes live (release: AdminToday).
        path: "admin",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin />
          </AdminRoute>
        ),
      },
      // Admin Hub sections — each opens as its own page instead of rendering
      // inline at the bottom of /admin. Same <Admin /> component, driven by the
      // `section` prop so all existing data-loading/effects keep working.
      {
        // Classic screen until the new build goes live (release: AdminPurchases).
        path: "admin/pending",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="pending" />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminDsEntitlements).
        path: "admin/active",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="active" />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminDsOrganisations).
        path: "admin/organizations",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="organizations" />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminLcEvents).
        path: "admin/physical-training",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="ptrainings" />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminDsSubscriptions).
        path: "admin/subscriptions",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="subscriptions" />
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
        // Classic screen until the new build goes live (release: AdminStorage).
        path: "admin/storage",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="storage" />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminInstallationsQueue).
        path: "admin/installations",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="installations" />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: Admin).
        path: "admin/training-locations",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="tlocations" />
          </AdminRoute>
        ),
      },
      // Every certificate the studio has issued, and the one verb that was
      // missing entirely: withdrawing one.
      {
        path: "admin/certificates",
        element: (
          <AdminRoute permission="adminhub">
            <AdminDsCertificates />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminDocSystem).
        path: "admin/settings",
        element: (
          <AdminRoute shell={false} permission="adminhub">
            <Admin section="settings" />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminLcCourses).
        path: "admin/courses",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminCourses />
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
        // Classic screen until the new build goes live (release: AdminCatProducts).
        path: "admin/products",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminProducts />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminProductEdit).
        path: "admin/products/:id/edit",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminProductEdit />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminDsCoupons).
        path: "admin/coupons",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminCoupons />
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
        // Classic screen until the new build goes live (release: AdminDsInvoices).
        path: "admin/invoices",
        element: (
          <AdminRoute shell={false} permission="invoices">
            <AdminInvoices />
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
        // Classic screen until the new build goes live (release: AdminDsQuotations).
        path: "admin/proposals",
        element: (
          <AdminRoute shell={false} permission="proposals">
            <AdminProposals />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminSubmissions).
        path: "admin/course-grading",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminCourseGrading />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminCourseCockpit).
        path: "admin/course-cockpit",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminCourseCockpit />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminLcQuizzes).
        path: "admin/quizzes",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminQuizzes />
          </AdminRoute>
        ),
      },

      // ✅ STAFF (admin + mini_admin)
      {
        // Classic screen until the new build goes live (release: AdminTrainings).
        path: "admin/trainings",
        element: (
          <AdminRoute shell={false} permission="trainings">
            <AdminTrainings />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminLcLessons).
        path: "admin/learn",
        element: (
          <AdminRoute shell={false} permission="learn">
            <AdminLearn />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminYoutube).
          // The YouTube channel beside the free library: what is filed, held,
          // missing, and whether each video still plays.
          path: "admin/youtube",
          element: (
            <AdminRoute shell={false} permission="learn">
              <AdminYoutubeStatus />
            </AdminRoute>
          ),
        },
      {
        path: "admin/youtube/classic",
        element: (
          <AdminRoute permission="learn">
            <AdminYoutubeStatus />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminPeople).
        path: "admin/users-lite",
        element: (
          <AdminRoute shell={false} permission="users">
            <AdminUsersLite />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminLcShowcase).
        path: "admin/showcase",
        element: (
          <AdminRoute shell={false} permission="showcase">
            <AdminShowcase />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminLcChangelogs).
        path: "admin/changelogs",
        element: (
          <AdminRoute shell={false} permission="changelogs">
            <AdminChangelogs />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminRateLibrary).
        path: "admin/rategen",
        element: (
          <AdminRoute shell={false} permission="rategen">
            <AdminRateGen />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminAddRate).
        path: "admin/rategen/add-rate",
        element: (
          <AdminRoute shell={false} permission="rategen">
            <AdminAddRate />
          </AdminRoute>
        ),
      },
      {
        // Classic screen until the new build goes live (release: AdminCatRates).
        path: "admin/rategen-master",
        element: (
          <AdminRoute shell={false} permission="rategen">
            <AdminRateGenMaster />
          </AdminRoute>
        ),
      },

      // ✅ Physical trainings admin
      {
        // Classic screen until the new build goes live (release: AdminEnrolments).
        path: "admin/ptrainings",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminPTrainings />
          </AdminRoute>
        ),
      },

      // ✅ Roles & Access Control (UAC) — admin-only
      {
        // Classic screen until the new build goes live (release: AdminDsRoles).
        path: "admin/roles",
        element: (
          <AdminRoute shell={false} roles={["admin"]}>
            <AdminRoles />
          </AdminRoute>
        ),
      },

      // ✅ Release sign-off (docs/RELEASE_GATE.md): super-admins + the release approver
      {
        path: "admin/releases",
        element: (
          <AdminRoute shell={false} permission="releases">
            <AdminReleases />
          </AdminRoute>
        ),
      },

      // ✅ Work board (docs/WORK_BOARD.md): same audience as the release desk
      {
        path: "admin/work",
        element: (
          <AdminRoute shell={false} permission="releases">
            <AdminWork />
          </AdminRoute>
        ),
      },

      // ✅ AI spend, per-user allocations & AWS credit burn-down (admin-only)
      {
        // Classic screen until the new build goes live (release: AdminDocAi).
        path: "admin/ai-usage",
        element: (
          <AdminRoute shell={false} permission="aiusage">
            <AdminAiUsage />
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
        // Classic screen until the new build goes live (release: AdminDsSupport).
        path: "admin/support-tickets",
        element: (
          <AdminRoute shell={false} permission="support">
            <AdminSupportTickets />
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
        // Classic screen until the new build goes live (release: AdminFollowUpsDesk).
        path: "admin/follow-ups",
        element: (
          <AdminRoute shell={false} permission="followups">
            <AdminFollowUps />
          </AdminRoute>
        ),
      },

      // ✅ Renewal follow-up calls — staff-grantable ("followups" area)

      // ✅ Audit log & break-glass management — super-admin only ("audit" area)
      {
        // Classic screen until the new build goes live (release: AdminDocAudit).
        path: "admin/audit-log",
        element: (
          <AdminRoute shell={false} permission="audit">
            <AdminAuditLog />
          </AdminRoute>
        ),
      },

      // ✅ Mini-admin / staff freebies
      {
        // Classic screen until the new build goes live (release: AdminLcFreebies).
        path: "admin/freebies",
        element: (
          <AdminRoute shell={false} permission="freebies">
            <AdminFreebies />
          </AdminRoute>
        ),
      },

      // ✅ Mini-admin / staff flyer engine (lazy — keeps html2canvas/jspdf/jszip
      // out of the main bundle; only loaded when an admin opens the engine)
      {
        // Classic screen until the new build goes live (release: AdminFlyers).
        path: "admin/flyers",
        async lazy() {
          const { default: AdminFlyers } = await import("./pages/AdminFlyers.jsx");
          return {
            element: (
              <AdminRoute shell={false} permission="flyers">
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
  // Staff only. The staged redesign is work in progress — placeholder figures,
  // unported behaviour — and a customer who wandered in would be looking at a
  // building site. See DsPreviewGate for what this gate is and is not.
  ...DS_PAGES.map((page) => ({
    path: `/preview/${page.slug}`,
    element: (
      <DsPreviewGate>
        <DsPreview page={page} />
      </DsPreviewGate>
    ),
    errorElement: <AppError />,
  })),

  // "Which one is for me" — four questions, the product, plan and price.
  // Built from his products-page picker and quote-page layout; staff only
  // like the rest of the redesign until it is promoted.
  {
    path: "/fit",
    element: (
      <DsPreviewGate>
        <React.Suspense fallback={null}>
          <DsShellLazy>
            <DsFit />
          </DsShellLazy>
        </React.Suspense>
      </DsPreviewGate>
    ),
    errorElement: <AppError />,
  },

  // An index of everything staged, so the pages can be reviewed without
  // anyone having to remember 25 URLs.
  {
    path: "/preview",
    element: (
      <DsPreviewGate>
        <DsPreviewIndex />
      </DsPreviewGate>
    ),
    errorElement: <AppError />,
  },
]);

// Find the AuthProvider wrap below; we add ThemeProvider as an outer
// wrapper so theme is available everywhere including the AuthProvider's
// internal state hooks if they ever want it.
const tree = (
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <StepUpProvider>
          {/* preview.adlmstudio.com and other non-live hosts: admin roles only. */}
          <PreviewHostGate router={router}>
            <RouterProvider router={router} />
          </PreviewHostGate>
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
