---
id: installer-hub
title: ADLM Installer Hub
tagline: Sign in once, then install, update and repair every ADLM product your licence covers.
version: "2.0"
updated: 2026-10-01
platform: Windows 10 and 11 desktop app (64-bit)
productKeys: []
pdf: ADLM-Installer-Hub-User-Guide.pdf
order: 1
---

The ADLM Installer Hub is the Windows app that puts your ADLM software on your computer. You sign in with your ADLM account, and the Hub shows the products your subscription covers, installs them in the right folders, tells you when an update is ready and repairs a broken install. You never copy files or hunt for folders yourself. This guide covers Installer Hub 2.0, the version you download from the ADLM website today.

## Before you start

### What you need

| You need | Why |
|---|---|
| A Windows 10 or Windows 11 PC, 64-bit | The Hub does not run on Mac, older Windows or 32-bit Windows. |
| Administrator rights on that PC | The Hub writes plugins into shared program folders, so Windows asks for administrator approval. |
| Your ADLM account | The same email (or username) and password you use on adlmstudio.net. There is no separate Hub account. |
| An active licence for at least one ADLM desktop product | The Hub download comes with a paid licence. It installs only what your account has bought. |
| An internet connection | Needed to sign in, load your products and download them. |
| The host program, for plugins | Revit for QUIV for Revit and the Revit MEP plugin, PlanSwift for ADLM Heron, Civil 3D for CIVIQ, Archicad for QUIV for ArchiCAD. Install the host program first. |

> **Note:** If your company bought the licences, sign in with the account that made the purchase. Licences belong to the account that bought them, not to whoever uses the computer.

### Where to download the Hub

1. On the computer you want to install on, sign in at [adlmstudio.net](/login).
2. Open your [dashboard](/dashboard).
3. Click **Download Installer Hub**. (On the newer Downloads page the button reads **Download the Installer Hub**.)
4. Save the setup file. It is a normal Windows installer (.exe).

> **Note:** The download button only appears when your account has an active licence for a desktop product. If you do not see it, check your subscription on the website, or [contact support](/support).

### How many computers

