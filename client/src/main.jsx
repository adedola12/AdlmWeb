// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./store.jsx"; // <<< important
import App from "./App.jsx";
import "./index.css";
import Home from "./pages/Home.jsx";
import Products from "./pages/Products.jsx";
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
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import AdminProducts from "./pages/AdminProducts.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import RevitProjects from "./pages/RevitProjects.jsx";
import ProjectsGeneric from "./pages/ProjectsGeneric.jsx";
import RateGenLibrary from "./pages/RateGenLibrary.jsx";
import AdminRateGen from "./pages/AdminRateGen.jsx";
import AdminProductEdit from "./pages/AdminProductEdit.jsx";
import AdminCourses from "./pages/AdminCourses.jsx";
import AdminCourseGrading from "./pages/AdminCourseGrading.jsx";
import CheckoutThanks from "./pages/CheckoutThanks.jsx";
import AboutADLM from "./pages/About.jsx";
import Trainings from "./pages/Trainings.jsx";
import AdminTrainings from "./pages/AdminTrainings.jsx";
import NotFound from "./pages/NotFound.jsx";
import Testimonials from "./pages/Testimonials.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "products", element: <Products /> },
      { path: "product/:key", element: <ProductDetail /> }, // NEW
      { path: "login", element: <Login /> },
      { path: "signup", element: <Signup /> },
      { path: "learn", element: <Learn /> },
      { path: "about", element: <AboutADLM /> },
      { path: "training", element: <Trainings /> },
      { path: "testimonials", element: <Testimonials /> },

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
        path: "/checkout/thanks",
        element: <CheckoutThanks />,
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
        path: "admin",
        element: (
          <AdminRoute>
            <Admin />
          </AdminRoute>
        ),
      },
      {
        path: "/admin/trainings",
        element: (
          <AdminRoute>
            <AdminTrainings />
          </AdminRoute>
        ),
      },

      {
        path: "admin/learn",
        element: (
          <AdminRoute>
            <AdminLearn />
          </AdminRoute>
        ),
      },
      {
        path: "admin/products",
        element: (
          <AdminRoute>
            <AdminProducts />
          </AdminRoute>
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
      { path: "learn/course/:sku", element: <CourseDetail /> },
      { path: "learn/free/:id", element: <FreeVideoDetail /> },
      {
        path: "projects/:tool", // revit | revitmep | planswift
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
        path: "admin/rategen",
        element: (
          <AdminRoute>
            <AdminRateGen />
          </AdminRoute>
        ),
      },
      {
        path: "/admin/products/:id/edit",
        element: (
          <AdminRoute>
            <AdminProductEdit />
          </AdminRoute>
        ),
      },
      {
        path: "/admin/courses",
        element: (
          <AdminRoute>
            <AdminCourses />
          </AdminRoute>
        ),
      },
      {
        path: "/admin/course-grading",
        element: (
          <AdminRoute>
            <AdminCourseGrading />
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
