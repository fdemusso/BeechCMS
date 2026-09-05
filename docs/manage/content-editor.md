---
title: Content Editor Guide
description: Visual guide for content editors, copywriters, and marketers in BeechCMS.
---

# Content Editor Guide

Welcome to the **BeechCMS Content Editor Guide**. This guide is designed for content editors, copywriters, marketers, and non-technical site owners who manage day-to-day content on a BeechCMS-powered website.

BeechCMS is built to be fast, dependable, and calm. Everything you need to create, edit, organize, and publish content is accessible through a clean, intuitive visual dashboard without touching code or database settings.

## Basics & Concepts

BeechCMS is built around a natural, botanical metaphor:

- **Seeds (Content Models / Blueprints)**: A *Seed* (seme) is a template created by your administrator or developer. It defines what kind of information a piece of content contains. Examples include **Articoli** (Blog Articles), **Release Notes**, **Authors**, or **Customer Tickets**.
- **Branches (Fields & Attributes)**: Each Seed consists of individual fields called *Branches* (rami)—such as Title, Body Text, Cover Image, Publish Date, or Category.
- **Fruits (Content Records / Frutti)**: A *Fruit* (frutto) is a single, concrete piece of content born from a Seed. For example, the article *"Announcing Our Spring Product Release"* is a Fruit generated within the **Articoli** Seed.

<p align="center">
  <img src="/images/content-structure-seed-entries.svg" alt="BeechCMS Botanical Hierarchy: Seeds, Fruits, and Branches" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

> [!NOTE]
> As an editor, your daily work revolves around creating, cultivating, and updating **Frutti (Fruits)**. You don't need to configure database schemas or server settings; your administrator has already planted the appropriate Seeds and Branches for your project.

## Access & Security

### Log In
1. Open your browser and navigate to your team's BeechCMS dashboard URL (usually `https://your-domain.com/admin` or `http://localhost:8787/admin` in local development).
2. Enter your work **Email** and **Password**.
3. Click **Sign in**.

<p align="center">
  <img src="/images/login-page.png" alt="BeechCMS Login Page" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

### Forgot Password
If you forget your password:
1. Click the **Forgot password?** link on the login page.
2. Enter your email address and click **Send reset link**.
3. Check your inbox for a secure password reset email containing a one-time reset link.
4. Follow the link to enter and confirm your new password.

<p align="center">
  <img src="/images/forgot-password.png" alt="Forgot Password Page" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

### Log Out
When using a shared workstation or finishing your work session:
1. Click your name/avatar in the bottom-left corner of the sidebar.
2. Select **Log out**.

<p align="center">
  <img src="/images/user-menu-logout.png" alt="User Profile and Logout Menu" style="width: 100%; max-width: 480px; margin: 16px 0; border-radius: 8px;" />
</p>

> [!TIP]
> Always log out when stepping away from shared devices. Sessions are securely tokenized and protected against unauthorized access.

## Dashboard Interface

The BeechCMS workspace is divided into three primary zones: the **Sidebar**, the **Top Bar**, and the **Main Workspace**.

<p align="center">
  <img src="/images/dashboard-overview.png" alt="BeechCMS Dashboard Overview" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

### Sidebar

The sidebar organizes everything you need into clear, functional sections:

- **Navigation**:
  - **Dashboard**: Your home overview with personalized greetings, quick statistics, and recent content activity.
  - **Analytics**: Key traffic, publication trends, and activity metrics.
- **Content Quick Access**:
  - **Create New**: Fast entry point to create content across any Seed.
  - **Drafts**: A centralized hub showing all work-in-progress drafts across all content types.
  - **Scheduled**: Content queued for automatic future publishing.
- **Content Groups (Seeds)**:
  - Your actual content types grouped logically (e.g., *Content*, *SaaS Platform*, *Support*).
  - For example: **Articoli** (Blog Articles), **Release Notes**, **Clienti**, **Ticket Supporto**.
- **Settings & User Profile**: Located at the bottom of the sidebar to manage personal profile details, notification preferences, and interface theme (Light / Dark mode).

