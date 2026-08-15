import React from "react";
import { Link } from "react-router-dom";

import LandingLayout from "./LandingLayout.jsx";

const A = "text-adlm-blue-700 underline dark:text-adlm-blue-400";

export default function BimSoftwareNigeria() {
  return (
    <LandingLayout
      path="/bim-software-nigeria"
      crumb="BIM software in Nigeria"
      eyebrow="BIM for Nigerian construction"
      h1="BIM software in Nigeria"
      intro={
        <>
          <p>
            ADLM Studio builds BIM tools for Nigerian construction firms and
            trains the teams that use them. The tools sit inside Revit, ArchiCAD
            and Civil 3D, and they exist to answer the question a model is
            usually bought to answer: what does this cost.
          </p>
          <p>
            We are based in Lagos, registered as RC 7440343 and founded in 2018.
            We are the Official Technical Partner to the Nigerian Institute of
            Quantity Surveyors, and more than 800 AEC professionals have been
            through our training.
          </p>
        </>
      }
      sections={[
        {
          heading: "Where BIM adoption usually stalls",
          body: (
            <>
              <p>
                Most firms that adopt BIM get as far as the model. The
                architects model, the engineers model, and the drawings come out
                of it. Then the quantity surveyor exports a schedule to Excel,
                and from that point on the cost side is a spreadsheet again. The
                model keeps changing and the spreadsheet does not.
              </p>
              <p>
                So the model becomes a drawing production tool. It is a real
                improvement over CAD, but it is not what was paid for. The
                return on BIM comes from the data, and the data stops at the
                boundary between the design tools and the cost tools.
              </p>
              <p>
                That boundary is what we build across. Quantities come out of
                the model, rates are built in the same system, and the bill
                updates when either side changes.
              </p>
            </>
          ),
        },
        {
          heading: "The tools, by authoring platform",
          body: (
            <>
              <p>
                <strong>Autodesk Revit.</strong>{" "}
                <Link to="/product/revit" className={A}>
                  QUIV
                </Link>{" "}
                extracts quantities and builds schedules for architectural and
                structural work directly from the model. Services work is
                handled by the{" "}
                <Link to="/product/mep" className={A}>
                  Revit MEP plugin
                </Link>
                , which produces MEP-focused takeoffs and schedules.
              </p>
              <p>
                <strong>ArchiCAD.</strong> Graphisoft users get the same
                treatment. ArchiCAD projects sync to your ADLM account and carry
                through to bills and dashboards alongside everything else.
              </p>
              <p>
                <strong>Autodesk Civil 3D.</strong>{" "}
                <Link to="/product/civil3d" className={A}>
                  CIVIQ
                </Link>{" "}
                covers infrastructure takeoff for civil projects.
              </p>
              <p>
                <strong>No model yet.</strong> Plenty of Nigerian projects still
                arrive as PDFs and CAD drawings.{" "}
                <Link to="/product/planswift" className={A}>
                  HERON
                </Link>{" "}
                does 2D takeoff on those, so a firm can start getting the
                workflow benefits before every project is modelled.
              </p>
            </>
          ),
        },
        {
          heading: "4D, 5D and model checking",
          body: (
            <>
              <p>
                Once quantities are coming out of the model reliably, the
                programme and the cost plan can be driven from the same source.
                We run 4D and 5D BIM programmes with contractors and QS firms,
                connecting the model to the schedule and to the valuation rather
                than maintaining three separate versions of the truth.
              </p>
              <p>
                Model checking runs on the same data. A model that has been
                measured is a model whose gaps are visible: missing parameters,
                unclassified elements, and objects that will not price. Finding
                those before the bill is issued is cheaper than finding them
                after.
              </p>
              <p>
                We have also delivered scan-to-BIM as-built documentation for a
                Lagos data centre, and MEP and HVAC BIM training on site. The
                software reflects that delivery work.
              </p>
            </>
          ),
        },
        {
          heading: "Training is part of the job",
          body: (
            <>
              <p>
                Buying BIM software and buying BIM capability are different
                purchases. Our training covers Revit, Navisworks, MS Project and
                Power BI, plus 4D and 5D BIM and where AI genuinely saves time
                in cost work. Courses run self-paced and as cohorts, in person
                and online.
              </p>
              <p>
                Corporate programmes are built around a firm's own projects, so
                the output of the training is a working process rather than a
                certificate. Current courses are on the{" "}
                <Link to="/learn" className={A}>
                  Learn
                </Link>{" "}
                page and upcoming sessions under{" "}
                <Link to="/trainings" className={A}>
                  training and events
                </Link>
                .
              </p>
              <p>
                As Official Technical Partner to NIQS we are also resource
                persons on the institute's professional readiness programme.
              </p>
            </>
          ),
        },
      ]}
      faq={[
        {
          question: "Do we have to move everything to BIM first?",
          answer:
            "No. HERON does 2D takeoff from PDFs and CAD drawings, so you can adopt the cost workflow on drawing-based projects and bring modelled projects in as they arrive.",
        },
        {
          question: "Which authoring tools are supported?",
          answer:
            "Autodesk Revit for architectural, structural and MEP work, Graphisoft ArchiCAD, and Autodesk Civil 3D for infrastructure. The plugins run on Windows.",
        },
        {
          question: "Can the model drive the programme as well as the bill?",
          answer:
            "Yes. That is what the 4D and 5D programmes cover: connecting model quantities to the schedule and to valuations so all three stay consistent.",
        },
        {
          question: "Do you train our team or just sell the licence?",
          answer:
            "Both. Every programme pairs the tools with structured training and a working process, delivered in person or online. Over 800 AEC professionals have been through it.",
        },
      ]}
      related={[
        {
          to: "/product/revit",
          label: "QUIV for Revit",
          note: "Quantities and schedules from architectural and structural models.",
        },
        {
          to: "/product/mep",
          label: "Revit MEP plugin",
          note: "MEP-focused takeoffs and schedules from Revit.",
        },
        {
          to: "/learn",
          label: "BIM and QS courses",
          note: "Revit, Navisworks, MS Project, Power BI, 4D and 5D BIM.",
        },
        {
          to: "/construction-technology-company-nigeria",
          label: "About the company",
          note: "RC 7440343, founded 2018, Lagos. What we have delivered.",
        },
      ]}
    />
  );
}
