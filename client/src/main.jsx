// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./store.jsx";
import { StepUpProvider } from "./features/security/useStepUp.jsx";
import { ThemeProvider, initThemeBeforeRender } from "./theme.jsx";
import App from "./App.jsx";
import "./index.css";

// Apply the saved theme class BEFORE React mounts so users on dark mode
// don't see a brief flash of light UI on reload.
initThemeBeforeRender();

import AppError from "./pages/AppError.jsx";
import Home from "./pages/Home.jsx";
import Products from "./pages/Products.jsx";
import Quote from "./pages/Quote.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Purchase from "./pages/Purchase.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Profile from "./pages/Profile.jsx";
import Learn from "./pages/Learn.jsx";
import CourseDetail from "./pages/CourseDetail.jsx";
import FreeVideoDetail from "./pages/FreeVideoDetail.jsx";
import Admin from "./pages/Admin.jsx";
import AdminLearn from "./pages/AdminLearn.jsx";
import AdminCourses from "./pages/AdminCourses.jsx";
import AdminProducts from "./pages/AdminProducts.jsx";
import AdminProductEdit from "./pages/AdminProductEdit.jsx";
import AdminCourseGrading from "./pages/AdminCourseGrading.jsx";
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
import AdminProposals from "./pages/AdminProposals.jsx";
import AdminRoles from "./pages/AdminRoles.jsx";
import PublicProposal from "./pages/PublicProposal.jsx";
import Support from "./pages/Support.jsx";
import RevitProjects from "./pages/RevitProjects.jsx";
import ProjectsGeneric from "./pages/ProjectsGeneric.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import PmTracker from "./pages/PmTracker.jsx";
import PortfolioDashboard from "./pages/PortfolioDashboard.jsx";
import JoinProject from "./pages/JoinProject.jsx";
import RateGenLibrary from "./pages/RateGenLibrary.jsx";
import AdminRateGen from "./pages/AdminRateGen.jsx";
import AdminAddRate from "./pages/AdminAddRate.jsx";
import RateGenUpdates from "./pages/RateGenUpdates.jsx";
import ServiceConstants from "./pages/ServiceConstants.jsx";
import AdminRateGenMaster from "./pages/AdminRateGenMaster.jsx";
import Receipt from "./pages/Receipt.jsx";
import UserInvoice from "./pages/UserInvoice.jsx";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";

import TrainingEnrollment from "./pages/TrainingEnrollment.jsx";
import AdminPTrainings from "./pages/AdminPTrainings.jsx";

import Freebies from "./pages/Freebies.jsx";
import AdminFreebies from "./pages/AdminFreebies.jsx";
import AdminUsersLite from "./pages/AdminUsersLite.jsx";

// ✅ Physical trainings pages
import PTrainingDetail from "./pages/PTrainingDetail.jsx";
import PTrainingEnrollment from "./pages/PTrainingEnrollment.jsx";

import TimeManagement from "./pages/TimeManagement.jsx";

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
            <TimeManagement />
          </ProtectedRoute>
        ),
      },

      { path: "products", element: <Products /> },
      { path: "quote", element: <Quote /> },
      { path: "product/:key", element: <ProductDetail /> },

      // Public client-facing proposal view
      { path: "proposal/:token", element: <PublicProposal /> },

      { path: "login", element: <Login /> },
      { path: "signup", element: <Signup /> },

      { path: "learn", element: <Learn /> },
      { path: "learn/course/:sku", element: <CourseDetail /> },
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

      { path: "checkout/thanks", element: <CheckoutThanks /> },

      {
        path: "purchase",
        element: (
          <ProtectedRoute>
            <Purchase />
          </ProtectedRoute>
        ),
      },
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

      // ✅ ADMIN ONLY
      {
        path: "admin",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin />
          </AdminRoute>
        ),
      },
      // Admin Hub sections — each opens as its own page instead of rendering
      // inline at the bottom of /admin. Same <Admin /> component, driven by the
      // `section` prop so all existing data-loading/effects keep working.
      {
        path: "admin/pending",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="pending" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/active",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="active" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/physical-training",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="ptrainings" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/subscriptions",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="subscriptions" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/storage",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="storage" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/installations",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="installations" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/training-locations",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="tlocations" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/classrooms",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="classrooms" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/settings",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin section="settings" />
          </AdminRoute>
        ),
      },
      {
        path: "admin/courses",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminCourses />
          </AdminRoute>
        ),
      },
      {
        path: "admin/products",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminProducts />
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
            <AdminCoupons />
          </AdminRoute>
        ),
      },
      {
        path: "admin/invoices",
        element: (
          <AdminRoute permission="invoices">
            <AdminInvoices />
          </AdminRoute>
        ),
      },
      {
        path: "admin/proposals",
        element: (
          <AdminRoute permission="proposals">
            <AdminProposals />
          </AdminRoute>
        ),
      },
      {
        path: "admin/course-grading",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminCourseGrading />
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
            <AdminLearn />
          </AdminRoute>
        ),
      },
      {
        path: "admin/users-lite",
        element: (
          <AdminRoute permission="users">
            <AdminUsersLite />
          </AdminRoute>
        ),
      },
      {
        path: "admin/showcase",
        element: (
          <AdminRoute permission="showcase">
            <AdminShowcase />
          </AdminRoute>
        ),
      },
      {
        path: "admin/changelogs",
        element: (
          <AdminRoute permission="changelogs">
            <AdminChangelogs />
          </AdminRoute>
        ),
      },
      {
        path: "admin/rategen",
        element: (
          <AdminRoute permission="rategen">
            <AdminRateGen />
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
            <AdminRateGenMaster />
          </AdminRoute>
        ),
      },

      // ✅ Physical trainings admin
      {
        path: "admin/ptrainings",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminPTrainings />
          </AdminRoute>
        ),
      },

      // ✅ Roles & Access Control (UAC) — admin-only
      {
        path: "admin/roles",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminRoles />
          </AdminRoute>
        ),
      },

      // ✅ Mini-admin / staff freebies
      {
        path: "admin/freebies",
        element: (
          <AdminRoute permission="freebies">
            <AdminFreebies />
          </AdminRoute>
        ),
      },

      // ✅ Mini-admin / staff flyer engine (lazy — keeps html2canvas/jspdf/jszip
      // out of the main bundle; only loaded when an admin opens the engine)
      {
        path: "admin/flyers",
        async lazy() {
          const { default: AdminFlyers } = await import("./pages/AdminFlyers.jsx");
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
]);

// Find the AuthProvider wrap below; we add ThemeProvider as an outer
// wrapper so theme is available everywhere including the AuthProvider's
// internal state hooks if they ever want it.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <StepUpProvider>
          <RouterProvider router={router} />
        </StepUpProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
