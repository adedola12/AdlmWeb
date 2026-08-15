import React from "react";
import { Link } from "react-router-dom";

import LandingLayout from "./LandingLayout.jsx";

const A = "text-adlm-blue-700 underline dark:text-adlm-blue-400";

export default function RevitQuantityTakeoffPlugin() {
  return (
    <LandingLayout
      path="/revit-quantity-takeoff-plugin"
      crumb="Revit quantity takeoff plugin"
      eyebrow="QUIV for Autodesk Revit"
      h1="Revit quantity takeoff plugin"
      intro={
        <>
          <p>
            QUIV is a quantity takeoff plugin for Autodesk Revit. It reads
            quantities out of the model and produces schedules for architectural
            and structural work, then carries them through to a priced bill
            without an export to a spreadsheet in between.
          </p>
          <p>
            It is built by ADLM Studio, a Lagos construction technology company
            registered as RC 7440343 and founded in 2018. We are the Official
            Technical Partner to the Nigerian Institute of Quantity Surveyors
            and have trained over 800 AEC professionals.
          </p>
        </>
      }
      sections={[
        {
          heading: "What is wrong with a Revit schedule on its own",
          body: (
            <>
              <p>
                Revit will already give you a schedule. The problem is what
                happens next. The schedule goes to Excel, gets rearranged into
                bill order, gets priced against a rate list held somewhere else,
                and becomes a document with no connection to the model it came
                from.
              </p>
              <p>
                Then the design changes, as it does. Now there is a new schedule
                and an old bill, and reconciling them is manual. Most teams
                handle this by rebuilding the bill, which is slow, or by patching
                it, which is where the errors get in. Either way the model has
                stopped being the source of truth for cost.
              </p>
              <p>
                QUIV keeps that link. The quantities stay associated with the
                elements they came from, so a revised model produces a revised
                bill rather than a reconciliation exercise.
              </p>
            </>
          ),
        },
        {
          heading: "How it works",
          body: (
            <>
              <p>
                QUIV installs into Revit and runs against the open model. It
                extracts quantities for architectural and structural elements
                and organises them into schedules structured for measurement
                rather than for drawing annotation.
              </p>
              <p>
                From there the quantities feed{" "}
                <Link to="/product/rategen" className={A}>
                  RateGen
                </Link>
                , which builds the rates. Rate build-ups run on material, labour
                and plant costs you control, aligned to BESMM4R. Change a
                material price once and every rate using it updates, and so does
                every bill line priced from those rates.
              </p>
              <p>
                Projects sync to your ADLM account, so the same model and the
                same bill are available on any machine you sign in from. Bills,
                programmes and project dashboards read from that shared data
                rather than from separate copies.
              </p>
            </>
          ),
        },
        {
          heading: "What it does not do",
          body: (
            <>
              <p>
                QUIV covers architectural and structural quantities. Building
                services are a different plugin: the{" "}
                <Link to="/product/mep" className={A}>
                  Revit MEP plugin
                </Link>{" "}
                produces MEP-focused takeoffs and schedules, and infrastructure
                work in Civil 3D is covered by{" "}
                <Link to="/product/civil3d" className={A}>
                  CIVIQ
                </Link>
                .
              </p>
              <p>
                It also cannot measure what has not been modelled. A model with
                unclassified elements or missing parameters will produce gaps,
                and those gaps are visible rather than silent. Finding them at
                takeoff is the point, but it does mean the model has to be in
                reasonable shape.
              </p>
              <p>
                If your projects are not modelled at all,{" "}
                <Link to="/product/planswift" className={A}>
                  HERON
                </Link>{" "}
                does 2D takeoff from PDFs and CAD drawings and feeds the same
                rate engine.
              </p>
            </>
          ),
        },
        {
          heading: "Licensing and installation",
          body: (
            <>
              <p>
                QUIV runs on Windows, inside Revit. Licensing is per user and
                tied to your ADLM account. After payment, sign in to the ADLM
                Installer Hub with the same account and the plugin appears ready
                to install. There is no licence key to copy and no activation
                email to wait for.
              </p>
              <p>
                Subscriptions are priced in naira and can be paid monthly or for
                a longer term at a lower monthly cost. Auto-renew is an opt-in
                checkbox at checkout, not a default. If a subscription ends the
                plugin stops activating, but your projects, bills and exports
                stay in your account and on your machine.
              </p>
              <p>
                Current pricing is on the{" "}
                <Link to="/product/revit" className={A}>
                  QUIV product page
                </Link>
                , and the{" "}
                <Link to="/quote" className={A}>
                  quotation builder
                </Link>{" "}
                will price it for a specific number of users alongside anything
                else you need.
              </p>
            </>
          ),
        },
      ]}
      faq={[
        {
          question: "Which Revit disciplines does QUIV cover?",
          answer:
            "Architectural and structural quantities and schedules. MEP work is handled by the separate Revit MEP plugin, and Civil 3D infrastructure by CIVIQ.",
        },
        {
          question: "Do I need RateGen as well?",
          answer:
            "QUIV measures and RateGen prices. You can use QUIV on its own for quantities, but the priced bill without re-keying is what the two together produce.",
        },
        {
          question: "What operating system does it need?",
          answer:
            "Windows, because it runs inside Autodesk Revit. The projects it produces sync to your ADLM account and are readable from any machine you sign in on.",
        },
        {
          question: "How do I install it after paying?",
          answer:
            "Sign in to the ADLM Installer Hub with the account that paid. The products you are entitled to appear ready to install. No licence keys, no activation email.",
        },
      ]}
      related={[
        {
          to: "/product/revit",
          label: "QUIV product page",
          note: "Full feature list, current pricing and FAQs.",
        },
        {
          to: "/product/rategen",
          label: "RateGen",
          note: "The rate engine that prices what QUIV measures.",
        },
        {
          to: "/whats-new/quiv",
          label: "QUIV release notes",
          note: "Every version, what changed, and when it shipped.",
        },
        {
          to: "/planswift-takeoff-software-nigeria",
          label: "Working from drawings instead?",
          note: "HERON does 2D takeoff from PDFs and CAD files.",
        },
      ]}
    />
  );
}
