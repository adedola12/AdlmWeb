// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./store.jsx";
import App from "./App.jsx";
import "./index.css";

import AppError from "./pages/AppError.jsx";
import Home from "./pages/Home.jsx";
import Products from "./pages/Products.jsx";
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
import AdminProducts from "./pages/AdminProducts.jsx";
import AdminProductEdit from "./pages/AdminProductEdit.jsx";
import AdminCourses from "./pages/AdminCourses.jsx";
import AdminCourseGrading from "./pages/AdminCourseGrading.jsx";
import CheckoutThanks from "./pages/CheckoutThanks.jsx";
import AboutADLM from "./pages/About.jsx";
import Trainings from "./pages/Trainings.jsx";
import AdminTrainings from "./pages/AdminTrainings.jsx";
import NotFound from "./pages/NotFound.jsx";
import Testimonials from "./pages/Testimonials.jsx";
import AdminShowcase from "./pages/AdminShowcase.jsx";
import TrainingDetail from "./pages/TrainingDetail.jsx";
import AdminCoupons from "./pages/AdminCoupons.jsx";
import Support from "./pages/Support.jsx";
import RevitProjects from "./pages/RevitProjects.jsx";
import ProjectsGeneric from "./pages/ProjectsGeneric.jsx";
import RateGenLibrary from "./pages/RateGenLibrary.jsx";
import AdminRateGen from "./pages/AdminRateGen.jsx";
import AdminAddRate from "./pages/AdminAddRate.jsx";
import RateGenUpdates from "./pages/RateGenUpdates.jsx";
import AdminRateGenMaster from "./pages/AdminRateGenMaster.jsx";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";

import Freebies from "./pages/Freebies.jsx";
import AdminFreebies from "./pages/AdminFreebies.jsx";


const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <AppError />,
    children: [
      { index: true, element: <Home /> },
      { path: "products", element: <Products /> },
      { path: "product/:key", element: <ProductDetail /> },
      { path: "login", element: <Login /> },
      { path: "signup", element: <Signup /> },

      { path: "learn", element: <Learn /> },
      { path: "learn/course/:sku", element: <CourseDetail /> },
      { path: "learn/free/:id", element: <FreeVideoDetail /> },

      { path: "about", element: <AboutADLM /> },
      { path: "trainings", element: <Trainings /> },
      { path: "trainings/:id", element: <TrainingDetail /> },
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
        path: "admin/freebies",
        element: (
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminFreebies />
          </AdminRoute>
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
        path: "projects/:tool",
        element: (
          <ProtectedRoute>
            <ProjectsGeneric />
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

      // ✅ ADMIN ONLY
      {
        path: "admin",
        element: (
          <AdminRoute roles={["admin"]}>
            <Admin />
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
        path: "admin/coupons",
        element: (
          <AdminRoute roles={["admin"]}>
            <AdminCoupons />
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
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminTrainings />
          </AdminRoute>
        ),
      },
      {
        path: "admin/learn",
        element: (
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminLearn />
          </AdminRoute>
        ),
      },
      {
        path: "admin/showcase",
        element: (
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminShowcase />
          </AdminRoute>
        ),
      },
      {
        path: "admin/rategen",
        element: (
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminRateGen />
          </AdminRoute>
        ),
      },
      {
        path: "admin/rategen/add-rate",
        element: (
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminAddRate />
          </AdminRoute>
        ),
      },
      {
        path: "admin/rategen-master",
        element: (
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminRateGenMaster />
          </AdminRoute>
        ),
      },
      {
        path: "admin/courses",
        element: (
          <AdminRoute roles={["admin", "mini_admin"]}>
            <AdminCourses />
          </AdminRoute>
        ),
      },

      { path: "*", element: <NotFound /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
