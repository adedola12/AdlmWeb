import React from "react";
import TestInd from "../components/Testimonial/TestInd";
import TestHero from "../components/Testimonial/TestHero";
import TestComp from "../components/Testimonial/TestComp";
import TestUser from "../components/Testimonial/TestUser";

const Testimonials = () => {
  return (
    <div>
      <TestHero />
      <TestInd />
      <TestComp />
      <TestUser />
    </div>
  );
};

export default Testimonials;