<p align="center">
  <img src="/images/sidebar-seeds.png" alt="Sidebar Navigation and Content Groups" style="width: 100%; max-width: 480px; margin: 16px 0; border-radius: 8px;" />
</p>

### Top Bar
- **Sidebar Toggle**: Click the collapse icon to maximize your editing workspace.
- **Breadcrumbs**: Shows your exact location in the hierarchy (e.g., `Beech CMS > Contents > Articoli > Edit`). Click any segment to navigate backwards.
- **Notifications Bell**: Displays real-time alerts (e.g., when an automated workflow completes or scheduled content goes live).
- **Command Palette (`Cmd + K` or `Ctrl + K`)**: Instant search to jump to any Seed, Fruit, or setting from anywhere in the app.

<p align="center">
  <img src="/images/command-palette.png" alt="Command Palette (Cmd+K)" style="width: 100%; max-width: 720px; margin: 16px 0; border-radius: 8px;" />
</p>

## Content Listings

When you select a Seed from the sidebar (e.g., **Articoli**), you enter the **Listing View** showing all the Fruits created for that Seed.

<p align="center">
  <img src="/images/list-view-posts.png" alt="Content List View in Table Layout" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

### Views (Table, Kanban, Gallery)

Depending on your Seed configuration, you can view your content in different visual layouts:

1. **Table View**: The classic spreadsheet-style layout. Ideal for scanning large numbers of items, sorting by columns, and performing bulk operations.
2. **Kanban View**: Visual card columns grouped by status (e.g., *Draft*, *In Review*, *Published*, or ticket statuses like *Open*, *In Progress*, *Closed*). Drag and drop cards between columns to update their state.
3. **Gallery View**: Card-based grid featuring cover images and key summary text. Perfect for visual media, blog articles, and team profiles.

<p align="center">
  <img src="/images/view-switcher.png" alt="View Switcher: Table, Kanban, Gallery" style="width: 100%; max-width: 400px; margin: 16px 0; border-radius: 8px;" />
</p>

### Search & Filters

- **Search Bar**: Type any keyword to instantly filter items by title, author, or text fields.
- **Column Filters & Conditions**: Click **Filter** in the toolbar to add rules (e.g., `Status is Draft`, `Author equals "Flavio"`, or `Release Date is after 2026-01-01`).
- **Facet Filters**: Quickly click predefined chips to narrow down by status or category.
- **Sorting**: Click any column header to sort ascending or descending.

<p align="center">
  <img src="/images/filter-toolbar-open.png" alt="Filter Builder Toolbar" style="width: 100%; max-width: 600px; margin: 16px 0; border-radius: 8px;" />
</p>

### Density & Columns
- **Density Selector**: Choose between *Compact*, *Normal*, or *Comfortable* row heights to suit your screen size.
- **Column Visibility**: Show or hide specific columns to keep your table focused on the data you care about.

### Context Menus & Bulk Actions
- **Right-Click**: Right-clicking any row opens a contextual menu to edit, duplicate, filter by this cell value, or delete.
- **Bulk Selection**: Check the boxes on multiple rows to execute bulk actions (such as bulk status updates or deleting multiple items at once).

<p align="center">
  <img src="/images/context-menu-row.png" alt="Row Context Menu" style="width: 100%; max-width: 480px; margin: 16px 0; border-radius: 8px;" />
</p>

## Creating Content

Imagine you want to publish a new blog post or create a release note. Here is the step-by-step workflow:

### Open Form
- From the Seed listing page (e.g., **Articoli**), click the **+ New Entry** (or **+ Articolo**) button in the top right.
- Alternatively, go to **Create New** in the sidebar and pick your desired Seed.

<p align="center">
  <img src="/images/create-new-button.png" alt="Create New Entry Button" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

### Fill Fields
BeechCMS dynamically builds the form based on the Seed:

- **Required Fields (`*`)**: Must be completed before saving (e.g., Title, Slug, Status).
- **Text & Number Fields**: Type directly. Number fields may format currencies (e.g., `€ 1.250,00`) automatically.
- **Dropdowns & Selectors**: Choose from predefined options (e.g., `free`, `pro`, `enterprise`).
- **Date Pickers**: Select specific dates and times with a visual calendar.
- **Relations**: If a Fruit links to another Seed (for example, linking a Support Ticket or Subscription to a specific *Cliente*), search and select the related record from the autocomplete dropdown.

