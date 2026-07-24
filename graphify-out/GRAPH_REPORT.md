# Graph Report - eve  (2026-07-24)

## Corpus Check
- 257 files · ~233,440 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1522 nodes · 3522 edges · 149 communities (78 shown, 71 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `585a920c`
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
- app/layout.tsx
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
- timezones.ts
- recharts
- @shikijs/core
- meeting-types-form.tsx
- @shikijs/engine-oniguruma
- markdown-link.tsx
- streamdown
- @streamdown/math
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
- slugify
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
- @streamdown/math
- @supabase/ssr
- 20260723000006_agent_tool_events.sql
- @tabler/icons-react
- chart.tsx
- @tailwindcss/postcss
- 20260723000008_notifications.sql
- toggle-group.tsx
- signOut
- markdown-link.tsx
- react-is
- @ai-sdk/google
- @shikijs/engine-oniguruma
- shiki
- @vvo/tzdb
- badge.tsx
- @ai-sdk/google
- 20260724000003_chat_branding.sql

## God Nodes (most connected - your core abstractions)
1. `cn()` - 279 edges
2. `createClient()` - 58 edges
3. `createAdminClient()` - 54 edges
4. `getDashboardUser()` - 35 edges
5. `react` - 32 edges
6. `Button()` - 31 edges
7. `getSessionWorkspaceId()` - 17 edges
8. `getCalApiKeyForWorkspace()` - 17 edges
9. `slugifyWorkspaceName()` - 16 edges
10. `compilerOptions` - 16 edges

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

## Communities (149 total, 71 thin omitted)

### Community 0 - "prompt-input.tsx"
Cohesion: 0.03
Nodes (59): AttachmentsContext, captureScreenshot(), convertBlobUrlToDataUrl(), LocalAttachmentsContext, LocalReferencedSourcesContext, PromptInput(), PromptInputActionAddAttachments(), PromptInputActionAddAttachmentsProps (+51 more)

### Community 1 - "calcom.ts"
Cohesion: 0.12
Nodes (28): AvailableSlot, CalBookingListItem, CalErrorBody, CalEventRef, calFetch(), CalMeProfile, createBooking(), CreateBookingInput (+20 more)

### Community 2 - "message.tsx"
Cohesion: 0.06
Nodes (37): metadata, mono, RootLayout(), sans, MessageActionProps, MessageActions(), MessageActionsProps, MessageBranch() (+29 more)

### Community 3 - "code-block.tsx"
Cohesion: 0.06
Nodes (33): CodeBlockActions(), CodeBlockBody, CodeBlockContainer(), CodeBlockContent(), CodeBlockContext, CodeBlockContextType, CodeBlockCopyButton(), CodeBlockCopyButtonProps (+25 more)

### Community 4 - "cn"
Cohesion: 0.06
Nodes (44): DetailRow(), PromptInputActionMenuItem(), PromptInputBody(), PromptInputButton(), PromptInputCommand(), PromptInputCommandEmpty(), PromptInputCommandGroup(), PromptInputCommandInput() (+36 more)

### Community 5 - "createClient"
Cohesion: 0.13
Nodes (24): EveAuth, withTenantAttributes(), DashboardLayout(), DashboardBookingPathContext, DashboardBookingPathProvider(), cookieNameFor(), LocaleCtx, LocaleKind (+16 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (33): just-bash, devDependencies, just-bash, @types/node, @types/react, @types/react-dom, typescript, engines (+25 more)

### Community 7 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 8 - "landing-page.tsx"
Cohesion: 0.08
Nodes (17): features, Hero(), LandingPage(), logos, plans, Pricing(), Marquee(), MarqueeProps (+9 more)

### Community 9 - "sidebar.tsx"
Cohesion: 0.13
Nodes (17): CodeBlock(), getStatusBadge(), statusIcons, statusLabels, Tool(), ToolContentProps, ToolHeader(), ToolHeaderProps (+9 more)

### Community 10 - "agent-chat.tsx"
Cohesion: 0.25
Nodes (9): ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), INITIAL_DIMENSION, THEMES, TooltipNameType (+1 more)

### Community 11 - "data-table.tsx"
Cohesion: 0.09
Nodes (35): AppSidebar(), DashboardCommandContext, DashboardCommandContextValue, DashboardCommandProvider(), useDashboardCommand(), NavMain(), NavSecondary(), NavSecondaryItem (+27 more)

### Community 12 - "utils.ts"
Cohesion: 0.13
Nodes (22): ChatUserMenu(), getInitials(), formatWhen(), NotificationsBell(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup() (+14 more)

### Community 13 - "Smoke Checklist"
Cohesion: 0.10
Nodes (22): Booking Intake Skill, Anthropic, book_appointment, Cal.com, Chat, check_availability, Dashboard, DeepSeek (+14 more)

### Community 14 - "data-table.tsx"
Cohesion: 0.07
Nodes (59): generateMetadata(), PageProps, PublicBookingSlugPage(), ChatPage(), AgentChat(), ChatUser, WorkspaceBookingPage(), initial (+51 more)

### Community 15 - "command.tsx"
Cohesion: 0.11
Nodes (22): BookingHit, LeadHit, TimezoneSelectProps, Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput() (+14 more)

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
Cohesion: 0.13
Nodes (34): Params, POST(), GET(), Params, PATCH(), GET(), POST(), getChatActor() (+26 more)

### Community 20 - "input-group.tsx"
Cohesion: 0.25
Nodes (16): AiHealthAlert, AnalyticsDayPoint, AnalyticsKpis, buildAiHealthAlerts(), buildAnalyticsKpis(), buildDailySeries(), buildLeadFunnel(), AnalyticsDashboardData (+8 more)

### Community 21 - "GSAP Core Skill"
Cohesion: 0.21
Nodes (15): GSAP Core Skill, GSAP Frameworks Skill, GSAP Performance Skill, GSAP Plugins Skill, GSAP React Skill, GSAP ScrollTrigger Skill, GSAP Timeline Skill, GSAP Utils Skill (+7 more)

### Community 22 - "agent-message.tsx"
Cohesion: 0.16
Nodes (14): AgentInputResponse, AgentMessage(), AttachmentPart(), authorizationDescription(), AuthorizationPrompt(), authorizationTitle(), EveFilePart, formatAuthorizationOutcome() (+6 more)

### Community 23 - "layout.tsx"
Cohesion: 0.22
Nodes (17): BookingDetailSheet(), BookingRow, BookingsTable(), bookingTitle(), extractEndIso(), extractMeetingUrl(), formatDay(), formatTime() (+9 more)

### Community 24 - "models.ts"
Cohesion: 0.23
Nodes (14): anthropic, deepseek, defaultSlot(), envKeyFor(), extractLatestUserText(), forcedSlot(), google, hasProviderKey() (+6 more)

### Community 25 - "login-form.tsx"
Cohesion: 0.18
Nodes (11): AuthState, signIn(), signUp(), AuthShell(), initial, LoginForm(), initial, SignupForm() (+3 more)

### Community 26 - "@ai-sdk/deepseek"
Cohesion: 0.18
Nodes (14): CreateMeetingTypeSheet(), extractDescription(), extractLocationLabel(), formatDateTime(), initial, LOCATIONS, MeetingTypeDetailSheet(), slugify() (+6 more)

### Community 27 - "reasoning.tsx"
Cohesion: 0.15
Nodes (12): isInAppLink(), MarkdownLink(), normalizeChatLinkHref(), Reasoning, ReasoningContent, ReasoningContentProps, ReasoningContext, ReasoningContextValue (+4 more)

### Community 28 - "High-End Visual Design Skill"
Cohesion: 0.18
Nodes (15): High-End Visual Design Skill, Image to Code Skill, Mobile App Image Generation Skill, Web Frontend Image Generation Skill, Industrial Brutalist UI Skill, Minimalist UI Skill, Redesign Existing Projects Skill, Anti-AI-Slop Patterns (+7 more)

### Community 29 - "dropdown-menu.tsx"
Cohesion: 0.12
Nodes (18): AgentChatThread(), AgentStatus, StatusDot(), ThreadBootstrap, ChatSessionDrawer(), ChatSessionSidebar(), ChatSessionsToggle(), ChatUser (+10 more)

### Community 30 - "Graphify Skill"
Cohesion: 0.15
Nodes (13): Add URL and Watch Folder, Extra Exports and Benchmark, Extraction Subagent Prompt, GitHub Clone and Cross-Repo Merge, Commit Hook and Agent Integration, Query, Path, Explain, Transcribe Video and Audio, Incremental Update and Cluster-only (+5 more)

### Community 31 - "conversation.tsx"
Cohesion: 0.16
Nodes (13): Conversation(), ConversationContent(), ConversationContentProps, ConversationDownload(), ConversationDownloadProps, ConversationEmptyState(), ConversationEmptyStateProps, ConversationProps (+5 more)

### Community 32 - "20260722000008_bookings_list_status.sql"
Cohesion: 0.25
Nodes (14): FaqSettingsForm(), initial, toDraftItems(), chartData, Card(), CardAction(), CardContent(), CardDescription() (+6 more)

### Community 33 - "Design Taste Frontend Skill"
Cohesion: 0.20
Nodes (10): Bias Corrections (Anti-Slop Directives), Design Read (Brief Inference), Design System Map, Pre-Flight Check, Design Taste Frontend Skill, Three Dials (Variance, Motion, Density), Active Baseline Configuration, Creative Arsenal (+2 more)

### Community 35 - "auth-shell.tsx"
Cohesion: 0.11
Nodes (19): chartData, columns, schema, Checkbox(), Drawer(), DrawerClose(), DrawerContent(), DrawerDescription() (+11 more)

### Community 36 - "meeting-types/actions.ts"
Cohesion: 0.18
Nodes (20): leads_updated_at, on_auth_user_created, profiles_updated_at, public.agent_tool_events, public.bookings, public.chat_messages, public.chat_sessions, public.conversation_logs (+12 more)

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
Cohesion: 0.22
Nodes (11): LeadActionState, requireWorkspace(), updateLeadNotesAction(), updateLeadStatusAction(), isLeadStatus(), LEAD_STATUS_VIEWS, LEAD_STATUSES, LEAD_URGENCIES (+3 more)

### Community 41 - "20260722000002_workspaces_leads_bookings.sql"
Cohesion: 0.29
Nodes (10): addDaysYmd(), compareYmd(), todayYmd(), toYmd(), execute(), bookingConfig, AiBookingEventType, listWorkspaceEventTypes() (+2 more)

### Community 42 - "particles.tsx"
Cohesion: 0.14
Nodes (20): syncBookingsAction(), SyncBookingsState, BookingsSyncButton(), rowView(), CAL_BOOKING_LIST_FILTERS, CAL_BOOKING_VIEWS, CalBookingLifecycleStatus, CalBookingListFilter (+12 more)

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
Cohesion: 0.33
Nodes (9): ConversationDetailSheet(), ConversationsTable(), formatWhen(), outcomeBadgeClass(), outcomeLabel(), ViewId, VIEWS, Badge() (+1 more)

### Community 51 - "middleware.ts"
Cohesion: 0.27
Nodes (10): AgentChatInner(), AnalyticsTrendChart(), ChartAreaInteractive(), CopyBookingLink(), TableCellViewer(), SidebarMenuSkeleton(), SidebarProvider(), useIsMobile() (+2 more)

### Community 56 - "auth-shell.tsx"
Cohesion: 0.26
Nodes (14): daysAgoIso(), ensureAiConfigNotifications(), ensureDigestNotifications(), ensureStaleLeadNotifications(), ListNotificationsResult, NOTIFICATION_TYPE_GROUPS, createNotificationDebounced(), CreateNotificationInput (+6 more)

### Community 60 - "ai"
Cohesion: 0.29
Nodes (14): formatDuration(), formatNotice(), MeetingTypesForm(), createMeetingTypeAction(), MeetingTypesActionState, mirrorRow(), requireWorkspaceId(), revalidateMeetingTypePaths() (+6 more)

### Community 62 - "@dnd-kit/core"
Cohesion: 0.20
Nodes (8): Active path, Archived history, Related, Remote / prod cutover, Schema changes going forward, Seed vs schema, Supabase migrations workflow, Archived incremental migrations

### Community 63 - "@dnd-kit/modifiers"
Cohesion: 0.14
Nodes (15): highlights, BorderBeam(), BorderBeamProps, AnimatedGridPattern(), AnimatedGridPatternProps, Square, BlurFade(), BlurFadeProps (+7 more)

### Community 64 - "@dnd-kit/sortable"
Cohesion: 0.38
Nodes (12): execute(), execute(), nextStatusOnLog(), logAgentToolEvent(), normalizeLeadUrgency(), findWorkspaceLead(), upsertLeadAsBooked(), createNotification() (+4 more)

### Community 65 - "app/layout.tsx"
Cohesion: 0.24
Nodes (8): LeadRow, Label(), Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger(), Textarea()

### Community 67 - "@gsap/react"
Cohesion: 0.15
Nodes (13): @ai-sdk/deepseek, @dnd-kit/sortable, gsap, nanoid, next-themes, dependencies, @ai-sdk/deepseek, @dnd-kit/sortable (+5 more)

### Community 70 - "motion"
Cohesion: 0.28
Nodes (8): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea()

### Community 71 - "nanoid"
Cohesion: 0.29
Nodes (10): AiHealthPanel(), severityClass(), severityIcon(), formatWhen(), initialOf(), LeadDetailSheet(), LeadsTable(), statusBadgeClass() (+2 more)

### Community 79 - "timezones.ts"
Cohesion: 0.36
Nodes (5): DashboardRefreshButton(), TITLE_BY_PATH, Button(), buttonVariants, Separator()

### Community 82 - "meeting-types-form.tsx"
Cohesion: 0.06
Nodes (69): GET(), Params, GET(), parseCursor(), GET(), sanitizeIlike(), uniqueById(), signOut() (+61 more)

### Community 83 - "@shikijs/engine-oniguruma"
Cohesion: 0.53
Nodes (4): ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 101 - "eve.ts"
Cohesion: 0.15
Nodes (24): nowHm(), todayLabel(), buildMarkdown(), firstAttr(), instructionsForCtx(), languagePolicy(), faqSkill(), parseFaqItems() (+16 more)

## Knowledge Gaps
- **465 isolated node(s):** `EveAuth`, `AgentStatus`, `ThreadBootstrap`, `AgentInputResponse`, `EveFilePart` (+460 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **71 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `prompt-input.tsx`, `message.tsx`, `code-block.tsx`, `createClient`, `landing-page.tsx`, `sidebar.tsx`, `agent-chat.tsx`, `data-table.tsx`, `utils.ts`, `data-table.tsx`, `command.tsx`, `chain-of-thought.tsx`, `agent-message.tsx`, `layout.tsx`, `login-form.tsx`, `@ai-sdk/deepseek`, `reasoning.tsx`, `dropdown-menu.tsx`, `conversation.tsx`, `20260722000008_bookings_list_status.sql`, `auth-shell.tsx`, `shimmer.tsx`, `workspace-settings-form.tsx`, `middleware.ts`, `clsx`, `ai`, `@dnd-kit/modifiers`, `app/layout.tsx`, `motion`, `nanoid`, `timezones.ts`, `meeting-types-form.tsx`, `@shikijs/engine-oniguruma`?**
  _High betweenness centrality (0.269) - this node is a cross-community bridge._
- **Why does `dependencies` connect `@gsap/react` to `@supabase/ssr`, `@tabler/icons-react`, `@tailwindcss/postcss`, `scripts`, `toggle-group.tsx`, `landing-page.tsx`, `react-is`, `@ai-sdk/google`, `Smoke Checklist`, `@shikijs/engine-oniguruma`, `shiki`, `@vvo/tzdb`, `badge.tsx`, `@ai-sdk/google`, `dependencies`, `middleware.ts`, `particles.tsx`, `class-variance-authority`, `lucide-react`, `next-themes`, `@phosphor-icons/react`, `radix-ui`, `recharts`, `@shikijs/core`, `markdown-link.tsx`, `streamdown`, `@streamdown/math`, `@ai-sdk/anthropic`, `workspace-settings-form.tsx`, `tailwind-merge`, `tailwindcss`, `badge.tsx`, `use-stick-to-bottom`, `vaul`, `@vercel/connect`, `zod`, `20260722000003_pilot_profile_workspace.sql`, `slugify`, `20260722000005_workspace_faq_write_policies.sql`, `createClient`, `@streamdown/code`, `react-dom`, `@streamdown/mermaid`, `timezone-select.tsx`, `tw-animate-css`, `hover-card.tsx`, `@streamdown/math`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `react` connect `middleware.ts` to `20260722000008_bookings_list_status.sql`, `@gsap/react`, `createClient`, `nanoid`, `agent-chat.tsx`, `data-table.tsx`, `utils.ts`, `data-table.tsx`, `workspace-settings-form.tsx`, `meeting-types-form.tsx`, `@shikijs/engine-oniguruma`, `layout.tsx`, `dropdown-menu.tsx`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **What connects `EveAuth`, `AgentStatus`, `ThreadBootstrap` to the rest of the system?**
  _465 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prompt-input.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03247261345852895 - nodes in this community are weakly interconnected._
- **Should `calcom.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11576354679802955 - nodes in this community are weakly interconnected._
- **Should `message.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06201550387596899 - nodes in this community are weakly interconnected._