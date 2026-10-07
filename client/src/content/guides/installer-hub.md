---
id: installer-hub
title: ADLM Installer Hub
tagline: Sign in once, then install, update, open and repair every ADLM product your licence covers.
version: "2.0"
updated: 2026-10-07
platform: Windows 10 and 11 desktop app (64-bit)
productKeys: []
pdf: ADLM-Installer-Hub-User-Guide.pdf
order: 1
---

The ADLM Installer Hub is the Windows app that puts your ADLM software on your computer. You sign in with your ADLM account. The Hub then shows the products your subscription covers and installs each one where its host program looks for it. It tells you when an update is ready, opens your products and repairs a broken install. You never copy files or hunt for folders yourself.

This guide covers the redesigned Installer Hub, **from Hub 2.0 (rolling out)**. ADLM is moving customers onto it in stages. Until then, the website download is the earlier 2.0 build, with a dark sidebar and a **Secure Sign In** screen. Products, licences and seats work the same way in both; only the screens differ. When the new design reaches you, download the setup again and run it over the old Hub.

## What's new in Hub 2.0 (rolling out)

- **A new look, built on Richard Enoch's design**, in light, dark or **Match Windows**. The sidebar has **Dashboard**, **Installation Center**, **Free software**, **Subscriptions**, **Install history**, and an **ACCOUNT** group with **Profile**, **Settings** and **Help and contact**.
- **A splash screen that turns into the sign-in**, with **Forgot password?**, **Work offline** and **Remember my email on this PC**.
- **Releases read as names**: **QUIV 4.0**, **HERON 3.0**, and buttons such as **Update to HERON 3.0**.
- **A Dashboard that says what needs you**, with **Update all**, and the host programs found on this PC.
- **Filters and search** in the Installation Center: **All**, **Installed**, **Updates** and **Available**.
- **Open** on every installed product and free tool.
- **A network signal** in the header for your connection to ADLM Cloud.
- **Work offline**, a local **Install history** you can export, **keyboard shortcuts** (<kbd>F1</kbd>), and messages shown inside the Hub instead of Windows pop-ups.
- **Settings** for **Relink this PC**, **Clear the download cache** and **Export a diagnostic report**, and a **Help and contact** page that sends your account, machine and Hub version with your message.

## Before you start

### What you need