<p align="center">
  <img src="/images/editor-form-fields.png" alt="Content Entry Editor Form" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

### Validation
The editor gives immediate, helpful feedback:
- If a required field is empty, it will be outlined in red with a clear helper message.
- If a field requires a unique value (such as an article slug or version number), the system prevents duplicates before saving.

## Drafts & Publishing

BeechCMS streamlines the drafting and publication lifecycle through a dedicated **Drafts** workflow.

### Content States

| Status Badge | What It Means | Visibility on Live Website |
| :--- | :--- | :--- |
| <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;">Draft</span> | Work in progress. Saved in the database but unpublished. | **Hidden** from the public site. Only visible to team members in the dashboard. |
| <span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;">Published</span> | Live and active content. | **Visible** immediately to all visitors and frontend consumers. |
| <span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;">Scheduled</span> | Set to go live automatically at a future date/time. | **Hidden** until the scheduled timestamp arrives. |

<p align="center">
  <img src="/images/status-badges.png" alt="Content Status Badges: Draft, Published, Scheduled" style="width: 100%; max-width: 600px; margin: 16px 0; border-radius: 8px;" />
</p>

### Drafts Hub

Instead of cluttering the creation form, all work-in-progress items across all Seeds are collected in the **Drafts** section in the sidebar.

From the **Drafts Hub**, you can:
1. **Browse All Unsaved Work**: See every active draft across all content types in one central table, including the last editor who worked on it and when it was updated.
2. **Open / Continue Editing**: Click any draft to open it directly in the editor and continue writing.
3. **Publish**: Publish the draft directly to make it live on the public site immediately.
4. **Discard**: Discard the draft to revert back to the last published version (or delete it if it was never published).

<p align="center">
  <img src="/images/global-drafts-hub.png" alt="Dedicated Global Drafts Hub" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

> [!IMPORTANT]
> **Unsaved Changes Protection**: If you edit a form and accidentally attempt to close the window or navigate away, BeechCMS prompts you with a confirmation dialog so you never lose your work.

<p align="center">
  <img src="/images/unsaved-changes-dialog.png" alt="Unsaved Changes Protection Dialog" style="width: 100%; max-width: 600px; margin: 16px 0; border-radius: 8px;" />
</p>

### Scheduled Content
When you set content to go live at a specific future date and time, it appears in the **Scheduled** section in the sidebar, queued to be published automatically.

## Media & Images

Adding media in BeechCMS is straightforward and fast. Images are stored securely on edge object storage (Cloudflare R2) and delivered with zero latency.

<p align="center">
  <img src="/images/media-field.png" alt="Media and Image Upload Field" style="width: 100%; max-width: 600px; margin: 16px 0; border-radius: 8px;" />
</p>

### Uploading Images
The media field offers two simple options:

