// Day counts for entitlement expiry, shared by the admin Subscriptions tab.
//
// ADLM's business day is a Lagos day, and the server counts it the same way
// (server/util/followUps.js), so "Expired 10d" means one number on both
// screens whatever zone the admin's browser is in. Counts are calendar days
// between Lagos dates: hour arithmetic with Math.ceil read one day short in
// the hour after midnight.
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const BUSINESS_TZ = "Africa/Lagos";
const lagosDay = (d) => dayjs(d).tz(BUSINESS_TZ).startOf("day");

/** True once the expiry DAY (in Lagos) is over. */
export function isExpiryPast(expiresAt, now = dayjs()) {
  if (!expiresAt || !dayjs(expiresAt).isValid()) return false;
  return lagosDay(now).isAfter(lagosDay(expiresAt));
}

/**
 * Lagos calendar days from today to the expiry day: 0 = expires today,
 * positive = days left, negative = days since it lapsed. null if no date.
 */
export function daysUntilExpiry(expiresAt, now = dayjs()) {
  if (!expiresAt || !dayjs(expiresAt).isValid()) return null;
  return lagosDay(expiresAt).diff(lagosDay(now), "day");
}
