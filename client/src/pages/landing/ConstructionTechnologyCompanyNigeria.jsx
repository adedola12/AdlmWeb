import React from "react";
import { Link } from "react-router-dom";

import LandingLayout from "./LandingLayout.jsx";

const A = "text-adlm-blue-700 underline dark:text-adlm-blue-400";

export default function ConstructionTechnologyCompanyNigeria() {
  return (
    <LandingLayout
      path="/construction-technology-company-nigeria"
      crumb="Construction technology company in Nigeria"
      eyebrow="Who we are"
      h1="Construction technology company in Nigeria"
      intro={
        <>
          <p>
            ADLM Studio is a construction technology company based in Lagos. We
            build software for quantity surveying and BIM, and we train the
            firms that use it. We were founded in 2018 and are registered in
            Nigeria as RC 7440343.
          </p>
          <p>
            We are the Official Technical Partner to the Nigerian Institute of
            Quantity Surveyors, and more than 800 AEC professionals have been
            through our cohorts and corporate programmes.
          </p>
        </>
      }
      sections={[
        {
          heading: "What we build",
          body: (
            <>
              <p>
                The product line covers the path from a drawing or a model to a
                priced bill, and then to the programme and the valuation that
                follow it.
              </p>
              <p>
                <Link to="/product/revit" className={A}>
                  QUIV
                </Link>{" "}
                extracts quantities from Autodesk Revit models.{" "}
                <Link to="/product/planswift" className={A}>
                  HERON
                </Link>{" "}
                does the same for 2D drawings, which is still how a large share
                of Nigerian projects arrive. The{" "}
                <Link to="/product/mep" className={A}>
                  Revit MEP plugin
                </Link>{" "}
                covers building services, and{" "}
                <Link to="/product/civil3d" className={A}>
                  CIVIQ
                </Link>{" "}
                covers infrastructure work in Civil 3D.
              </p>
              <p>
                <Link to="/product/rategen" className={A}>
                  RateGen
                </Link>{" "}
                prices what those tools measure, building rates from Nigerian
                material, labour and plant costs rather than converting a
                foreign cost book. ADLM Cloud ties them together: one account,
                one set of entitlements, projects and dashboards shared across
                every tool and every machine a team uses.
              </p>
              <p>
                There is also{" "}
                <Link to="/product/qs-takeoff" className={A}>
                  ADLM Time Pro
                </Link>{" "}
                for site time management and productivity tracking, which closes
                the loop between what was planned and what the labour actually
                produced.
              </p>
            </>
          ),
        },
        {
          heading: "Why the software is built here",
          body: (
            <>
              <p>
                Construction cost work is local. Material prices move on local
                supply, labour output reflects local practice, and the currency
                does not hold still. Software written around another country's
                cost book cannot be corrected by changing a setting, because the
                assumptions are in the structure, not the numbers.
              </p>
              <p>
                That is the reason the company exists. Rate build-ups run on
                costs a Nigerian quantity surveyor can edit and defend. Pricing
                is set in naira. Payment works with the cards people here
                actually hold. The same engine supports international rates when
                a project calls for them, but the default is the market the
                users work in.
              </p>
            </>
          ),
        },
        {
          heading: "Delivery work, not only products",
          body: (
            <>
              <p>
                We deliver projects as well as tools. That includes scan-to-BIM
                as-built documentation for a Lagos data centre, 4D and 5D BIM
                programmes running with contractors and QS firms, and MEP and
                HVAC BIM training delivered on site.
              </p>
              <p>
                The delivery work is what keeps the software honest. Features
                come out of problems encountered on live projects, which is a
                different filter from a feature request list. A plugin that
                looks complete in a demo and fails on a real consultant model is
                a problem you only find by working on real consultant models.
              </p>
            </>
          ),
        },
        {
          heading: "How the pieces fit together",
          body: (
            <>
              <p>
                One account carries a user's entitlements across every tool.
                Sign in to the ADLM Installer Hub and the products that account
                has paid for appear ready to install, with no licence keys to
                distribute and no activation emails to chase. The same account
                signs in to the web platform.
              </p>
              <p>
                Projects sync rather than living on one machine, so a takeoff
                started on a desktop is available on a laptop, and a colleague
                given access sees the same data instead of a copy. Bills,
                programmes, valuations and dashboards all read from that shared
                project rather than from exported files that drift apart.
              </p>
              <p>
                Where AI helps, it is metered into the subscription rather than
                sold separately: bill checking, cost intelligence and rate
                build-up support, used where it saves a quantity surveyor real
                time.
              </p>
            </>
          ),
        },
        {
          heading: "Training and the profession",
          body: (
            <>
              <p>
                Over 800 AEC professionals have trained with us. Courses cover
                Revit, Navisworks, MS Project and Power BI, along with 4D and 5D
                BIM and the use of AI in cost management. They run self-paced
                and as cohorts, in person and online, with corporate programmes
                built around a firm's own projects.
              </p>
              <p>
                As Official Technical Partner to NIQS we are resource persons on
                the institute's professional readiness programme. Current
                courses are listed on the{" "}
                <Link to="/learn" className={A}>
                  Learn
                </Link>{" "}
                page, and upcoming sessions under{" "}
                <Link to="/trainings" className={A}>
                  training and events
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          heading: "Company details",
          body: (
            <>
              <p>
                ADLM Studios is registered in Nigeria under RC 7440343 and
                operates from Lagos. The company was founded in 2018.
              </p>
              <p>
                For technical help with a licence, an installation or a plugin,
                the{" "}
                <Link to="/support" className={A}>
                  support
                </Link>{" "}
                page covers the fastest routes, including remote sessions for
                issues that need someone to look at the machine. To price a
                combination of tools and training for a specific team, use the{" "}
                <Link to="/quote" className={A}>
                  quotation builder
                </Link>
                .
              </p>
            </>
          ),
        },
      ]}
      faq={[
        {
          question: "Is ADLM Studio a registered Nigerian company?",
          answer:
            "Yes. ADLM Studios is registered under RC 7440343 and operates from Lagos. The company was founded in 2018.",
        },
        {
          question: "What does Official Technical Partner to NIQS mean?",
          answer:
            "It is a formal designation from the Nigerian Institute of Quantity Surveyors. We are also resource persons on the institute's professional readiness programme.",
        },
        {
          question: "Do you work with firms outside Nigeria?",
          answer:
            "Yes. The rate engine supports international rates as well as Nigerian ones, and pricing can be shown in dollars. The default assumptions are built for the Nigerian market.",
        },
        {
          question: "Do you take on project delivery as well as licensing software?",
          answer:
            "Yes. Past work includes scan-to-BIM as-built documentation for a Lagos data centre, 4D and 5D BIM programmes with contractors and QS firms, and on-site MEP and HVAC BIM training.",
        },
      ]}
      related={[
        {
          to: "/about",
          label: "About ADLM Studio",
          note: "The longer version, including how the tools fit together.",
        },
        {
          to: "/products",
          label: "All products",
          note: "Every plugin and platform, with pricing in naira.",
        },
        {
          to: "/quantity-surveying-software-nigeria",
          label: "QS software in Nigeria",
          note: "How the takeoff and rate tools work together.",
        },
        {
          to: "/testimonials",
          label: "Customer testimonials",
          note: "What firms using the tools on live projects say.",
        },
      ]}
    />
  );
}