| You need | Why |
|---|---|
| A Windows 10 or Windows 11 PC, 64-bit | The Hub does not run on Mac, older Windows or 32-bit Windows. |
| Administrator rights on that PC | The Hub writes plugins into shared program folders, so Windows asks for administrator approval. |
| Your ADLM account | The same email (or username) and password you use on adlmstudio.net. There is no separate Hub account. |
| An active licence for at least one ADLM desktop product | The Hub download comes with a paid licence. It installs only what your account covers. |
| An internet connection | You need it to sign in, load your products and download them. Without it you can still work offline (see [Working offline](#working-offline)). |
| The host program, for plugins | Revit for QUIV for Revit and SERVIQ (Revit MEP), PlanSwift for HERON, Civil 3D for CIVIQ, Archicad for QUIV for ArchiCAD. Install the host program first. |

> **Note:** If your company bought the licences, sign in with the account that holds them. Licences belong to the account, not to whoever uses the computer.

### Where to download the Hub

1. On the computer you want to install on, sign in at [adlmstudio.net](/login).
2. Open **Downloads** in your account ([/manage/downloads](/manage/downloads)).
3. Click **Download the Installer Hub**.
4. Save the setup file. It is a normal Windows installer, saved as ADLM-Installer-Hub-Setup.exe.

> **Note:** The download button only appears when your account has an active licence for a desktop product. Without one, the page says the Hub comes with a licence and links to the products. If you think that is wrong, [contact support](/support).

### How many computers

Each licence seat is tied to one computer. You can install, update and repair as often as you like on that computer. To use a seat on a different computer, free it from the old one first. See [Your devices and moving a licence](#your-devices-and-moving-a-licence).

## Install the Hub on your PC

You do this once per computer.

1. Double-click the setup file you downloaded.
2. If Windows shows a blue **Windows protected your PC** screen, click **More info**, then **Run anyway**. Do this only for a file you downloaded from adlmstudio.net.
3. Windows asks "Do you want to allow this app to make changes to your device?". Click **Yes**.
4. If you want a desktop icon, tick the desktop shortcut box. It is off by default.
5. Click **Install**. Setup chooses the folder for you.
6. On the last page, leave the launch box ticked and click **Finish** to open the Hub.

The Hub appears in the Start menu as **ADLM Installer Hub**. Only one copy of the Hub runs at a time. If you open it again while it is running, the window that is already open comes to the front.

> **Important:** If the **Yes** button on the Windows prompt is greyed out, or Windows asks for an administrator password, your Windows account is a standard user. Ask whoever manages the PC to approve it, or to install the Hub for you.

### Updating from an older Hub

Download the setup from the website again and run it. It installs over the old version. If the Hub is open, setup offers to close it first. The record of what you installed on this PC is kept.

The Hub does not update itself. **Check for updates** inside the Hub checks your products, not the Hub. When ADLM releases a new Hub, download it from the website the same way.

## First run and sign-in

### The splash screen

When the Hub starts, a card shows the ADLM Installer Hub mark and its version. The line under it tells you what the Hub is doing:

1. **Starting the Hub**
2. **Reading what is installed on this PC**
3. **Looking for Revit, PlanSwift and Excel**
4. **Ready**

After a couple of seconds the same card turns into the sign-in form.

### Sign in

![The Installer Hub sign-in window with Email, Password, Log in, Forgot password and Work offline.](shot:hub-sign-in.png)

1. In **Email or username**, type your ADLM email or username.
2. In **Password**, type your ADLM website password. Click the eye icon to show what you typed.
3. To have the Hub fill in your email next time, tick **Remember my email on this PC**. It never saves your password.
4. Click **Log in**, or press <kbd>Enter</kbd>. The button reads **Signing in…** while it works.

The Hub loads your products, compares them with what is on this PC and opens the **Dashboard**. A note in the corner says **Signed in**, and tells you how many products have an update waiting.

> **Note:** The Hub does not keep you signed in. You sign in each time you open it. Closing the window signs you out. Your installed products keep working.

**Forgot password?** opens the ADLM sign-in page in your browser, where you can reset your password. The Hub uses the new password the next time you sign in.

**Work offline** opens the Hub without signing in. See [Working offline](#working-offline).

### If sign-in does not work

The Hub shows the problem in red above the **Log in** button.

![The sign-in window showing the message when no email is entered.](shot:hub-sign-in-error.png)

| What you see | What it means and what to do |
|---|---|
| **Enter the email address or username your subscription is on.** | The email box is empty. Type your ADLM email or username. |
| **Enter your password.** | The password box is empty. |
| **Invalid email, username, or password.** | The details do not match. Passwords are case-sensitive. Reset your password on the website, then try again. |
| **We couldn't reach the server. Please check your internet connection and try again.** | The Hub could not reach ADLM. Check your internet. On an office network, ask IT to allow the Hub to reach adlmstudio.net. |
| **The request timed out. Please check your connection and try again.** | The connection is too slow or dropped. Try again on a steadier connection. |
| **Your ADLM account is not allowed to sign in right now.** | The account is on hold. [Contact support](/support). |
| **The ADLM server is temporarily unavailable. Please try again.** | A short outage on our side. Wait a few minutes. |
| **Your session has expired. Please sign in again.** | You left the Hub open for a long time. Sign in again. |

> **Tip:** If sign-in fails three times, stop retrying. Message support on WhatsApp with the exact red message.

### Sign out or switch accounts

1. Click **Sign out** at the bottom of the sidebar.
2. The Hub asks **Sign out of the Hub?**. Click **Sign out**, or **Stay** to cancel.

Installed products keep working, and your seats stay held on this PC.

## Find your way around

### The window

A Windows-style title bar has **Minimise**, **Maximise** and **Close**. The sidebar on the left switches pages, and the **Installation Center** shows a count of your products. The header across the top shows the page title, your name and email, the connection status and **Check for updates**.

### The sidebar pages

| Page | Use it to |
|---|---|
| **Dashboard** | See what needs you, what this PC has, and what is installed. |
| **Installation Center** | Install, update, open and repair your products. You will spend most of your time here. |
| **Free software** | Install free ADLM tools. |
| **Subscriptions** | Check your plan, your products, seats and expiry dates. |
| **Install history** | See every install, update and repair on this PC. |
| **Profile** | See your account, the seats this PC holds and your machines. |
| **Settings** | Change the look, relink this PC, and run the maintenance tools. |
| **Help and contact** | Reach ADLM support. |

At the foot of the sidebar are the **Need help?** card, with **Chat on WhatsApp** and **More ways to reach us**, then **Keyboard shortcuts** and **Sign out**.

### Check for updates

Click **Check for updates** in the header, or press <kbd>F5</kbd>. The button reads **Checking…** while the Hub asks ADLM Cloud for your subscriptions and the latest releases. Then a note says **Checked ADLM Cloud**, with either the number of updates available or **Everything is on its latest version.**

Use it after you buy or renew something, when a product you expect is missing, or when you hear an update is out.

### Small screens

On a narrow window, such as a laptop at 125% scaling, the sidebar folds to icons only and the **Need help?** card is hidden. Hover over an icon to see its name. Pages drop to one column.

## The Dashboard

![The Hub dashboard: what needs you, this PC and the host applications found, and what is installed.](shot:hub-dashboard.png)

The Dashboard has three parts.

**Needs you.** Products that want your attention. Each row has a button:

- **Update**: a newer release is out. The row shows the version you have and the release you will get, for example "v3.1.11 → QUIV 4.0".
- **Renew**: the licence has expired. This opens billing on ADLM Cloud.
- **Waiting**: your purchase is recorded but the package is not released yet.

When two or more updates are waiting, **Update all** installs them one after another. The button shows the number, for example **Update all 3**. When nothing needs you, the heading reads **Everything is up to date**.

**This PC.** The facts the Hub uses to install correctly: **MACHINE**, **WINDOWS**, **SIGNED IN** and **DISK**. Under **HOST APPLICATIONS FOUND** it lists each host program and the years or versions it found, or "not found". The Hub checks these so a plugin never lands where its host is missing.

**Installed on this PC.** A table of **PRODUCT**, **INSTALLED**, **LATEST**, **LICENCE** and **EXPIRES** for everything the Hub has installed here.

## The Installation Center: your product gallery

Click **Installation Center** in the sidebar. Each product appears as a card with its own icon. The gallery shows the products on your plan, and other ADLM products you can add.

![The Installation Center listing every product with its state and the action it needs.](shot:hub-installation-center.png)

### Release names

Cards name releases by their two-digit version, the way people say them: **QUIV 4.0** and **HERON 3.0**. An older release such as 3.1.11 keeps its full number. When an update is waiting, **Version** shows both, for example "v2.9.6 → HERON 3.0".

### Reading a card

Each card shows the product name, a coloured state label and a short description. Then come **Host** (the program it runs in, such as Autodesk Revit or Windows 64-bit), **Version**, **Licence** (your organisation or licence type), **Seats** (for example "1 of 2") and **Expires**. The buttons for what you can do next sit on the right.

### What the state labels mean

| Label | Buttons | Meaning |
|---|---|---|
| **Ready to install** | **Install** | On your plan, licence active, package released. |
| **Installed** | **Open**, **More** | Installed here and up to date. |
| **Update available** | **Update to** (the release), **Open**, **More** | A newer release is out. |
| **Licence expired** | **Renew licence** | The subscription has run out. This opens billing on ADLM Cloud. |
| **Not on your plan** | **Add to plan** | An ADLM product you do not have. This opens its page on the website. |
| **Package pending** | **Tell me when it is out** | Your licence is fine, but the package is **Not released yet**. |

> **Note:** **Open** arrives with the Hub 2.0 rollout. On a build without it, a **Repair** button sits on installed cards instead, and you open the product from the Start menu or its host program as usual.

### Filter and search

Along the top of the gallery:

- **All**, **Installed**, **Updates** and **Available**, each with a count. Click one to show only those cards.
- A search box. Type part of a product name to filter. Press <kbd>Ctrl</kbd>+<kbd>F</kbd> from anywhere to jump to it. If nothing matches, the page says **Nothing matches that.**
- **Update all**, when updates are waiting.

![The Installation Center filtered to products with an update.](shot:hub-installation-updates.png)

## Install a product

Most installs finish in a couple of minutes.

1. If you are installing a plugin, close the host program: Revit, PlanSwift, Civil 3D or Archicad. Check the Windows system tray as well.
2. Click **Installation Center** in the sidebar.
3. On the product's card, click **Install**.
4. If the Hub asks for your Revit year, choose it (see below).
5. Watch the progress bar on the card. When it finishes, a note says the product is installed and the label changes to **Installed**.

![A product installing, with the step it is on and the progress bar.](shot:hub-installing.png)

### Picking your Revit year

QUIV for Revit and SERVIQ (Revit MEP) need to know which year of Revit you use, because each year loads add-ins from its own folder.

- If the Hub finds only one Revit year on your PC, it uses it without asking.
- If it finds more than one, the **Choose Your Revit Version** window opens. Pick the year from **Revit Version** and click **Continue Install**.
- If your year is not in the list, type the four-digit year (for example 2026) into the box.
- Click **Cancel** to stop. Nothing is changed.

> **Tip:** To put the plugin into a second Revit year, click **More**, then **Repair**, and choose the other year. Do this after each update too, so every Revit year gets the new release.

### When the host program is missing

If a card's host program was not found on this PC, the card warns you before you install. For example: "Revit was not found on this PC. Install it first, or install here anyway and the plugin is picked up once Revit is installed."

HERON is the exception. It needs PlanSwift's own folders, so without PlanSwift the install stops with "PlanSwift is not installed on this machine. Please install PlanSwift before installing the ADLM Plugin." Install PlanSwift, then click **Install** again.

### Watching the progress

The line under the progress bar shows the step and the percentage. The steps you may see:

| Step | What is happening |
|---|---|
| **Preparing** | Checking your licence and where the files should go. |
| **Downloading** / **Downloaded** | Fetching the package from ADLM. |
| **Cached** | The package was downloaded before and is being reused, so reinstalls are quick. |
| **Retrying** | The download dropped. The Hub tries again on its own. |
| **Verifying** | Checking the download is complete and has not been tampered with. |
| **Extracting** / **Extracted** | Unpacking the files. |
| **Cleaning** / **Cleanup** | Removing the older version so it cannot clash with the new one. |
| **Running** / **Launching** | Running the product's own installer. |
| **Complete** | Done. |

While it is safe to stop, a **Cancel** button shows. Click it and the button reads **Cancelling...** while the Hub finishes the current step safely. A note then says **Stopped**, and that nothing was changed on this PC.

### After the install

![The Installation Center after an install finishes, with the confirmation message.](shot:hub-installed-toast.png)

- **Plugins** (QUIV, SERVIQ, HERON, CIVIQ, QUIV for ArchiCAD): the note reads, for example, "Registered with Revit. Restart Revit to see the panel." Plugins load when the host starts, so if it was open, close it and open it again.
- **Standalone apps** (Rate Gen, Time Pro): the note says the version is ready to open. Click **Open** on the card, or use the Start menu.

The install is added to **Install history** and to **Installed on this PC** on the Dashboard.

## Open a product

On an installed card, click **Open**. Hover over it to see what it will start, for example "Open Autodesk Revit".

- **Standalone apps** start directly. A note says **Opening** and the app name, and that it can take a few seconds to appear.
- **Plugins** start their host program. For a QUIV card, the Hub opens Revit, and the note says QUIV is on its ribbon once Revit has loaded.

If the Hub cannot find the product where it installed it, a note says the product could not be found. Click **More**, then **Repair**, to put it back.

**Open** is also on installed tools in **Free software**.

## Update a product

Updates install over the old version. You do not need to uninstall first, and your projects, rates, templates and preferences are kept.

### How you know an update is waiting

- **Needs you** on the Dashboard lists it.
- The card's label reads **Update available**, and the button reads **Update to** plus the release, for example **Update to QUIV 4.0**.
- The **Updates** filter in the Installation Center shows a count.
- After you sign in, the **Signed in** note says how many products have an update waiting.

### To update one product

1. Close the program you are updating.
2. Click **Update to** on the card, or **Update** in **Needs you**.
3. Wait for the note that it is updated, then open the program again.

### To update everything

1. Close the host programs.
2. Click **Update all** on the Dashboard or in the Installation Center, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>.

The Hub installs the updates one at a time, because they share the Windows approval prompt and the host programs.

> **Tip:** Heard an update is out but you do not see it? Click **Check for updates**.

## Repair and product details

Click **More** on a card. A card opens with everything the Hub knows about the product on this PC: **State**, **Installed**, **Latest**, **Host**, **Licence**, **Seats**, **Expires** and **Installed on**.

- Click **Repair** to install the same version again over the top.
- Click **Close** to leave it.

Use **Repair** when a plugin no longer appears in its host, antivirus damaged some files, **Open** cannot find the product, or you want the Revit plugin in another Revit year. Repairing does not use another seat. It is logged as **Repaired** in **Install history**.

### Removing a product

The Hub does not remove products. Uninstall from Windows **Settings**, **Apps**, **Installed apps** if the product is listed there. Most plugins are not listed; for those, [contact support](/support).

## Free software

![The Free software screen with the free ADLM tools you can install.](shot:hub-free-software.png)

Click **Free software** for free ADLM tools, templates and utilities. You need no licence, only to be signed in.

- Items packaged for the Hub show **Install**. They install like a paid product and appear in your install history. Once installed, they show **Open**.
- Other items show **Download**. The file opens in your browser and saves to your Downloads folder.

If nothing is listed, the page says nothing is being given away right now.

## Subscriptions

![The Subscriptions screen with each product's licence, seats and expiry.](shot:hub-subscriptions.png)

**Your plan** shows your **ACCOUNT**, **ORGANISATION**, how many **PRODUCTS** are licensed, and the **NEXT RENEWAL**. Plans, invoices and seats are changed on the website, never from a single PC. Click **Manage on ADLM Cloud** to open billing in your browser.

**Seats on this PC** lists each product with its **SEATS** and **EXPIRES** date. A product this machine holds a seat for shows **Release**. Others show **Not held here**. See [Your devices and moving a licence](#your-devices-and-moving-a-licence).

## Install history

Click **Install history** for every install, update and repair on this PC, with **WHEN**, **WHAT**, **ACTION** and **BY**. The action reads **Installed**, **Updated from** the old version, or **Repaired**.

Support asks for this first. To send it:

1. Click **Export the log**.
2. A note says **History exported** and where the file was saved.
3. Attach that file to your support ticket.

## Your devices and moving a licence

Each licence seat belongs to one computer. The first time you install a product, the Hub registers the seat to that PC.

### What this means day to day

Install, update and repair as often as you like on that PC; it never uses another seat. You can sign in to the Hub on any computer, but installing on a new one needs a free seat.

### See your seats and machines

![The Profile screen with the account, this machine and the seats held here.](shot:hub-profile.png)

Click **Profile** in the sidebar.

- The top card shows your name, **Signed in on this PC**, and your **ORGANISATION**, **ROLE**, **ZONE** and **MEMBER SINCE**. To change these, click **Edit on ADLM Cloud**.
- **Seats you are holding here** lists the products this machine is licensed for, with seats and expiry.
- **YOUR MACHINES** lists every computer registered to your account. This computer is tagged **This PC** and the rest **Other PC**, each with the products it holds.

### The message you see on another computer

If a product's seats are all held by other computers, the install stops with **The seat is in use on another PC**. It tells you how many seats are held, for example "1 of 1 held". Nothing is installed and nothing is lost. Free a seat (below), click **Check for updates**, then **Install** again.

### Release a seat from this PC

1. In **Profile** or **Subscriptions**, click **Release** next to the product.
2. The Hub asks **Release the** (product) **seat?** and shows the product, its seats and this machine.
3. Click **Ask support to release it**, or **Keep the seat** to cancel.

For now, ADLM support releases seats for you. The Hub opens WhatsApp with a message to support that already names the product and this machine.

### Move a licence to a new computer

1. If you still have the old computer, close the ADLM products on it.
2. Free the old computer's seat. Either:
    - on the website, open [Account settings](/manage/settings), find the old computer under **Machines signed in**, and click **Sign out**; or
    - on the old computer, click **Release** in the Hub and send the request to support.
3. On the new computer, download and install the Hub (see [Install the Hub on your PC](#install-the-hub-on-your-pc)).
4. Sign in, open **Installation Center** and click **Install** on each product.

> **Tip:** Replacing or reformatting a PC? Free its seat before you wipe it. Installing on the rebuilt PC is then straightforward.

### Relink this PC

If a product says DEVICE_MISMATCH, or will not accept your sign-in on a PC that holds its seat, relink:

1. Open **Settings**.
2. Under **This machine**, click **Relink this PC**.

The Hub registers this PC again for every active subscription. A note says **This PC is relinked**. If some subscriptions are still registered to a different PC, a card says **A device reset is needed**. Chat to support on WhatsApp and give them your account email.

If a product installs but the Hub cannot update its registration, a card says the product is installed and explains what to do if the app reports DEVICE_MISMATCH. Relink first, then contact support if it persists.

## The network signal

Signal bars in the header show how well this PC reaches ADLM Cloud. They sit beside the status text, for example "Online · checked just now". They arrive with the Hub 2.0 rollout. On a build without them, a dot shows instead: green when online and orange when offline.

| Bars | Label | Meaning |
|---|---|---|
| Four, green | **Excellent** | A fast connection to ADLM Cloud. |
| Three, green | **Good** | Everything works normally. |
| Two, amber | **Fair** | Usable, but large downloads take a while. |
| One, red | **Poor** | Slow, or the internet is up but the ADLM server is not answering. Installs and sign-in may fail. |
| Crossed out | **Offline** | No internet connection. What is installed keeps working. |

- Hover over the bars for details: the connection level and its round-trip time, your Wi-Fi signal strength when on Wi-Fi, and when it last checked.
- Click the bars to check again straight away.
- The Hub checks on its own every 20 seconds when online, and every 10 seconds when offline.

## Keyboard shortcuts

The Hub uses the same shortcuts as every other ADLM product. Press <kbd>F1</kbd>, or click **Keyboard shortcuts** at the foot of the sidebar, to see the list. Press <kbd>F1</kbd> or <kbd>Esc</kbd> to close it.

| Keys | What it does |
|---|---|
| <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>/</kbd> | Show keyboard shortcuts |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | Go to Dashboard |
| <kbd>Ctrl</kbd>+<kbd>2</kbd> | Go to Installation Center |
| <kbd>Ctrl</kbd>+<kbd>3</kbd> | Go to Free software |
| <kbd>Ctrl</kbd>+<kbd>4</kbd> | Go to Subscriptions |
| <kbd>Ctrl</kbd>+<kbd>5</kbd> | Go to Install history |
| <kbd>Ctrl</kbd>+<kbd>6</kbd> | Go to Profile |
| <kbd>Ctrl</kbd>+<kbd>7</kbd> | Go to Settings |
| <kbd>Ctrl</kbd>+<kbd>8</kbd> | Go to Help and contact |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> | Search products |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Settings |
| <kbd>F5</kbd> | Check for updates |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd> | Update all |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Switch light / dark mode |
| <kbd>Esc</kbd> | Close the message card that is open |
| <kbd>F12</kbd> or <kbd>Ctrl</kbd>+<kbd>Print Screen</kbd> | Take a screenshot of the Hub |

Screenshots are saved in your Pictures folder, under ADLMInstallerHub, and copied to the clipboard. A note says **Screenshot saved**. They are handy when you report a problem.

## Notifications and messages

The Hub speaks to you in two ways, both inside its own window.

**Notes in the corner.** Short messages that confirm something or warn you, such as **Signed in**, **Checked ADLM Cloud**, (product) **installed**, **Stopped**, **Working offline**, **Package list unavailable** or **Report exported**. They slip away on their own after about four seconds, or about seven for an error. No more than three show at once.

**Cards with buttons.** For anything that needs a decision, or an error you should read, a card opens over the window. Examples are **Sign out of the Hub?**, **The seat is in use on another PC** and (product) **did not install**. Read it, then click a button. <kbd>Esc</kbd> closes it, like clicking the cancel button.

## Working offline

You can open the Hub without an internet connection.

1. On the sign-in screen, click **Work offline**.
2. The Hub opens with **Working offline** in place of your name, and a banner across the top: "Working offline. The Hub shows what is installed on this PC; installs, updates and licences wait until you sign in."

![The Hub dashboard when working offline.](shot:hub-offline.png)

While offline:

- the Dashboard and Installation Center show what is installed on this PC;
- installs, updates and licence changes wait; clicking **Install** shows a note that the product installs once you are signed in and online;
- the header reads "Offline · not since you signed in";
- **Sign out** becomes **Back to sign-in**. Use it to sign in when you are connected again.

If you lose connection while signed in, the banner reads "No connection to ADLM Cloud. What is installed still works; installs and updates resume when you are back online."

> **Important:** If the Hub cannot fetch the latest package list from ADLM, it will not install from the list it was built with. That list can point at older builds that cannot sign in. You see **Cannot install** (product) **right now**, and the install stops. Reconnect, click **Check for updates**, and install again.

Products you have already installed do not need the Hub to run. How each behaves without internet is covered in its own guide.

## Settings

Click **Settings** in the sidebar, or press <kbd>Ctrl</kbd>+<kbd>,</kbd>.

**Appearance.** Under **Theme**, choose **Light**, **Dark** or **Match Windows**. **Match Windows** follows your Windows setting and changes when Windows does. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> switches between light and dark.

**This machine.**
- **Relink this PC** registers this PC with your subscriptions again (see [Relink this PC](#relink-this-pc)).
- **Where products go** shows **Set by each host**. Each plugin installs where its host program looks for it, so there is no folder to choose. Standalone apps install to Program Files.

**Maintenance.** If a product will not start, work down this list before you raise a ticket: **Clear the download cache** (so the next install starts clean), **Relink this PC to my subscriptions**, **Export a diagnostic report** and **Open the user guide**. The report holds the Hub's version, this PC, the host programs, your products and recent installs. Nothing from your jobs, drawings or rates is ever included.

## Help and contact

Click **Help and contact** in the sidebar, or **More ways to reach us** at the foot of the sidebar.

Under **Talk to us**:

- **WhatsApp** is the fastest. Weekdays 9:00 to 18:00 WAT. It opens WhatsApp with a message to support already started, naming the Hub version and this PC.
- **Raise a ticket** opens the support page on adlmstudio.net, with your account and Hub version filled in.
- **Email support@adlmstudio.net** starts an email with your account, machine and Hub version. Answered within one working day.
- **Read the user guide** opens this guide.

**Before you write** lists the three fixes that solve most problems: restart the host program if a panel is missing, relink this PC if a seat is in use, and clear the download cache if an install stops part way. See [Troubleshooting](#troubleshooting).

**WHAT WE WOULD BE SENDING** shows exactly what support receives: your **ACCOUNT**, this **MACHINE**, the **HUB** version and how many **PRODUCTS** are installed. Nothing from your jobs, drawings or rates is ever included.

## AI in the Installer Hub

The Installer Hub has no AI features of its own. It does not read your projects, and nothing it sends to ADLM includes your jobs, drawings or rates.

It installs and updates the products that have AI features, so installing the latest release from the Hub is how you get them:

| Product | AI features | Availability |
|---|---|---|
| QUIV for Revit | **AI Rate Check**; **✦ Run the whole takeoff** and **Auto take-off** (uses no AI model) | On for everyone (Auto take-off in QUIV 4.0) |
| HERON | **AI Review** (**AI Bill Review**) | On for everyone in HERON 2.9 and 3.0 |
| Rate Gen | **Build with AI**; **Price a bill** | On for everyone: Build with AI from Rate Gen 3.0, build 3.0.2610.1; Price a bill from build 3.0.2610.2 |
| SERVIQ (Revit MEP) | **ADLM AI Review** and **BUILD WITH ADLM AI** | Not in standard installs |

AI features need a good connection to ADLM Cloud. The network signal is a quick check. On **Fair** or **Poor**, AI features and cloud saves will be slow.

For what each feature does, where to find it and the monthly allowances, see [ADLM AI services](/guides/ai-services).

## Uninstall the Hub

1. Open Windows **Settings**, then **Apps**, then **Installed apps**.
2. Find **ADLM Installer Hub** and choose **Uninstall**.
3. Windows asks whether to also remove your Installer Hub settings and data for all users on this computer. Choose **No** to keep them, or **Yes** to remove them.

Removing the Hub does not remove the products it installed.

## Troubleshooting

### Windows says "Windows protected your PC" when I run setup

This is Windows SmartScreen. It appears for installers that are new to Windows. Click **More info**, then **Run anyway**, but only for a file you downloaded from adlmstudio.net.

### My Hub looks different from this guide

You have the earlier 2.0 build. The redesigned Hub is rolling out in stages. Your products, licences and seats work the same way. When the new Hub reaches your account, download it from [Downloads](/manage/downloads) and run it over the old one.

### My antivirus blocked or deleted the setup or a plugin

Some security products quarantine newly downloaded files. Signs: setup will not start, an install fails at **Extracting**, or a plugin disappears after working. Restore the file from quarantine, or ask IT to allow the ADLM Installer Hub. Then click **More**, then **Repair**.

### The install fails with "Access denied" or "file in use"

The program you are installing into is still running. Close Revit, PlanSwift, Civil 3D, Archicad or the ADLM app completely (check the system tray), then install again.

### I installed while Revit was open

Revit holds its plugin files open. The progress line may say **Cleanup skipped**, with a note that Revit is running and old version folders were left behind. Close Revit, click **More**, then **Repair**, then open Revit again.

### Revit cannot see the plugin

1. Close Revit fully. Plugins load only when Revit starts.
2. Open Revit again.
3. If it is still missing, click **More**, then **Repair**, and choose the Revit year you actually use.

### (Product) did not install

A card explains what went wrong and suggests the next step. Clear the download cache in **Settings** and try again. If it stops in the same place, click **Export a diagnostic report** and send it with a ticket.

### I cannot sign in

Check the red message against the table in [If sign-in does not work](#if-sign-in-does-not-work). The usual causes are a mistyped password (passwords are case-sensitive), no internet, and signing in with a personal email when the licence is on the company account.

### The Hub cannot reach the server even though my internet works

Look at the network signal. One red bar means the internet is up but the ADLM server is not answering. Office networks, firewalls and some security products can block it.

1. Sign out of the Hub, then sign in again.
2. On the same computer, open [adlmstudio.net/network-check](/network-check) in your browser. It runs a set of tests and shows what is blocked.
3. If something fails, send the results or the reference code it shows to support on WhatsApp.

### My product is not in the Installation Center

1. Click **Check for updates**.
2. Click **All** in the filter row and clear the search box.
3. Check that you are signed in with the account that holds the licence. Your name and email show in the header.
4. Check the subscription on the website. A new purchase may show as **Package pending** until it is released.

### "The seat is in use on another PC"

Another computer holds the seat. Free it (see [Move a licence to a new computer](#move-a-licence-to-a-new-computer)), click **Check for updates**, then **Install**.

### The Hub will not start

Right-click the **ADLM Installer Hub** shortcut and choose **Run as administrator**. If Windows refuses, ask whoever manages the PC.

## Frequently asked questions

### Do I need a separate account for the Hub?

No. Use the same email or username and password as the ADLM website.

### Why do I have to sign in every time?

The Hub does not save your session. Signing in each time keeps your account safe on shared computers. Tick **Remember my email on this PC** to save typing your email.

### What happens to my products if I sign out or close the Hub?

Nothing. They stay installed and keep working. You need the Hub only to install, update, open and repair.

### Does the Hub update itself?

No. **Check for updates** checks your products. When ADLM releases a new Hub, download it again from [Downloads](/manage/downloads) and run it over the old one.

### Can my IT team install the Hub for everyone?

Yes. The Hub uses standard Windows install locations and needs outbound internet access to adlmstudio.net and the ADLM download service. Each person then signs in with the account that holds the licence.

### Where are the guides for the products themselves?

See [QUIV for Revit](/guides/quiv), [HERON](/guides/heron), [Rate Gen](/guides/rategen), [SERVIQ for Revit MEP](/guides/mep), [Time Pro](/guides/timepro) and [ADLM Cloud](/guides/cloud). New to ADLM? Start with [Getting started](/guides/getting-started).
