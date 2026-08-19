// The account customers pay into.
//
// Three names for one thing, in precedence order. ADLMPAY_* is what is
// actually configured in SSM and what the physical-training routes already
// quote; BANK_* is kept as an override because /purchase/bank-details was
// written against it; the literals are a last resort so a missing parameter
// cannot print "YOUR BANK NAME" on an invoice.
//
// They agree today. The reason to collapse them is the day they stop: a
// purchase quoting one account and a training invoice quoting another, with
// nothing in the code saying which is right.
export function payoutAccount() {
  return {
    accountNumber:
      process.env.BANK_ACCOUNT_NUMBER ||
      process.env.ADLMPAY_ACCOUNT_NUMBER ||
      "1634998770",
    accountName:
      process.env.BANK_ACCOUNT_NAME || process.env.ADLMPAY_ACCOUNT_NAME || "ADLM Studio",
    bankName: process.env.BANK_NAME || process.env.ADLMPAY_BANK_NAME || "Access Bank",
  };
}
