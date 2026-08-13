import React from "react";
import { Link } from "react-router-dom";

import LandingLayout from "./LandingLayout.jsx";

export default function QuantitySurveyingSoftwareNigeria() {
  return (
    <LandingLayout
      path="/quantity-surveying-software-nigeria"
      crumb="Quantity surveying software in Nigeria"
      eyebrow="For Nigerian QS practices"
      h1="Quantity surveying software in Nigeria"
      intro={
        <>
          <p>
            ADLM Studio builds quantity surveying software for the way work
            actually gets done in Nigeria. Takeoff from a model or a drawing,
            rates built from local material and labour prices, and a bill you
            can hand to a client without retyping anything.
          </p>
          <p>
            We are a Lagos company, registered as RC 7440343 and founded in
            2018. We are the Official Technical Partner to the Nigerian
            Institute of Quantity Surveyors, and we have trained more than 800
            AEC professionals.
          </p>
        </>
      }
      sections={[
        {
          heading: "The problem with imported cost software",
          body: (
            <>
              <p>
                Most quantity surveying packages are built around a cost book
                for another country. The measurement rules assume a different
                standard. The rates assume different material prices, different
                labour output, and a currency that does not move the way the
                naira does. Firms end up buying the tool for its takeoff and
                throwing away its pricing, which means the spreadsheet comes
                back and the two halves of the job stop talking to each other.
              </p>
              <p>
                That gap is where the errors live. A quantity measured in one
                system and priced in another has to be moved by hand. Every
                transfer is a chance to drop a line, use last month's rate, or
                price a revised drawing against a superseded quantity. On a bill
                of several thousand items nobody catches all of it.
              </p>
              <p>
                Our tools close that gap. The quantity and the rate stay in the
                same system, so a change to either one updates the bill.
              </p>
            </>
          ),
        },
        {
          heading: "What the software does",
          body: (
            <>
              <p>
                <strong>Takeoff.</strong> If you have a model,{" "}
                <Link to="/product/revit" className="text-adlm-blue-700 underline dark:text-adlm-blue-400">
                  QUIV
                </Link>{" "}
                reads quantities out of Autodesk Revit and produces schedules
                for architectural and structural work. If you are working from
                drawings instead,{" "}
                <Link to="/product/planswift" className="text-adlm-blue-700 underline dark:text-adlm-blue-400">
                  HERON
                </Link>{" "}
                handles 2D takeoff from PDFs and CAD files and exports to a bill
                of quantities. Services work has its own plugin for{" "}
                <Link to="/product/mep" className="text-adlm-blue-700 underline dark:text-adlm-blue-400">
                  Revit MEP
                </Link>
                , and infrastructure work is covered by{" "}
                <Link to="/product/civil3d" className="text-adlm-blue-700 underline dark:text-adlm-blue-400">
                  CIVIQ
                </Link>{" "}
                for Autodesk Civil 3D.
              </p>
              <p>
                <strong>Rates.</strong>{" "}
                <Link to="/product/rategen" className="text-adlm-blue-700 underline dark:text-adlm-blue-400">
                  RateGen
                </Link>{" "}
                builds rates from first principles. You set material, labour and
                plant costs, and it assembles the rate from them. The build-ups
                are aligned to BESMM4R. When a material price changes you change
                it once, and every rate that uses it moves.
              </p>
              <p>
                <strong>Everything after the bill.</strong> Bills, programmes,
                valuations and project dashboards run off the same data. The
                same login carries your entitlements across every tool, so there
                is no re-keying between the measurement stage and the reporting
                stage.
              </p>
            </>
          ),
        },
        {
          heading: "Priced for a Nigerian practice",
          body: (
            <>
              <p>
                Subscriptions are priced and billed in naira. Card payments are
                supported directly, and auto-renew is something you opt into
                rather than something you have to remember to cancel. You can
                pay monthly or take a longer term at a lower monthly cost.
              </p>
              <p>
                Licensing is per user. Sign in to the ADLM Installer Hub with
                the account that paid, and the products you are entitled to
                appear ready to install. There are no licence keys to distribute
                and no activation emails to chase.
              </p>
              <p>
                If a subscription lapses, the plugin stops activating but your
                work stays where it is. Projects, bills and exports remain in
                your account and on your machine, and resubscribing restores
                access without repeating any setup.
              </p>
            </>
          ),
        },
        {
          heading: "Software on its own does not change a firm",
          body: (
            <>
              <p>
                A licence does not make a team estimate differently. That is why
                every programme pairs the tools with structured training and a
                working process, delivered in person or online. It is also why
                we have trained more than 800 AEC professionals rather than only
                selling to them.
              </p>
              <p>
                The training covers Revit, Navisworks, MS Project and Power BI
                alongside 4D and 5D BIM and the use of AI in cost work. You can
                see the current course list on the{" "}
                <Link to="/learn" className="text-adlm-blue-700 underline dark:text-adlm-blue-400">
                  Learn
                </Link>{" "}
                page, and upcoming cohorts and corporate programmes under{" "}
                <Link to="/trainings" className="text-adlm-blue-700 underline dark:text-adlm-blue-400">
                  training and events
                </Link>
                .
              </p>
              <p>
                We are resource persons on the NIQS professional readiness
                programme, and we have delivered scan-to-BIM as-built
                documentation for a Lagos data centre and 4D and 5D programmes
                with contractors and QS firms. The tools come out of doing the
                work, not out of guessing at it.
              </p>
            </>
          ),
        },
      ]}
      faq={[
        {
          question: "Does it work with the standard method of measurement we use?",
          answer:
            "RateGen build-ups are aligned to BESMM4R. Takeoff output is structured so it can be arranged to the bill format your practice already issues.",
        },
        {
          question: "Do we need Revit to use any of this?",
          answer:
            "No. QUIV and the MEP plugin work inside Revit, and CIVIQ inside Civil 3D, but HERON does 2D takeoff from PDFs and CAD drawings with no model at all. RateGen prices work regardless of where the quantities came from.",
        },
        {
          question: "Can we pay in naira?",
          answer:
            "Yes. Pricing is set in naira and card payment in naira is supported. Dollar pricing is available where a client needs it, converted at the live rate.",
        },
        {
          question: "What happens to our data if we stop paying?",
          answer:
            "The plugin stops activating. Your projects, bills and exports stay in your account and on your machine, and resubscribing restores access without redoing setup.",
        },
      ]}
      related={[
        {
          to: "/product/revit",
          label: "QUIV for Revit",
          note: "Quantity takeoff and schedules straight out of a Revit model.",
        },
        {
          to: "/product/rategen",
          label: "RateGen",
          note: "Rate build-ups from Nigerian material, labour and plant costs.",
        },
        {
          to: "/product/planswift",
          label: "HERON",
          note: "2D takeoff from PDFs and CAD drawings, exported to a bill.",
        },
        {
          to: "/about",
          label: "About ADLM Studio",
          note: "Who we are, what we have delivered, and who we work with.",
        },
      ]}
    />
  );
}
