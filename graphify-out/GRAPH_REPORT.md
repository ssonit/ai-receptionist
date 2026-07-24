# Graph Report - eve  (2026-07-24)

## Corpus Check
- 250 files · ~231,328 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1483 nodes · 3417 edges · 154 communities (86 shown, 68 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b47efc70`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- prompt-input.tsx
- calcom.ts
- message.tsx
- code-block.tsx
- cn
- createClient
- scripts
- compilerOptions
- landing-page.tsx
- sidebar.tsx
- agent-chat.tsx
- data-table.tsx
- utils.ts
- Smoke Checklist
- data-table.tsx
- command.tsx
- components.json
- README.md
- chain-of-thought.tsx
- tool.tsx
- input-group.tsx
- GSAP Core Skill
- agent-message.tsx
- layout.tsx
- models.ts
- login-form.tsx
- @ai-sdk/deepseek
- reasoning.tsx
- High-End Visual Design Skill
- dropdown-menu.tsx
- Graphify Skill
- conversation.tsx
- 20260722000008_bookings_list_status.sql
- Design Taste Frontend Skill
- dependencies
- auth-shell.tsx
- meeting-types/actions.ts
- DESIGN.md
- Stitch Design Taste SKILL.md
- shimmer.tsx
- faq-settings-form.tsx
- 20260722000002_workspaces_leads_bookings.sql
- particles.tsx
- patch-eve-package-resolve.mjs
- 20260722000001_profiles_auth.sql
- Brandkit Skill
- react
- sync-eve-compile.mjs
- GPT Taste Skill
- workspace-settings-form.tsx
- ensure-eve-compile.mjs
- middleware.ts
- 20260722000004_workspace_faq_sections.sql
- Banned Output Patterns
- particles.tsx
- bookings-table.tsx
- auth-shell.tsx
- class-variance-authority
- clsx
- ai
- css.d.ts
- @dnd-kit/core
- @dnd-kit/modifiers
- @dnd-kit/sortable
- @dnd-kit/utilities
- @shikijs/engine-javascript
- @gsap/react
- client.ts
- lucide-react
- motion
- nanoid
- lenis
- next.config.ts
- next-env.d.ts
- next-themes
- @phosphor-icons/react
- radix-ui
- @radix-ui/react-use-controllable-state
- faq/actions.ts
- recharts
- @shikijs/core
- meeting-types-form.tsx
- @shikijs/engine-oniguruma
- react
- streamdown
- @streamdown/math
- @supabase/ssr
- @ai-sdk/anthropic
- workspace-settings-form.tsx
- tailwind-merge
- tailwindcss
- badge.tsx
- use-stick-to-bottom
- vaul
- @vercel/connect
- zod
- postcss.config.mjs
- 20260722000003_pilot_profile_workspace.sql
- 20260722000006_bookings_synced_at.sql
- eve.ts
- No 3-Column Equal Card Layouts
- No Centered Hero Sections
- No Emojis
- No Inter Font
- No Overlapping Elements
- No Pure Black
- Stitch MCP Server
- 20260722000005_workspace_faq_write_policies.sql
- createClient
- @streamdown/code
- 20260722000007_restore_table_grants.sql
- react-dom
- @streamdown/mermaid
- timezone-select.tsx
- tw-animate-css
- hover-card.tsx
- 20260723000005_leads_status.sql
- app/layout.tsx
- account-profile-form.tsx
- 20260723000006_agent_tool_events.sql
- server.ts
- chart.tsx
- check_availability.ts
- 20260723000008_notifications.sql
- toggle-group.tsx
- signOut
- markdown-link.tsx
- dashboard/page.tsx
- @ai-sdk/google
- ai
- dashboard-command-context.tsx
- gsap
- shiki
- @vvo/tzdb
- tabs.tsx
- badge.tsx
- lenis-provider.tsx
- @ai-sdk/google
- @ai-sdk/deepseek
- 20260724000003_chat_branding.sql

## God Nodes (most connected - your core abstractions)
1. `cn()` - 277 edges
2. `createClient()` - 58 edges
3. `createAdminClient()` - 54 edges
4. `getDashboardUser()` - 35 edges
5. `Button()` - 31 edges
6. `react` - 29 edges
7. `getSessionWorkspaceId()` - 17 edges
8. `getCalApiKeyForWorkspace()` - 17 edges
9. `compilerOptions` - 16 edges
10. `Badge()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Smoke Checklist` --references--> `eve`  [EXTRACTED]
  docs/SMOKE.md → package.json
- `Landing hero chat screenshot` --conceptually_related_to--> `Chat`  [INFERRED]
  public/landing-hero-chat.png → docs/SMOKE.md
- `StatusDot()` --calls--> `cn()`  [EXTRACTED]
  app/_components/agent-chat.tsx → lib/utils.ts
- `Hero()` --calls--> `cn()`  [EXTRACTED]
  app/_components/landing-page.tsx → lib/utils.ts
- `Pricing()` --calls--> `cn()`  [EXTRACTED]
  app/_components/landing-page.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Agent Skills Set** — agents_skills_brandkit_skill_skill, agents_skills_design_taste_frontend_skill_skill, agents_skills_design_taste_frontend_v1_skill_skill, agents_skills_full_output_enforcement_skill_skill, agents_skills_gpt_taste_skill_skill, agents_skills_graphify_skill_skill [INFERRED 0.85]
- **Design Token System** — design_typography_tokens, design_color_tokens, design_spacing_tokens, design_radius_shadow_motion_tokens, design_accessibility, design_writing_tone, design_dark_tokenized_ui [EXTRACTED 0.95]
- **Pilot Data Model** — readme_workspaces, readme_profiles, readme_leads, readme_bookings, readme_conversation_logs, readme_cal_com_integration, readme_supabase_integration [EXTRACTED 0.95]
- **GSAP Ecosystem Skills** — agents_skills_gsap_core_SKILL, agents_skills_gsap_frameworks_SKILL, agents_skills_gsap_performance_SKILL, agents_skills_gsap_plugins_SKILL, agents_skills_gsap_react_SKILL, agents_skills_gsap_scrolltrigger_SKILL, agents_skills_gsap_timeline_SKILL, agents_skills_gsap_utils_SKILL [INFERRED 0.90]
- **Image-First Design Workflow** — agents_skills_image_to_code_SKILL, agents_skills_imagegen_frontend_web_SKILL, agents_skills_imagegen_frontend_mobile_SKILL [INFERRED 0.90]
- **Visual Design Style Skills** — agents_skills_high_end_visual_design_SKILL, agents_skills_industrial_brutalist_ui_SKILL, agents_skills_minimalist_ui_SKILL, agents_skills_redesign_existing_projects_SKILL [INFERRED 0.80]
- **Booking Intake Workflow** — check_availability, book_appointment, log_lead, guestName, minimum_notice [EXTRACTED 1.00]
- **Design System Core Rules** — inline_image_typography, spring_physics, perpetual_micro_loops, skeletal_shimmer, no_overlapping, no_centered_hero, no_3_equal_cards, no_emojis, no_inter, no_pure_black [EXTRACTED 1.00]
- **MVP Technology Stack** — supabase, cal_com, next_js, eve, node_js, docker, deepseek, google_generative_ai, anthropic [EXTRACTED 1.00]

## Communities (154 total, 68 thin omitted)

### Community 0 - "prompt-input.tsx"
Cohesion: 0.03
Nodes (56): AttachmentsContext, captureScreenshot(), convertBlobUrlToDataUrl(), LocalAttachmentsContext, LocalReferencedSourcesContext, PromptInput(), PromptInputActionAddAttachments(), PromptInputActionAddAttachmentsProps (+48 more)

### Community 1 - "calcom.ts"
Cohesion: 0.09
Nodes (39): CAL_BOOKING_LIST_FILTERS, CalBookingLifecycleStatus, CalBookingListFilter, getCalBookingView(), hasRecurringBooking(), isAcceptedStatus(), isCancelledStatus(), isUnconfirmedStatus() (+31 more)

### Community 2 - "message.tsx"
Cohesion: 0.07
Nodes (32): MessageActionProps, MessageActions(), MessageActionsProps, MessageBranch(), MessageBranchContent(), MessageBranchContentProps, MessageBranchContext, MessageBranchContextType (+24 more)

### Community 3 - "code-block.tsx"
Cohesion: 0.06
Nodes (33): CodeBlockActions(), CodeBlockBody, CodeBlockContainer(), CodeBlockContent(), CodeBlockContext, CodeBlockContextType, CodeBlockCopyButton(), CodeBlockCopyButtonProps (+25 more)

### Community 4 - "cn"
Cohesion: 0.07
Nodes (32): PromptInputActionMenuContent(), PromptInputActionMenuItem(), PromptInputBody(), PromptInputButton(), PromptInputCommand(), PromptInputCommandEmpty(), PromptInputCommandGroup(), PromptInputCommandInput() (+24 more)

### Community 5 - "createClient"
Cohesion: 0.22
Nodes (13): FaqPage(), HelpPage(), LeadsPage(), MeetingTypesPage(), absoluteOrigin(), SettingsPage(), SetupPage(), DashboardShell() (+5 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (33): just-bash, devDependencies, just-bash, @types/node, @types/react, @types/react-dom, typescript, engines (+25 more)

### Community 7 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 8 - "landing-page.tsx"
Cohesion: 0.10
Nodes (13): features, Hero(), LandingPage(), logos, plans, Pricing(), Marquee(), MarqueeProps (+5 more)

### Community 9 - "sidebar.tsx"
Cohesion: 0.13
Nodes (17): CodeBlock(), getStatusBadge(), statusIcons, statusLabels, Tool(), ToolContentProps, ToolHeader(), ToolHeaderProps (+9 more)

### Community 10 - "agent-chat.tsx"
Cohesion: 0.23
Nodes (10): ChartConfig, ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), INITIAL_DIMENSION, THEMES (+2 more)

### Community 11 - "data-table.tsx"
Cohesion: 0.26
Nodes (9): DashboardLayout(), AppSidebar(), DashboardBookingPathContext, DashboardBookingPathProvider(), useDashboardBookingPath(), DashboardCommand(), DashboardShellChrome(), SidebarInset() (+1 more)

### Community 12 - "utils.ts"
Cohesion: 0.13
Nodes (21): ChatUserMenu(), getInitials(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage() (+13 more)

### Community 13 - "Smoke Checklist"
Cohesion: 0.10
Nodes (22): Booking Intake Skill, Anthropic, book_appointment, Cal.com, Chat, check_availability, Dashboard, DeepSeek (+14 more)

### Community 14 - "data-table.tsx"
Cohesion: 0.16
Nodes (30): MeetingTypesForm(), createMeetingTypeAction(), MeetingTypesActionState, mirrorRow(), requireWorkspaceId(), revalidateMeetingTypePaths(), setAiBookingMeetingTypeAction(), setAiBookingOnWorkspace() (+22 more)

### Community 15 - "command.tsx"
Cohesion: 0.10
Nodes (23): BookingHit, LeadHit, PAGES_BASE, TimezoneSelectProps, Command(), CommandDialog(), CommandEmpty(), CommandGroup() (+15 more)

### Community 16 - "components.json"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 17 - "README.md"
Cohesion: 0.11
Nodes (16): Eve Framework Documentation, Eve Framework, Next.js Agent Rules, Next.js Documentation, AI Booking Agent Project, Anthropic API Key, Bookings (Data Model), Cal.com Integration (+8 more)

### Community 18 - "chain-of-thought.tsx"
Cohesion: 0.11
Nodes (17): ChainOfThought, ChainOfThoughtContent, ChainOfThoughtContentProps, ChainOfThoughtContext, ChainOfThoughtContextValue, ChainOfThoughtHeader, ChainOfThoughtHeaderProps, ChainOfThoughtImage (+9 more)

### Community 19 - "tool.tsx"
Cohesion: 0.21
Nodes (22): Params, POST(), GET(), Params, PATCH(), GET(), POST(), getChatActor() (+14 more)

### Community 20 - "input-group.tsx"
Cohesion: 0.20
Nodes (12): GET(), Params, ConversationsPage(), ChatMessageRow, ChatSessionListItem, listWorkspaceChatSessions(), classifyOutcome(), ConversationDetail (+4 more)

### Community 21 - "GSAP Core Skill"
Cohesion: 0.21
Nodes (15): GSAP Core Skill, GSAP Frameworks Skill, GSAP Performance Skill, GSAP Plugins Skill, GSAP React Skill, GSAP ScrollTrigger Skill, GSAP Timeline Skill, GSAP Utils Skill (+7 more)

### Community 22 - "agent-message.tsx"
Cohesion: 0.16
Nodes (14): AgentInputResponse, AgentMessage(), AttachmentPart(), authorizationDescription(), AuthorizationPrompt(), authorizationTitle(), EveFilePart, formatAuthorizationOutcome() (+6 more)

### Community 23 - "layout.tsx"
Cohesion: 0.18
Nodes (25): execute(), execute(), nextStatusOnLog(), logAgentToolEvent(), bookingConfig, normalizeLeadUrgency(), findWorkspaceLead(), upsertLeadAsBooked() (+17 more)

### Community 24 - "models.ts"
Cohesion: 0.23
Nodes (14): anthropic, deepseek, defaultSlot(), envKeyFor(), extractLatestUserText(), forcedSlot(), google, hasProviderKey() (+6 more)

### Community 25 - "login-form.tsx"
Cohesion: 0.18
Nodes (11): AuthState, signIn(), signUp(), AuthShell(), initial, LoginForm(), initial, SignupForm() (+3 more)

### Community 26 - "@ai-sdk/deepseek"
Cohesion: 0.14
Nodes (17): AgentChat(), ChatSessionDrawer(), ChatSessionSidebar(), ChatSessionsToggle(), ChatUser, WorkspaceBookingPage(), clearBodyPointerEventsLock(), Sheet() (+9 more)

### Community 27 - "reasoning.tsx"
Cohesion: 0.15
Nodes (12): isInAppLink(), MarkdownLink(), normalizeChatLinkHref(), Reasoning, ReasoningContent, ReasoningContentProps, ReasoningContext, ReasoningContextValue (+4 more)

### Community 28 - "High-End Visual Design Skill"
Cohesion: 0.18
Nodes (15): High-End Visual Design Skill, Image to Code Skill, Mobile App Image Generation Skill, Web Frontend Image Generation Skill, Industrial Brutalist UI Skill, Minimalist UI Skill, Redesign Existing Projects Skill, Anti-AI-Slop Patterns (+7 more)

### Community 29 - "dropdown-menu.tsx"
Cohesion: 0.16
Nodes (13): AgentChatThread(), AgentStatus, StatusDot(), ThreadBootstrap, ChatUser, PromptInputMessage, AnimatedGridPattern(), AnimatedGridPatternProps (+5 more)

### Community 30 - "Graphify Skill"
Cohesion: 0.15
Nodes (13): Add URL and Watch Folder, Extra Exports and Benchmark, Extraction Subagent Prompt, GitHub Clone and Cross-Repo Merge, Commit Hook and Agent Integration, Query, Path, Explain, Transcribe Video and Audio, Incremental Update and Cluster-only (+5 more)

### Community 31 - "conversation.tsx"
Cohesion: 0.16
Nodes (13): Conversation(), ConversationContent(), ConversationContentProps, ConversationDownload(), ConversationDownloadProps, ConversationEmptyState(), ConversationEmptyStateProps, ConversationProps (+5 more)

### Community 32 - "20260722000008_bookings_list_status.sql"
Cohesion: 0.25
Nodes (16): AiHealthAlert, AnalyticsDayPoint, AnalyticsKpis, buildAiHealthAlerts(), buildAnalyticsKpis(), buildDailySeries(), buildLeadFunnel(), AnalyticsDashboardData (+8 more)

### Community 33 - "Design Taste Frontend Skill"
Cohesion: 0.20
Nodes (10): Bias Corrections (Anti-Slop Directives), Design Read (Brief Inference), Design System Map, Pre-Flight Check, Design Taste Frontend Skill, Three Dials (Variance, Motion, Density), Active Baseline Configuration, Creative Arsenal (+2 more)

### Community 35 - "auth-shell.tsx"
Cohesion: 0.09
Nodes (25): chartData, columns, schema, ShimmerButton, ShimmerButtonProps, Checkbox(), Drawer(), DrawerClose() (+17 more)

### Community 36 - "meeting-types/actions.ts"
Cohesion: 0.19
Nodes (19): leads_updated_at, on_auth_user_created, profiles_updated_at, public.agent_tool_events, public.bookings, public.chat_messages, public.chat_sessions, public.conversation_logs (+11 more)

### Community 37 - "DESIGN.md"
Cohesion: 0.22
Nodes (8): Accessibility (WCAG 2.2 AA), Color Palette Tokens, Dark Tokenized UI, Radius, Shadow, Motion Tokens, Rerun Brand, Spacing Scale Tokens, Typography Tokens, Writing Tone

### Community 38 - "Stitch Design Taste SKILL.md"
Cohesion: 0.29
Nodes (7): Design System Taste DESIGN.md, Stitch Design Taste SKILL.md, Google Stitch, Inline Image Typography, Perpetual Micro-Loops, Skeletal Shimmer, Spring Physics

### Community 39 - "shimmer.tsx"
Cohesion: 0.33
Nodes (6): getMotionComponent(), motionComponentCache, MotionHTMLProps, Shimmer, ShimmerComponent(), TextShimmerProps

### Community 40 - "faq-settings-form.tsx"
Cohesion: 0.13
Nodes (18): Sidebar(), SidebarContext, SidebarContextProps, SidebarGroupAction(), SidebarGroupLabel(), SidebarInput(), SidebarMenuAction(), SidebarMenuBadge() (+10 more)

### Community 41 - "20260722000002_workspaces_leads_bookings.sql"
Cohesion: 0.38
Nodes (8): ensureVisitorId(), ensureVisitorIdOnResponse(), getVisitorId(), isVisitorId(), readVisitorIdFromRequest(), visitorCookieOptions(), config, middleware()

### Community 42 - "particles.tsx"
Cohesion: 0.16
Nodes (19): LeadActionState, requireWorkspace(), updateLeadNotesAction(), updateLeadStatusAction(), formatWhen(), initialOf(), LeadDetailSheet(), LeadRow (+11 more)

### Community 43 - "patch-eve-package-resolve.mjs"
Cohesion: 0.33
Nodes (4): require, root, source, target

### Community 44 - "20260722000001_profiles_auth.sql"
Cohesion: 0.48
Nodes (6): public.bookings, public.conversation_logs, public.leads, public.profiles, public.workspaces, workspaces_updated_at

### Community 45 - "Brandkit Skill"
Cohesion: 0.40
Nodes (5): Board Composition, Logo Concept Methods, Premium Brand Kit Generation, Brandkit Skill, Visual Modes

### Community 46 - "react"
Cohesion: 0.47
Nodes (5): on_auth_user_created, profiles_updated_at, public.handle_new_user(), public.handle_updated_at(), public.profiles

### Community 47 - "sync-eve-compile.mjs"
Cohesion: 0.40
Nodes (4): folders, fromBase, root, toBase

### Community 48 - "GPT Taste Skill"
Cohesion: 0.50
Nodes (4): AIDA Structure, Advanced GSAP Motion, Python-Driven Randomization, GPT Taste Skill

### Community 49 - "workspace-settings-form.tsx"
Cohesion: 0.26
Nodes (14): FaqSettingsForm(), initial, toDraftItems(), AiHealthPanel(), severityClass(), severityIcon(), Card(), CardAction() (+6 more)

### Community 51 - "middleware.ts"
Cohesion: 0.20
Nodes (19): BookingDetailSheet(), BookingRow, BookingsTable(), bookingTitle(), extractEndIso(), extractMeetingUrl(), formatDay(), formatTime() (+11 more)

### Community 54 - "particles.tsx"
Cohesion: 0.38
Nodes (10): addDaysYmd(), compareYmd(), nowHm(), todayLabel(), todayYmd(), toYmd(), buildMarkdown(), instructionsForCtx() (+2 more)

### Community 56 - "auth-shell.tsx"
Cohesion: 0.21
Nodes (9): highlights, BorderBeam(), BorderBeamProps, AnimatedShinyText(), AnimatedShinyTextProps, BlurFade(), BlurFadeProps, getFilter() (+1 more)

### Community 59 - "clsx"
Cohesion: 0.46
Nodes (4): DashboardRefreshButton(), SiteHeader(), Button(), buttonVariants

### Community 60 - "ai"
Cohesion: 0.13
Nodes (20): CreateMeetingTypeSheet(), DetailRow(), extractDescription(), extractLocationLabel(), formatDateTime(), formatDuration(), formatNotice(), initial (+12 more)

### Community 62 - "@dnd-kit/core"
Cohesion: 0.20
Nodes (8): Active path, Archived history, Related, Remote / prod cutover, Schema changes going forward, Seed vs schema, Supabase migrations workflow, Archived incremental migrations

### Community 63 - "@dnd-kit/modifiers"
Cohesion: 0.47
Nodes (5): Circle, hexToRgb(), MousePosition, Particles(), ParticlesProps

### Community 64 - "@dnd-kit/sortable"
Cohesion: 0.14
Nodes (20): GET(), parseCursor(), NotificationsPage(), formatWhen(), GroupFilter, NotificationsInbox(), severityClass(), ViewMode (+12 more)

### Community 67 - "@gsap/react"
Cohesion: 0.15
Nodes (13): cmdk, dependencies, cmdk, @radix-ui/react-use-controllable-state, sonner, @streamdown/cjk, @supabase/supabase-js, @tanstack/react-table (+5 more)

### Community 77 - "radix-ui"
Cohesion: 0.24
Nodes (9): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea() (+1 more)

### Community 84 - "react"
Cohesion: 0.15
Nodes (17): AnalyticsTrendChart(), ChartAreaInteractive(), chartData, CopyBookingLink(), DataTable(), TableCellViewer(), ChartContainer(), SidebarMenuSkeleton() (+9 more)

### Community 101 - "eve.ts"
Cohesion: 0.19
Nodes (14): EveAuth, generateMetadata(), PageProps, PublicBookingSlugPage(), ChatPage(), getDefaultWorkspaceId(), getPilotWorkspaceId(), getPublicBookingWorkspace() (+6 more)

### Community 118 - "createClient"
Cohesion: 0.22
Nodes (15): initial, SlugStatus, SuggestionDraft, WorkspaceSettingsForm(), checkWorkspaceSlugAvailable(), optionalText(), parseSuggestionsFromForm(), requireWorkspaceId() (+7 more)

### Community 123 - "timezone-select.tsx"
Cohesion: 0.40
Nodes (9): TimezoneSelect(), buildCanonicalMap(), canonicalizeTimezone(), findTimezoneOption(), formatOffset(), formatTimezoneLabel(), listTimezoneOptions(), TimezoneOption (+1 more)

### Community 127 - "app/layout.tsx"
Cohesion: 0.33
Nodes (5): metadata, mono, RootLayout(), sans, Toaster()

### Community 128 - "account-profile-form.tsx"
Cohesion: 0.29
Nodes (7): signOut(), AccountProfileForm(), initial, AccountActionState, updateAccountNameAction(), AccountPage(), SetupShell()

### Community 130 - "server.ts"
Cohesion: 0.20
Nodes (16): GET(), sanitizeIlike(), uniqueById(), syncBookingsAction(), SyncBookingsState, BookingsPage(), markAllNotificationsReadAction(), markNotificationReadAction() (+8 more)

### Community 132 - "check_availability.ts"
Cohesion: 0.21
Nodes (17): faqSkill(), parseFaqItems(), saveFaqSettings(), blockSection(), buildBookingFaqMarkdown(), contactLine(), fetchWorkspaceFaq(), mapFaqItems() (+9 more)

### Community 137 - "dashboard/page.tsx"
Cohesion: 0.29
Nodes (8): AnalyticsPage(), DashboardPage(), daysAgoIso(), startOfTodayIso(), SectionCards(), SectionCardStat, CAL_BOOKING_VIEWS, getCalBookingViewLabel()

### Community 139 - "@ai-sdk/google"
Cohesion: 0.46
Nodes (7): ConversationDetailSheet(), ConversationsTable(), formatWhen(), outcomeBadgeClass(), outcomeLabel(), ViewId, VIEWS

### Community 144 - "dashboard-command-context.tsx"
Cohesion: 0.13
Nodes (18): navMainBase, navSecondary, DashboardCommandContext, DashboardCommandContextValue, DashboardCommandProvider(), useDashboardCommand(), NavMain(), NavSecondary() (+10 more)

### Community 148 - "tabs.tsx"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 150 - "lenis-provider.tsx"
Cohesion: 0.40
Nodes (4): LenisProvider(), LenisProviderProps, lenis, lenis

## Knowledge Gaps
- **458 isolated node(s):** `EveAuth`, `AgentStatus`, `ThreadBootstrap`, `AgentInputResponse`, `EveFilePart` (+453 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **68 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `prompt-input.tsx`, `message.tsx`, `code-block.tsx`, `server.ts`, `landing-page.tsx`, `sidebar.tsx`, `agent-chat.tsx`, `@ai-sdk/google`, `utils.ts`, `data-table.tsx`, `data-table.tsx`, `command.tsx`, `dashboard-command-context.tsx`, `chain-of-thought.tsx`, `tabs.tsx`, `badge.tsx`, `agent-message.tsx`, `login-form.tsx`, `@ai-sdk/deepseek`, `reasoning.tsx`, `dropdown-menu.tsx`, `conversation.tsx`, `auth-shell.tsx`, `shimmer.tsx`, `faq-settings-form.tsx`, `particles.tsx`, `workspace-settings-form.tsx`, `middleware.ts`, `auth-shell.tsx`, `clsx`, `ai`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `radix-ui`, `react`, `createClient`, `timezone-select.tsx`, `app/layout.tsx`?**
  _High betweenness centrality (0.273) - this node is a cross-community bridge._
- **Why does `dependencies` connect `@gsap/react` to `scripts`, `toggle-group.tsx`, `Smoke Checklist`, `ai`, `gsap`, `shiki`, `@vvo/tzdb`, `lenis-provider.tsx`, `@ai-sdk/google`, `@ai-sdk/deepseek`, `dependencies`, `class-variance-authority`, `@dnd-kit/utilities`, `lucide-react`, `motion`, `nanoid`, `next-themes`, `@phosphor-icons/react`, `faq/actions.ts`, `recharts`, `@shikijs/core`, `meeting-types-form.tsx`, `@shikijs/engine-oniguruma`, `react`, `streamdown`, `@streamdown/math`, `@supabase/ssr`, `@ai-sdk/anthropic`, `workspace-settings-form.tsx`, `tailwind-merge`, `tailwindcss`, `badge.tsx`, `use-stick-to-bottom`, `vaul`, `@vercel/connect`, `zod`, `20260722000003_pilot_profile_workspace.sql`, `20260722000006_bookings_synced_at.sql`, `20260722000005_workspace_faq_write_policies.sql`, `@streamdown/code`, `react-dom`, `@streamdown/mermaid`, `tw-animate-css`, `hover-card.tsx`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `@dnd-kit/sortable`, `server.ts`, `@gsap/react`, `faq-settings-form.tsx`, `particles.tsx`, `data-table.tsx`, `@ai-sdk/google`, `agent-chat.tsx`, `data-table.tsx`, `dashboard-command-context.tsx`, `middleware.ts`, `@ai-sdk/deepseek`, `timezone-select.tsx`, `dropdown-menu.tsx`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **What connects `EveAuth`, `AgentStatus`, `ThreadBootstrap` to the rest of the system?**
  _458 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prompt-input.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03424056189640035 - nodes in this community are weakly interconnected._
- **Should `calcom.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09059233449477352 - nodes in this community are weakly interconnected._
- **Should `message.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0746031746031746 - nodes in this community are weakly interconnected._