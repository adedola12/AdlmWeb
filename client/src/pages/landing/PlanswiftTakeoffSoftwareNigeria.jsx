import React from "react";
import { Link } from "react-router-dom";

import LandingLayout from "./LandingLayout.jsx";

const A = "text-adlm-blue-700 underline dark:text-adlm-blue-400";

export default function PlanswiftTakeoffSoftwareNigeria() {
  return (
    <LandingLayout
      path="/planswift-takeoff-software-nigeria"
      crumb="PlanSwift takeoff software in Nigeria"
      eyebrow="HERON for 2D takeoff"
      h1="PlanSwift takeoff software in Nigeria"
      intro={
        <>
          <p>
            HERON is 2D takeoff software for quantity surveyors working from
            drawings. You measure on the PDF or the CAD file, and the quantities
            go straight into a bill of quantities without being retyped into a
            spreadsheet first.
          </p>
          <p>
            It is built by ADLM Studio in Lagos. We are registered as RC 7440343,
            founded in 2018, Official Technical Partner to the Nigerian
            Institute of Quantity Surveyors, and we have trained more than 800
            AEC professionals.
          </p>
        </>
      }
      sections={[
        {
          heading: "Most Nigerian projects still arrive as drawings",
          body: (
            <>
              <p>
                BIM adoption is real but uneven. A firm can be modelling its own
                projects and still receive consultant drawings as PDFs, tender
                documents as scans, and revisions as a marked-up sheet. Waiting
                for every project to be modelled before improving the takeoff
                process means waiting a long time.
              </p>
              <p>
                HERON is for that reality. It handles PDFs and CAD drawings,
                which is what actually lands in the inbox, and produces the same
                structured output the model-based tools do.
              </p>
              <p>
                That matters because it lets a practice standardise on one
                measurement and pricing process regardless of what the project
                arrived as. Modelled jobs go through{" "}
                <Link to="/product/revit" className={A}>
                  QUIV
                </Link>
                , drawing-based jobs go through HERON, and both end up in the
                same bill format priced by the same rate engine.
              </p>
            </>
          ),
        },
        {
          heading: "How measuring works",
          body: (
            <>
              <p>
                You work on the drawing itself. Set the scale, measure lengths,
                areas and counts against the sheet, and the measurements are
                recorded as quantities attached to bill items rather than as
                numbers written down somewhere separate.
              </p>
              <p>
                Because the measurement stays attached to where it was taken,
                the takeoff is auditable. When a figure is queried you can see
                which sheet it came from and what was measured, which is the
                part that usually gets lost when quantities are transcribed into
                a spreadsheet.
              </p>
              <p>
                Revisions are handled the same way. A superseded sheet does not
                silently leave old quantities in the bill.
              </p>
            </>
          ),
        },
        {
          heading: "Pricing what you measured",
          body: (
            <>
              <p>
                HERON exports to a bill of quantities, and{" "}
                <Link to="/product/rategen" className={A}>
                  RateGen
                </Link>{" "}
                prices it. Rates are built from first principles using material,
                labour and plant costs you set and can edit, with build-ups
                aligned to BESMM4R.
              </p>
              <p>
                This is the difference from pricing against a fixed rate list.
                When cement moves, you change the material cost once and every
                rate that includes it recalculates, along with every bill line
                priced from those rates. On a market where prices move
                monthly, that is the difference between a bill you can defend
                and one you have to rebuild.
              </p>
              <p>
                Projects sync to your ADLM account, so bills, programmes and
                dashboards read the same data across every machine your team
                signs in from.
              </p>
            </>
          ),
        },
        {
          heading: "Licensing, installation and support",
          body: (
            <>
              <p>
                HERON runs on Windows. Licensing is per user and tied to your
                ADLM account. After payment, sign in to the ADLM Installer Hub
                with the same account and the software appears ready to install.
                No licence keys, no waiting on an activation email.
              </p>
              <p>
                Subscriptions are priced in naira, monthly or for a longer term
                at a lower monthly cost. Auto-renew is opt-in. If a subscription
                ends the software stops activating, but your projects, bills and
                exports stay in your account and on your machine, and
                resubscribing restores access without redoing setup.
              </p>
              <p>
                If something goes wrong with an installation, the{" "}
                <Link to="/support" className={A}>
                  support
                </Link>{" "}
                page covers the fastest route, including remote sessions where
                someone needs to look at the machine directly. Release notes for
                every version are under{" "}
                <Link to="/whats-new/heron" className={A}>
                  what is new
                </Link>
                .
              </p>
            </>
          ),
        },
      ]}
      faq={[
        {
          question: "What file types can HERON measure from?",
          answer:
            "PDFs and CAD drawings. That covers most of what arrives on a Nigerian project, including scanned tender documents and consultant issue sheets.",
        },
        {
          question: "Do I need a BIM model to use it?",
          answer:
            "No. HERON exists specifically for drawing-based work. If you also have modelled projects, QUIV handles those and both feed the same rate engine and bill format.",
        },
        {
          question: "How are rates applied to what I measure?",
          answer:
            "RateGen builds rates from material, labour and plant costs you control, aligned to BESMM4R. Change an input once and every rate and bill line using it updates.",
        },
        {
          question: "Is it priced in naira?",
          answer:
            "Yes. Subscriptions are set and billed in naira, monthly or for a longer term at a lower monthly cost, with card payment supported directly.",
        },
      ]}
      related={[
        {
          to: "/product/planswift",
          label: "HERON product page",
          note: "Full feature list, current pricing and FAQs.",
        },
        {
          to: "/product/rategen",
          label: "RateGen",
          note: "Builds the rates that price your takeoff.",
        },
        {
          to: "/revit-quantity-takeoff-plugin",
          label: "Working from Revit models?",
          note: "QUIV extracts quantities from the model instead.",
        },
        {
          to: "/learn",
          label: "Training courses",
          note: "Get the team measuring consistently, not just licensed.",
        },
      ]}
    />
  );
}
