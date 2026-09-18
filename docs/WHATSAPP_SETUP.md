# Switching on WhatsApp number verification

The code is live but switched off. Once the three settings at the end exist, the
"Verify on WhatsApp" button appears in Account settings and the server starts
sending codes. Nothing else needs a code change.

## 1. A Meta Business account (about 20 minutes)

1. Go to business.facebook.com and create a business portfolio for **ADLM Studio**
   (or use the one that owns the ADLM Facebook page).
2. Business settings → Business info: add the legal name, address and website
   (adlmstudio.net). Meta checks these against the documents in step 5.

## 2. The WhatsApp app

1. Go to developers.facebook.com → My Apps → Create app → type **Business**.
   Name it "ADLM Studio", link it to the business portfolio.
2. In the app, add the product **WhatsApp**. Meta gives you a test number to
   try things with.

## 3. The sending number

1. WhatsApp Manager → Phone numbers → **Add phone number**.
2. Use a number that is **not** already on the WhatsApp app (a new SIM, or a
   landline that can take a voice call for the code). A number on WhatsApp
   has to be deleted from the app first.
3. Display name: **ADLM Studio**. Meta reviews it (usually within a day).
4. Note the **Phone number ID** (not the number itself). That is
   `WHATSAPP_PHONE_NUMBER_ID`.

## 4. The code template

1. WhatsApp Manager → Message templates → **Create template**.
2. Category **Authentication**, type **One-time passcode**, button
   **Copy code**. Name it `adlm_verify_code`, language **English**.
3. Tick "Add security recommendation" if offered. Submit. Authentication
   templates are usually approved within minutes.
4. The name is `WHATSAPP_TEMPLATE`.

## 5. Verify the business (needed to message more than a small daily number)

Business settings → Security centre → **Start verification**. Upload the CAC
certificate and a utility bill or bank statement for the address. Until this
is done Meta caps how many people you can message per day.

## 6. A permanent token

1. Business settings → Users → **System users** → Add → role **Admin**.
2. Assign it the app and the WhatsApp account with full control.
3. **Generate new token** → choose the app → permissions
   `whatsapp_business_messaging` and `whatsapp_business_management` →
   expiry **Never**. That is `WHATSAPP_TOKEN`. Treat it like a password.

## 7. Give the three values to the server

Put them in AWS Systems Manager Parameter Store under `/adlm/cloud/prod/`
(one parameter each, SecureString for the token):

| Parameter | Value |
|---|---|
| `WHATSAPP_TOKEN` | the system-user token (step 6) |
| `WHATSAPP_PHONE_NUMBER_ID` | the phone number ID (step 3) |
| `WHATSAPP_TEMPLATE` | `adlm_verify_code` (step 4) |

Then redeploy the API (any push to main that touches `server/` does it). The
button appears for everyone with a WhatsApp number saved.

## Cost

Meta charges per authentication message, about US$0.005 to $0.03 in Nigeria
depending on the current rate card: roughly $3 to $18 per 600 verifications.
