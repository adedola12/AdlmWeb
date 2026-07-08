// client/src/lib/paystack.js
// Paystack card payment for a pending purchase. The server initializes the
// transaction (it owns amount + email), the popup only resumes it via the
// access code — so a tampered client can never change what gets charged.
import { apiAuthed } from "../http.js";

export async function payWithPaystack({
  purchaseId,
  accessToken,
  onSuccess,
  onCancel,
}) {
  const out = await apiAuthed(`/purchase/${purchaseId}/paystack/init`, {
    token: accessToken,
    method: "POST",
  });

  const { reference, access_code, authorization_url } = out || {};
  if (!reference || !access_code) {
    throw new Error("Could not start card payment");
  }

  // Inline v2 is loaded once in index.html. If the script was blocked (ad
  // blockers, strict networks), fall back to Paystack's hosted page — the
  // callback_url brings the user back here with the reference to verify.
  if (typeof window.PaystackPop !== "function") {
    window.location.assign(authorization_url);
    return { reference };
  }

  const popup = new window.PaystackPop();
  popup.resumeTransaction(access_code, {
    // 3DS/OTP for foreign cards happens inside the popup — nothing to do here.
    onSuccess: () => onSuccess?.(reference),
    onCancel: () => onCancel?.(reference),
  });

  return { reference };
}

// The popup's word is never trusted — the server re-checks the charge with
// Paystack (status, amount, currency) before marking the purchase paid.
export async function verifyPaystack(reference, accessToken) {
  return apiAuthed(`/purchase/verify`, {
    token: accessToken,
    params: { reference },
  }); // -> { ok, status, purchaseId }
}
