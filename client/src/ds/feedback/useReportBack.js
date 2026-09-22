// Every screen already words its own outcome ("Saved.", "That could not be
// saved."). This hands each new message to Richard's toast as well, so an
// action reports back where the eye is, not only in a line on the page.
import React from "react";
import { useFeedback } from "./feedbackContext.js";

export function useReportBack(said, problem) {
  const fb = useFeedback();
  React.useEffect(() => {
    if (said) fb.toast({ tone: "success", title: said });
  }, [said, fb]);
  React.useEffect(() => {
    if (problem) fb.toast({ tone: "error", title: problem });
  }, [problem, fb]);
}
