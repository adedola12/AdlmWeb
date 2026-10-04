---
id: cloud-sharing
title: ADLM Cloud: sharing, team and Ada
tagline: Share a dashboard with your client, invite collaborators, control what they see, and get answers from Ada.
version: "2026.09"
updated: 2026-10-01
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Sharing-Guide.pdf
order: 10.5
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers the workspace as it is on the live site at the start of October 2026.

## Sharing and collaborators

There are two ways to let someone else see a project. They are not the same.

| | Public dashboard link | Collaborator |
|---|---|---|
| Who it is for | A client with no ADLM account | A colleague or consultant who will work on the project |
| Sign-in needed | No | Yes, with their own account and the matching product licence |
| What they see | A summary dashboard only | The whole project, at **View only** or **Full access** |
| Can edit | No | Only with **Full access** |

### Sharing a dashboard with your client

1. Open the project's **Dashboard**.
2. Click **Share dashboard**.
3. Tick **Enable public link**.
4. Click **Copy link** and send it to your client.

The button then reads **Shared · link on**. Your client sees a read-only Project Dashboard: overall status, progress, the contract sum and its make-up, cost to date and forecast, interim certificate totals, and the planned and actual spend. They cannot edit anything.

> **Important:** Anyone who has the link can open the dashboard. When you no longer want it shared, untick **Enable public link**. Ticking it again brings back the same link.

Only the project owner can turn the public link on or off.

### Inviting collaborators

1. Open the project and click **Collaborators**.
2. Under **Access level**, choose **View only** or **Full access**.
3. Optionally fill in **Label (optional)** (for example the firm's name), **Restrict to emails (optional)** and **Max uses (0 = unlimited)**.
4. Click **Generate code**.
5. Under **Active codes**, click **Copy** to copy the code, or **Link & QR** for a join link and QR code. **Copy link** copies the link and **Download QR** saves the QR image.

Send the code or link to your colleague. **People with access** lists everyone who has joined. You can change each person between **View only** and **Full access**, or click **Remove**. **Revoke** stops a code being used again.

### Joining a project someone shared with you

You can use either a link or a code.

- **With a link or QR code:** open it. Sign in if asked. The page shows **Joining project…** and then opens the project.
- **With a code:** open the project list for that product, click **Add shared project**, type the **Share code** and click **Add project**.

If you do not have the matching product, you see **Subscription required** and a button to get it. A code that has been revoked, has reached its use limit or is restricted to other emails is refused.

### What collaborators can see and do

| | Owner | Full access | View only |
|---|---|---|---|
| Edit rates and progress | Yes | Yes | No |
| Download exports and reports | Yes | Yes | No |
| Invite people, delete, public link | Yes | No | No |
| See rates and money | Yes | Only with a Rate Gen licence | Only with a Rate Gen licence |

A collaborator without an active Rate Gen licence sees the message **Rates hidden. A RateGen subscription is required to view rates.** For them, rates and money totals show as a dash (on project cards this appears as **Money hidden**), bill and budget exports are refused, and they cannot raise variations, rebuild the schedule or price services.

## Team

**Team** under Manage (`/manage/team`) shows your account's seats and the machines they are activated on.

- **Members** lists the account holder. Adding colleagues to one account is not available yet, so each person signs in with their own ADLM account. To work together on a project, use [collaborators](#inviting-collaborators).
- **Machines** lists the computers holding a seat. To move a seat to a new computer, click **Free the seat** on the old one and then install on the new one. Nothing is deleted.
- **Seats per product** and **Free activations** show how many seats you own and how many are free right now. **Buy more seats** opens the purchase page.

## Ada, your assistant

Ada is ADLM's assistant. Click **Ask Ada** at the bottom of any page, or in the left-hand menu.

- Anyone can ask Ada about products, prices, trainings, downloads and material quantities. The suggestion buttons **Products**, **Trainings**, **Software downloads** and **Material quantities** are a quick start.
- When you are signed in, Ada can also answer questions about your own projects and account, for example which projects have a 3D model, or what a project's bill or budget comes to. She only reads your own data.
- Ada answers from what ADLM publishes. If she does not know, she says so.
- To talk to a person, choose **Chat on WhatsApp** in one of her answers.

Ada is not a quote. Use the quote page for prices you can rely on.

> **Note:** ADLM can set a usage allowance for Ada. If you reach it, she tells you and offers WhatsApp instead until the allowance resets.

## Troubleshooting

### Rates show as dashes on a shared project

You are a collaborator without an active Rate Gen licence. Rates and money stay hidden until you have one. The project owner always sees them.

### "Subscription required" when I open a share link

You need an active licence for the product the project was made in (for example HERON for a HERON project). Click the button on the page to get it, then open the link again.

### The share code does not work

The code may have been revoked, reached its use limit, or been limited to other email addresses. Ask the owner for a new code.

## Frequently asked questions

### Can my client see the project without an ADLM account?

Yes. Turn on **Share dashboard** and send the link. Your client sees a summary dashboard and cannot change anything.

### What is the difference between View only and Full access?

**View only** collaborators can look but cannot edit or download. **Full access** collaborators can edit rates and progress and download exports. Neither can invite others, delete the project or share it publicly; only the owner can.

### Can I add colleagues to my account?

Not yet. Each person uses their own ADLM account. Share individual projects with them as collaborators.

### Where do I get help?

Ask Ada, chat with us on WhatsApp, or raise a ticket from **Support** (`/manage/support`).
