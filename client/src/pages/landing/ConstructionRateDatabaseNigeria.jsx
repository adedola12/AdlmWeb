import React from "react";
import { Link } from "react-router-dom";

import LandingLayout from "./LandingLayout.jsx";

const A = "text-adlm-blue-700 underline dark:text-adlm-blue-400";

export default function ConstructionRateDatabaseNigeria() {
  return (
    <LandingLayout
      path="/construction-rate-database-nigeria"
      crumb="Construction rate database for Nigeria"
      eyebrow="RateGen"
      h1="Construction rate database for Nigeria"
      intro={
        <>
          <p>
            RateGen builds construction rates from first principles using
            Nigerian material, labour and plant costs. It is not a fixed price
            book. You control the inputs, and every rate that uses an input
            updates when you change it.
          </p>
          <p>
            It is built by ADLM Studio, a Lagos company registered as RC 7440343
            and founded in 2018. We are the Official Technical Partner to the
            Nigerian Institute of Quantity Surveyors and have trained more than
            800 AEC professionals.
          </p>
        </>
      }
      sections={[
        {
          heading: "Why a fixed rate book does not survive here",
          body: (
            <>
              <p>
                A published rate is a snapshot. It bundles material cost, labour
                output, plant, overhead and profit into one number that was true
                on the day it was compiled. In a market where material prices
                move month to month and the exchange rate moves with them, that
                number starts drifting immediately and there is no way to see
                which part of it drifted.
              </p>
              <p>
                The usual workaround is a percentage uplift across the board.
                That is a guess applied evenly to items that did not move
                evenly. Steel and cement do not track each other, and neither
                tracks labour.
              </p>
              <p>
                Building the rate from its components fixes this. You hold the
                material, labour and plant costs, and the rate is assembled from
                them. When a price moves you move that one input, and every rate
                containing it recalculates correctly rather than uniformly.
              </p>
            </>
          ),
        },
        {
          heading: "How build-ups work",
          body: (
            <>
              <p>
                Each rate is assembled from constants and costs: how much
                material a unit of work consumes, how much labour it takes, what
                plant is involved, and what those cost today. Build-ups are
                aligned to BESMM4R.
              </p>
              <p>
                Material and labour constants are editable. This matters because
                output rates are a matter of professional judgement and local
                conditions, not a universal figure. A practice can hold
                constants that reflect how its own projects actually perform and
                defend them, rather than inheriting an assumption it cannot see.
              </p>
              <p>
                Because the components are visible, a rate can be explained. When
                a client or an arbitrator asks why an item is priced as it is,
                the answer is the build-up, not a citation of a book.
              </p>
            </>
          ),
        },
        {
          heading: "Where the quantities come from",
          body: (
            <>
              <p>
                RateGen prices work regardless of how it was measured.{" "}
                <Link to="/product/revit" className={A}>
                  QUIV
                </Link>{" "}
                brings quantities out of Autodesk Revit models,{" "}
                <Link to="/product/planswift" className={A}>
                  HERON
                </Link>{" "}
                measures 2D drawings and PDFs, the{" "}
                <Link to="/product/mep" className={A}>
                  Revit MEP plugin
                </Link>{" "}
                covers building services, and{" "}
                <Link to="/product/civil3d" className={A}>
                  CIVIQ
                </Link>{" "}
                covers infrastructure in Civil 3D.
              </p>
              <p>
                All of them feed the same rate engine and produce the same bill
                format, which is what lets a practice run one pricing process
                across modelled and drawing-based projects at the same time.
              </p>
              <p>
                Quantities can also come from an uploaded bill. A bill in Excel
                can be brought in and turned into a material and labour
                schedule, including services, without the bill total moving.
              </p>
            </>
          ),
        },
        {
          heading: "International rates and currency",
          body: (
            <>
              <p>
                The default assumptions are Nigerian, because that is who the
                tool is for. The same engine supports international rates when a
                project needs them.
              </p>
              <p>
                Subscription pricing is set in naira, with dollar pricing
                available where a client needs it, converted at the live rate.
                Card payment in naira is supported directly, and auto-renew is
                opt-in rather than a default you have to cancel.
              </p>
            </>
          ),
        },
        {
          heading: "Getting the team using it",
          body: (
            <>
              <p>
                A rate library is only as good as the discipline behind it.
                Constants have to be reviewed, prices have to be updated, and
                the practice has to agree what its build-ups mean. That is a
                process question as much as a software one.
              </p>
              <p>
                Our training covers it alongside the tools, in person and
                online, with corporate programmes built around a firm's own
                projects. Current courses are on the{" "}
                <Link to="/learn" className={A}>
                  Learn
                </Link>{" "}
                page and upcoming sessions under{" "}
                <Link to="/trainings" className={A}>
                  training and events
                </Link>
                .
              </p>
            </>
          ),
        },
      ]}
      faq={[
        {
          question: "Is this a price book I can look rates up in?",
          answer:
            "No. It builds rates from material, labour and plant costs you hold and can edit. That is what lets a rate stay correct when one input moves and the others do not.",
        },
        {
          question: "Which standard are the build-ups aligned to?",
          answer:
            "BESMM4R. Material and labour constants are editable so a practice can hold figures that match how its own projects actually perform.",
        },
        {
          question: "Can I use it with quantities measured elsewhere?",
          answer:
            "Yes. QUIV, HERON, the Revit MEP plugin and CIVIQ all feed it, and a bill uploaded from Excel can be converted into a material and labour schedule without the total changing.",
        },
        {
          question: "Does it handle rates outside Nigeria?",
          answer:
            "Yes. The default assumptions are Nigerian, but the same engine supports international rates when a project calls for them.",
        },
      ]}
      related={[
        {
          to: "/product/rategen",
          label: "RateGen product page",
          note: "Full feature list, current pricing and FAQs.",
        },
        {
          to: "/whats-new/rategen",
          label: "RateGen release notes",
          note: "Every version, what changed, and when it shipped.",
        },
        {
          to: "/quantity-surveying-software-nigeria",
          label: "QS software in Nigeria",
          note: "How measurement and pricing fit together end to end.",
        },
        {
          to: "/quote",
          label: "Price it for your team",
          note: "Set the number of users and get an instant estimate.",
        },
      ]}
    />
  );
}