1. **Upload from Device**: Click the **Upload** icon button or drag an image file from your computer directly into the field (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`).
2. **Paste an Image URL**: Paste any valid `https://` image link directly into the input. BeechCMS validates that the URL is secure and loads correctly.

### Managing & Removing
- Once an image is loaded, an instant preview appears in the editor.
- To replace or remove an image, click the **X (Remove)** button on the top corner of the preview.

> [!TIP]
> **Recommended Image Specs**:
> - **Formats**: Modern formats like `.webp` or `.jpg` are recommended for photography; `.svg` or `.png` for icons and logos.
> - **Dimensions**: 1600–2400px width is ideal for full-width hero banners; 800–1200px for blog body images.
> - **File size**: Keep images under 3–5 MB for optimal website loading speed.

## Rich Text Editor

For long-form content (like blog articles or release notes), BeechCMS includes a modern, visual rich text editor:

<p align="center">
  <img src="/images/richtext-editor-toolbar.png" alt="Rich Text TipTap Editor Toolbar" style="width: 100%; max-width: 720px; margin: 16px 0; border-radius: 8px;" />
</p>

- **Headings**: Use `H2` for main sections and `H3` for subsections. (Avoid multiple `H1` tags inside body text, as the page title serves as the main `H1`).
- **Formatting**: Bold, italic, strikethrough, inline code, and blockquotes.
- **Lists**: Ordered (numbered) and unordered (bulleted) lists.
- **Hyperlinks**: Highlight text, click the link icon, paste the URL, and press enter.
- **Embedded Images**: Insert images directly inline with your text.
- **Tables & Dividers**: Add horizontal dividers and structured tables when organizing comparison data.

## Organizing Workflow

### Custom Views
Each Seed can be tailored to how your team works best:
- Use **Table View** for bulk editing and data management.
- Use **Kanban View** for editorial pipelines (e.g. moving articles from *Draft* to *In Review* to *Published*).
- Use **Gallery View** for visually-driven catalogs (portfolio items, team members, photo galleries).

### Saved Filters
If you frequently review specific segments of content (e.g., *"Articles by Author"*, *"High Priority Tickets"*), configure your toolbar filters and keep that tab bookmarked for quick daily access.

## Roles & Permissions

BeechCMS provides distinct permissions to ensure content creators have total freedom to edit without the risk of accidentally breaking site architecture.

| Feature / Area | Content Editor | Administrator / Owner |
| :--- | :---: | :---: |
| **Create & Edit Fruits** (Articles, Pages, Data) | Full Access | Full Access |
| **Publish & Manage Drafts** | Full Access | Full Access |
| **Upload Media & Manage Images** | Full Access | Full Access |
| **Personal Profile & Notification Settings** | Full Access | Full Access |
| **Customize Dashboard Layouts & Widgets** | Read-Only | Full Access |
| **Seed & Branch Builder** (Changing Fields & Types) | Protected | Full Access |
| **API Keys, Webhooks & System Integrations** | Protected | Full Access |

<p align="center">
  <img src="/images/settings-profile.png" alt="Settings Page with Profile Tab" style="width: 100%; max-width: 820px; margin: 16px 0; border-radius: 8px;" />
</p>

> [!NOTE]
> If you notice a lock icon or disabled button on certain system settings or Seed structures, that area is reserved for administrators. Contact your tech lead if you need a new custom field added to a Seed.

## Troubleshooting

### Content Not Visible
- **Check the status badge**: Ensure the Fruit is truly **Published**, not saved as a **Draft** or **Scheduled** for a future date.
- **Frontend caching**: Static website generators or CDNs may take 30–60 seconds to refresh cached pages. Try a hard refresh in your browser (`Cmd + Shift + R` or `Ctrl + F5`).
- **Public Visibility**: Confirm with your admin that the Seed has `allowPublicRead` enabled.

### Upload Errors
- **File format**: Ensure the file is an image (`.jpg`, `.png`, `.webp`, `.svg`, `.gif`).
- **External URL validation**: If pasting a link from another website, ensure it begins with `https://` (non-secure `http://` links are blocked) and points directly to an image file.

### Missing Entries
- Check the **Drafts** section (`/drafts`) in the sidebar.
- Clear any active search filters in the toolbar.
- Use the **Command Palette (`Cmd + K`)** to search across all Seeds simultaneously.

### Contacting Admins
- When you need a **new field** added to a Seed (e.g., adding an "Estimated Reading Time" number field to blog posts).
- When a new team member needs an account invitation or role upgrade.
- When an automated notification or webhook fails to deliver.

## Best Practices

Before hitting **Publish**, run through this quick quality checklist:

- [ ] **Title & Headings**: Are headings formatted logically (`H2` -> `H3`)?
- [ ] **Slug**: Is the URL slug clean, lowercase, and hyphenated (e.g., `summer-product-update`)?
- [ ] **Images & Alt Text**: Are cover images uploaded and high resolution?
- [ ] **Links**: Do all external links work and use `https://`?
- [ ] **Relations**: Are all related records (like authors, categories, or clients) selected?
- [ ] **Preview & Proofread**: Have you read through the text once more for typos?

Happy editing! If you have suggestions for new features or workflows, share them with your team's BeechCMS administrator.