Each licence seat is tied to one computer, the first one you install the product on. You can install, update and repair as often as you like on that computer. To use a seat on a different computer, you first free it from the old one. See [Licences and your computers](#licences-and-your-computers).

## Install the Hub on your PC

You do this once per computer.

1. Double-click the setup file you downloaded.
2. If Windows shows a blue **Windows protected your PC** screen, click **More info**, then **Run anyway**. This appears because the setup file is new to Windows. It is safe to continue if you downloaded it from adlmstudio.net.
3. Windows asks "Do you want to allow this app to make changes to your device?". Click **Yes**.
4. If you want a desktop icon, tick the desktop shortcut box. It is off by default.
5. Click **Install**. Setup chooses the install folder for you.
6. On the last page, leave the launch box ticked and click **Finish** to open the Hub.

The Hub appears in the Start menu as **ADLM Installer Hub**.

> **Important:** If the **Yes** button on the Windows prompt is greyed out, or Windows asks for an administrator password, your Windows account is a standard user. Ask whoever manages the PC to approve it, or to install the Hub for you. The Hub cannot install plugins into program folders without administrator rights.

> **Tip:** Every time the Hub opens, Windows may ask for administrator approval again. That is expected. Click **Yes**.

### Updating from an older Hub

If you already have Installer Hub 1.x, download the 2.0 setup from the website and run it. It installs over the old version. If the Hub is open, setup offers to close it first. The list of products you have installed on this PC is kept.

The Hub does not update itself. When ADLM releases a new Hub, download the new setup from the website the same way.

## Sign in

The first screen is **Secure Sign In**.

1. In **Email or username**, type your ADLM email or username.
2. In **Password**, type your ADLM website password.
3. Click **Sign in to dashboard**, or press <kbd>Enter</kbd>.

The button stays greyed out until both boxes have text in them. After a few seconds the Hub loads your products, checks what is already installed on this PC, compares versions and opens the dashboard.

> **Note:** In version 2.0 the Hub does not keep you signed in. You sign in each time you open it. Closing the window signs you out.

### If sign-in does not work

Any problem shows in red above the sign-in button.

| What you see | What it means and what to do |
|---|---|
| **Invalid email, username, or password.** | The details do not match. Passwords are case-sensitive. Reset your password on the website, then try again with the new one. |
| **We couldn't reach the server. Please check your internet connection and try again.** | The Hub could not reach ADLM. Check your internet. On an office network, ask IT to allow the Hub to reach adlmstudio.net. |
| **The request timed out. Please check your connection and try again.** | The connection is too slow or dropped. Try again on a steadier connection. |
| **Your ADLM account is not allowed to sign in right now.** | The account is on hold. [Contact support](/support). |
| **The ADLM server is temporarily unavailable. Please try again.** | A short outage on our side. Wait a few minutes and try again. |
| **Your session has expired. Please sign in again.** | You left the Hub open for a long time. Sign in again. |

> **Tip:** If sign-in fails three times, stop retrying. Use WhatsApp support (see [Getting help](#getting-help)) and send the exact red message.

### Switching accounts

Click **Sign out** at the bottom of the sidebar. The Hub returns to the sign-in screen. Products already installed on the PC stay installed.

## Find your way around

The sidebar on the left switches pages. The bar across the top has the search box, **Refresh**, and your name and email.

| Page | Use it to |
|---|---|
| **Dashboard** | See a summary of your account and this PC. |
| **Installation Center** | Install, update and repair your products. You will spend most of your time here. |
| **Free Software** | Install or download free ADLM tools. |
| **Subscriptions** | Check licence status, seats, expiry dates and billing notes. |
| **Install History** | See what is installed on this PC, which version, and when. |

At the bottom of the sidebar you will find the **Need help?** card with **Chat on WhatsApp**, **Raise a ticket** and **Download User Guide**, then the theme switch and **Sign out**.

### The Dashboard page

The Dashboard greets you with **Welcome back** and your name, and a line such as "2 active subscription(s), 1 installed, 0 pending, 1 update(s) available." Below it are four counters:

| Counter | What it counts |
|---|---|
| **Subscribed products** | Everything your account has bought, installed here or not. |
| **Active subscriptions** | Of those, how many are in force and not expired. |
| **Installed on this device** | How many are installed on this PC. |
| **Total orders** | How many purchases are recorded on your account. |

### Search and Refresh

Type in the search box to filter products by name. Clear it to see everything again.

Click **Refresh** to read your account again from the server. Use it after you buy or renew something, when a product you expect is missing, or when you have been told an update is out. Refresh also re-checks what is installed on this PC.

### Light and dark mode

Click **☽ Dark mode** at the bottom of the sidebar to switch the Hub to dark. The button then reads **☀ Light mode**. The Hub remembers your choice.

## The Installation Center

Click **Installation Center** in the sidebar. Each product your account has bought appears as a card. Products you have not bought are not shown.

If you see "No purchased products are ready for installation on this account yet", your account has no active purchase on record. Click **Refresh**. If it stays empty, check your orders on the website or [contact support](/support).

### Reading a product card

Each card shows, from top to bottom:

- The product name and its short key (for example **revit** for QUIV for Revit, **planswift** for ADLM Heron). Quote the key when you contact support.
- A status badge, top right.
- A short description.
- Your licence, for example "Personal license • Seats 1/1".
- The expiry date, for example "Expires 12 Mar 2027", or "No expiry date on record".
- Your billing plan, for example "Monthly plan • Install fee included".
- Where the package comes from and its version.
- What is installed on this PC, for example "Installed on 14 Sep 2026, 10:12 AM. Version 3.1.9 on OFFICE-PC."
- The main button, **Reinstall** (once installed), and **Hide**.

### What the badge and button mean

| Badge | Main button | Meaning |
|---|---|---|
| **Ready** | **Install** | Bought, licence active, package published. Ready to install. |
| **Installed** | **Installed** (greyed out) | Installed here and up to date. Use **Reinstall** to repair it. |
| **Update** | **Update** | A newer version is out. Click to install it over the old one. |
| **Pending** | **Install** | Your purchase is approved but ADLM still has to complete the set-up on our side. |
| **Package pending** | **Package pending** (greyed out) | Your licence is fine but the installer has not been published yet. Check back later. |
| **Expired** | **Unavailable** (greyed out) | The subscription has run out. Renew on the website, then click **Refresh**. |
| **Inactive** | **Unavailable** (greyed out) | The subscription is not active, usually a payment or account hold. [Contact support](/support). |

While an install runs, the button reads **Installing...**.

## Install a product

Most installs finish in a couple of minutes.

1. Close the host program if you are installing a plugin: Revit, PlanSwift, Civil 3D or Archicad. Check the Windows system tray as well.
2. Click **Installation Center** in the sidebar.
3. On the product's card, click **Install**.
4. If the Hub asks you to choose your Revit version, pick it and click **Continue Install** (see below).
5. Wait while the progress panel runs. When it shows **Complete**, the button changes to **Installed**.

### Choosing your Revit version

QUIV for Revit and the Revit MEP plugin need to know which year of Revit you use, because each year loads add-ins from a different folder.

- If the Hub finds only one Revit on your PC, it uses it without asking.
- If it finds more than one, the **Choose Your Revit Version** window opens. Pick the year from **Revit Version** and click **Continue Install**.
- If your Revit year is not in the list, type the four-digit year (for example 2025) into the box.
- Click **Cancel** to stop the install. Nothing is changed.

> **Tip:** To add the plugin to a second Revit year, click **Reinstall** on the card and choose the other year. Do this again after each update so every Revit year gets the new version.

### ADLM Heron needs PlanSwift first

ADLM Heron installs into PlanSwift. If PlanSwift is not on the PC, the Hub stops with "PlanSwift is not installed on this machine. Please install PlanSwift before installing the ADLM Plugin." Install PlanSwift, then click **Install** again.

### Watching the progress

During an install, a panel covers the card with a progress bar, the current step, a detail line and a percentage. The steps you may see:

| Step | What is happening |
|---|---|
| **Preparing** | Checking your licence and where the files should go. |
| **Downloading** / **Downloaded** | Fetching the package from ADLM. The detail line shows how much has arrived. |
| **Cached** | The package was downloaded before and is being reused, which makes reinstalls fast. |
| **Retrying** | The download dropped. The Hub tries again on its own, up to three times. |
| **Verifying** | Checking the download is complete and has not been tampered with. |
| **Extracting** / **Extracted** | Unpacking the files. |
| **Cleaning** / **Cleanup** | Removing the older version so it cannot clash with the new one. |
| **Running** / **Launching** | Running the product's own installer, or starting it. |
| **Complete** | Done. |

A **Cancel** button is available while it is safe to stop. When you click it, the button reads **Cancelling...** while the Hub finishes the current step safely, then stops. Click **Install** again when you are ready.

### After the install

- **Revit, Civil 3D and Archicad plugins:** start the host program. Plugins load when the program starts, so if it was open, close it and open it again.
- **ADLM Heron:** start PlanSwift. See the [ADLM Heron guide](/guides/heron) for the first steps.
- **Standalone apps** (ADLM RateGen, ADLM Time Pro): open them from the shortcut the Hub created.

The **Installed on this device** counter goes up by one and the product appears on the **Install History** page.

## Update a product

Updates install over the old version. You do not need to uninstall first.

### How you know an update is waiting

- The Dashboard line says how many updates are available.
- The card's badge changes to **Update**, and the main button reads **Update**.
- The card says "Update available: version ... Click Update to install the newer build."

### To update

1. Close the program you are updating (Revit, PlanSwift, Civil 3D, Archicad or the ADLM app).
2. Click **Update** on the card.
3. Wait for **Complete**, then open the program again.

> **Note:** Updating replaces program files only. Your projects, saved rates, templates and preferences are kept.

> **Tip:** Told an update is out but you do not see it? Click **Refresh**. The Hub checks the published version against what is installed and the badge changes if an update is ready.

## Repair, hide and remove

### Repair with Reinstall

When a product is installed and up to date, a **Reinstall** button sits beside the main button. It installs the same version again from scratch. Use it when:

- the plugin no longer appears in Revit, PlanSwift, Civil 3D or Archicad;
- antivirus removed or damaged some files;
- a shortcut has gone missing;
- you want the Revit plugin in another Revit year.

Reinstalling does not use another licence seat.

### Hide a card

If your account carries a product you never use on this PC, click **Hide** on its card. The card disappears from view. The licence and anything installed are not touched.

A **Show 1 hidden** (or **Show 2 hidden**, and so on) button then appears next to the search box. Click it to bring every hidden card back. Hidden cards also come back when you click **Refresh** or sign in again.

### Remove (uninstall) a product

Installer Hub 2.0 installs, updates and repairs, but it does not remove products. To remove one:

1. Open Windows **Settings**, then **Apps**, then **Installed apps**.
2. If the product is listed, click it and choose **Uninstall**.
3. If it is not listed (most plugins are copied into place by the Hub and do not appear there), [contact support](/support) and we will help you remove it.

> **Important:** Hiding a card is not the same as uninstalling. Hidden products stay on your PC and keep working.

### Uninstall the Hub itself

1. Open Windows **Settings**, then **Apps**, then **Installed apps**.
2. Find **ADLM Installer Hub** and choose **Uninstall**.
3. Windows asks whether to also remove your Installer Hub settings and data (theme and installation history) for all users on this computer. Choose **No** to keep them, or **Yes** to remove them.

Removing the Hub does not remove the products it installed.

## Free Software

Click **Free Software** in the sidebar for free ADLM tools, templates and utilities. You only need to be signed in.

- Items packaged for the Hub show **Install**. They install like a paid product, with the same progress panel, and then read **Installed**.
- Other items show **Download**. The file opens in your browser and saves to your Downloads folder. Open it from there.

## Subscriptions and Install History

### Subscriptions

The **Subscriptions** page lists every product on your account with its licence type and seats, expiry date, billing plan and a status badge. Nothing is installed from here. Use it to check what you own and when it runs out. To renew, go to the website and then click **Refresh** in the Hub.

### Install History

The **Install History** page shows what is installed on this PC, which version, when, and anything still waiting for ADLM to complete. Take a screenshot of this page when you report a problem. It tells us exactly which version you have.

## Licences and your computers

Each licence seat belongs to one computer. When you install a product for the first time, the Hub registers that seat to the PC you installed it on.

### What this means day to day

- Install, update and reinstall as often as you like on that PC. It never uses up another seat.
- You can sign in to the Hub on any computer and see your products. Installing on a new one is what needs a free seat.
- If you have more seats than computers, ADLM can add seats to your plan. Ask support.

### The message you see on a second computer

If every seat on a licence is already in use on other computers, the Hub stops with **Device Not Authorized** and the message "[Product] is bound to another device. Contact admin to revoke the existing device or increase seat count." Nothing is installed and nothing is lost. Free a seat (below), click **Refresh**, then **Install** again.

### Moving to a new computer

1. If you still have the old computer, close the ADLM products on it.
2. On the website, sign in and open [Settings](/manage/settings). Under **Machines signed in**, find the old computer and click **Sign out**, then confirm. This frees its seat straight away and deletes nothing on that machine.
3. On the new computer, download and install the Hub (see [Install the Hub on your PC](#install-the-hub-on-your-pc)).
4. Sign in, go to **Installation Center** and click **Install** on each product.

If you cannot sign the old machine out yourself, use **Chat on WhatsApp** or **Raise a ticket** with your account email and the product name, and ADLM will free it for you.

> **Tip:** Replacing or reformatting a PC? Free its seat on the website before you wipe it. Reinstalling on the rebuilt PC is then straightforward.

### "Device Registration Notice" after an install

Occasionally the product installs but the Hub cannot update your seat on the server. You see **Device Registration Notice**. The product is installed. If the product then reports a device mismatch when you open it, free the old machine on the website as above, or contact support.

## Working without internet

The Hub needs an internet connection to sign in, load your products and download installers. Installer Hub 2.0 has no offline mode.

- If you lose connection while signed in, **Refresh** fails with a message about the server.
- If the Hub cannot fetch the latest package list from ADLM, it will not install from its built-in list. You see **Server Unreachable** and the install stops, so you never get an out-of-date build that cannot sign in. Reconnect, click **Refresh**, and install again.
- Products you have already installed are not affected by the Hub being offline. How each product behaves without internet is covered in its own guide.

## Getting help

The **Need help?** card at the bottom of the sidebar has three buttons:

- **Chat on WhatsApp** opens WhatsApp with a message to ADLM support already started. This is the fastest route for a stuck install or a seat that needs freeing.
- **Raise a ticket** opens the ADLM [support page](/support) in your browser with your account email and Hub version filled in. Best for billing, seat changes, or a problem with screenshots.
- **Download User Guide** opens the illustrated PDF guide.

When you report a problem, include the product name and key (for example **revit**), the exact wording of any message, the step it stopped on, your Revit or PlanSwift version, and a screenshot of the card and the **Install History** page.

## What's new in 2.0

**Installer Hub 2.0 (28 September 2026)**

- **"Update available" no longer sticks.** Products could show an update every time you refreshed, even straight after updating. The Hub now recognises the build you have, and only shows **Update** for a genuinely new version.
- **Downloads come from ADLM's own secure storage**, through short-lived private links, instead of a shared file link.
- **A proper Windows installer.** The website download is now a setup file instead of a zip, and setup no longer shows unrelated licence or readme pages.

**Installer Hub 1.0.1 to 1.0.3 (August and September 2026)**

- **No more out-of-date installs when the server is down.** If the Hub cannot get the latest package list, it now stops with **Server Unreachable** instead of installing an old build from its built-in list.
- **ADLM Heron's import package no longer lands on the shared desktop** of every user on the PC.
- The Hub installs the latest released build of each product as soon as ADLM publishes it.

**Installer Hub 1.0 (July 2026)**

- Sign in once and install every ADLM product from one place.
- **Download User Guide** button in the sidebar.
- Each product card shows its own artwork.
- **Launch** at the end of setup now works.
- Uninstalling the Hub asks before deleting your settings, and keeps them by default.

> **Note:** A redesigned Installer Hub is being tested by the ADLM team. This guide will be updated when it is released.

## Troubleshooting

### Windows says "Windows protected your PC" when I run setup

This is Windows SmartScreen. It appears for installers that are new to Windows. Click **More info**, then **Run anyway**. Only do this for a setup file you downloaded from adlmstudio.net.

### The Windows prompt says "Unknown publisher"

That is expected for the current setup file. If you downloaded it from your ADLM dashboard, click **Yes**.

### My antivirus blocked or deleted the setup or a plugin

Some security products quarantine newly downloaded files. Signs: setup will not start, an install fails at **Extracting**, or a plugin disappears after working. Restore the file from your antivirus quarantine, or ask IT to allow the ADLM Installer Hub and the ADLM install folders, then use **Reinstall**.

### The install fails with "Access denied" or "file in use"

The program you are installing into is still running. Close Revit, PlanSwift, Civil 3D, Archicad or the ADLM app completely (check the system tray), then click **Install** or **Reinstall** again.

### I installed while Revit was open

The Hub does not stop you, but Revit holds its plugin files open. You may see **Cleanup skipped** with "Revit is running - close Revit and reinstall to remove old version folders." Close Revit, click **Reinstall**, then open Revit again.

### Revit cannot see the plugin

1. Close Revit fully. Plugins load only when Revit starts.
2. Open Revit again.
3. If it is still missing, click **Reinstall** in the Hub and choose the Revit year you actually use.

If you see a message that the add-in was installed but its files do not exist, the wrong Revit year was chosen or a copy failed. Close Revit, click **Reinstall** and pick the correct year.

### I cannot sign in

Check the red message against the table in [If sign-in does not work](#if-sign-in-does-not-work). The most common causes are a mistyped password (passwords are case-sensitive), no internet, and signing in with a personal email when the licence is on the company account.

### The website says "Failed to fetch", or the Hub cannot reach the server even though my internet works

Some office networks, firewalls or security products block or cut short the sign-in details sent with each request. Between July and September 2026 some large company accounts also hit this because of a problem on our side, which was fixed on 29 September 2026.

1. Sign out of the Hub and the website, then sign in again.
2. On the same computer, open [adlmstudio.net/network-check](/network-check) in your browser. It runs a set of tests and shows what is blocked.
3. If something fails, click **Copy results**, or quote the reference code it shows, and send it to support on WhatsApp.

### My product is not in the Installation Center

1. Click **Refresh**.
2. Look for a **Show ... hidden** button next to the search box. You may have hidden it.
3. Check you are signed in with the account that bought the licence (your name and email show top right).
4. Check the subscription on the website. If it is new, it may still be waiting for ADLM to complete set-up.

### The button says "Package pending" or "Unavailable"

**Package pending** means your licence is fine but the installer is not published yet; check back later. **Unavailable** means the subscription is expired or inactive; renew on the website, then click **Refresh**.

### "Package integrity check failed"

The download was damaged on the way. Click **Install** again and the Hub fetches a fresh copy. If it keeps happening, contact support.

### "Server Unreachable" when I click Install

The Hub could not get the latest package list from ADLM, so it stopped rather than install an old build. Check your connection, click **Refresh**, and try again.

### The Hub will not start

Right-click the **ADLM Installer Hub** shortcut and choose **Run as administrator**. If Windows refuses, your account does not have administrator rights. Ask whoever manages the PC.

### Downloads are very slow

Packages can be large. Leave the Hub running; it retries a dropped download up to three times. A steadier connection helps.

### The single most useful fix

Close the host program, click **Refresh**, then click **Install** or **Reinstall** again. That solves most problems.

## Frequently asked questions

### Do I need a separate account for the Hub?

No. Use the same email or username and password as the ADLM website.

### Why do I have to sign in every time?

Installer Hub 2.0 does not save your session. Signing in each time keeps your account safe on shared computers.

### Does the Hub keep my password?

No. Your password is sent once to sign you in and then cleared. The Hub keeps only a temporary sign-in while it is open.

### Can I install on more than one computer?

One seat covers one computer. To use a product on a second computer at the same time, you need another seat. To move it, free the old computer on the website first.

### Does reinstalling or updating use up a seat?

No. Install, update and reinstall as often as you need on the same computer.

### What happens to my installed products if I sign out or close the Hub?

Nothing. They stay installed and keep working. The Hub is only needed to install, update and repair.

### Does the Hub update itself?

No. When ADLM releases a new Hub, download the setup again from your dashboard and run it over the old one.

### Does the Hub have keyboard shortcuts or a connection signal indicator?

Not in version 2.0. Use the mouse and the buttons described in this guide.

### Can my IT team install the Hub for everyone?

Yes. The Hub uses standard Windows install locations. It needs outbound internet access to adlmstudio.net and the ADLM download service. Each person then signs in with the account that holds the licence.

### Where are the guides for the products themselves?

See [QUIV for Revit](/guides/quiv), [ADLM Heron](/guides/heron), [ADLM RateGen](/guides/rategen) and the other guides on the [guides page](/guides).
