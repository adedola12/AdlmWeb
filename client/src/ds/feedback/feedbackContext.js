// The context behind useFeedback(). FeedbackProvider fills it; see there.
import React from "react";

export const FeedbackContext = React.createContext(null);

const SILENT = {
  toast: () => ({ close: () => {} }),
  card: () => Promise.resolve(null),
};

/** The site-wide toast and card. Outside the provider it does nothing. */
export function useFeedback() {
  return React.useContext(FeedbackContext) || SILENT;
}
