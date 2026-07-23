# Graph Report - eve  (2026-07-23)

## Corpus Check
- 217 files · ~214,108 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1304 nodes · 2788 edges · 133 communities (70 shown, 63 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5dd2bf83`
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
- dropdown-menu.tsx
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
- chart.tsx
- DESIGN.md
- Stitch Design Taste SKILL.md
- shimmer.tsx
- faq-settings-form.tsx
- 20260722000002_workspaces_leads_bookings.sql
- particles.tsx
- patch-eve-package-resolve.mjs
- 20260722000001_profiles_auth.sql
- Brandkit Skill
- sync-eve-compile.mjs
- GPT Taste Skill
- workspace-settings-form.tsx
- ensure-eve-compile.mjs
- middleware.ts
- 20260722000004_workspace_faq_sections.sql
- Banned Output Patterns
- blur-fade.tsx
- bookings-table.tsx
- auth-shell.tsx
- class-variance-authority
- clsx
- cmdk
- css.d.ts
- @dnd-kit/core
- @dnd-kit/modifiers
- @dnd-kit/sortable
- @dnd-kit/utilities
- @shikijs/engine-javascript
- @gsap/react
- lucide-react
- motion
- nanoid
- next
- next.config.ts
- next-env.d.ts
- next-themes
- @phosphor-icons/react
- radix-ui
- @radix-ui/react-use-controllable-state
- faq/actions.ts
- recharts
- @shikijs/core
- utils.ts
- @shikijs/engine-oniguruma
- blur-fade.tsx
- streamdown
- @streamdown/math
- @supabase/ssr
- layout.tsx
- @tabler/icons-react
- tailwind-merge
- tailwindcss
- badge.tsx
- use-stick-to-bottom
- vaul
- @vercel/connect
- zod
- postcss.config.mjs
- 20260722000006_bookings_synced_at.sql
- No 3-Column Equal Card Layouts
- No Centered Hero Sections
- No Emojis
- No Inter Font
- No Overlapping Elements
- No Pure Black
- Stitch MCP Server
- 20260723000004_workspace_ai_profile.sql
- @streamdown/cjk
- @streamdown/code
- react-dom
- @streamdown/mermaid
- @supabase/supabase-js
- tw-animate-css
- hover-card.tsx
- 20260723000005_leads_status.sql
- createAdminClient
- button.tsx
- 20260723000006_agent_tool_events.sql
- meeting-types/actions.ts
- chart.tsx
- @ai-sdk/deepseek

## God Nodes (most connected - your core abstractions)
1. `cn()` - 263 edges
2. `createClient()` - 42 edges
3. `createAdminClient()` - 34 edges
4. `getPilotWorkspaceId()` - 26 edges
5. `Button()` - 24 edges
6. `getDashboardUser()` - 24 edges
7. `react` - 23 edges
8. `compilerOptions` - 16 edges
9. `Badge()` - 13 edges
10. `normalizeCalApiStatus()` - 13 edges

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

## Communities (133 total, 63 thin omitted)

### Community 0 - "prompt-input.tsx"
Cohesion: 0.04
Nodes (53): AttachmentsContext, captureScreenshot(), convertBlobUrlToDataUrl(), LocalAttachmentsContext, LocalReferencedSourcesContext, PromptInput(), PromptInputActionAddAttachments(), PromptInputActionAddAttachmentsProps (+45 more)

### Community 1 - "calcom.ts"
Cohesion: 0.07
Nodes (53): MeetingTypesForm(), syncBookingsAction(), SyncBookingsState, createMeetingTypeAction(), MeetingTypesActionState, mirrorRow(), requireWorkspaceId(), revalidateMeetingTypePaths() (+45 more)

### Community 2 - "message.tsx"
Cohesion: 0.06
Nodes (36): metadata, mono, RootLayout(), sans, MessageActionProps, MessageActions(), MessageActionsProps, MessageBranch() (+28 more)

### Community 3 - "code-block.tsx"
Cohesion: 0.06
Nodes (33): CodeBlockActions(), CodeBlockBody, CodeBlockContainer(), CodeBlockContent(), CodeBlockContext, CodeBlockContextType, CodeBlockCopyButton(), CodeBlockCopyButtonProps (+25 more)

### Community 4 - "cn"
Cohesion: 0.05
Nodes (46): DetailRow(), PromptInputActionMenuContent(), PromptInputActionMenuItem(), PromptInputBody(), PromptInputButton(), PromptInputCommand(), PromptInputCommandEmpty(), PromptInputCommandGroup() (+38 more)

### Community 5 - "createClient"
Cohesion: 0.09
Nodes (40): GET(), Params, GET(), sanitizeIlike(), uniqueById(), ChatPage(), WorkspaceSettingsForm(), AccountProfileForm() (+32 more)

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
Cohesion: 0.21
Nodes (8): highlights, BorderBeam(), BorderBeamProps, AnimatedGridPattern(), AnimatedGridPatternProps, Square, AnimatedShinyText(), AnimatedShinyTextProps

### Community 12 - "utils.ts"
Cohesion: 0.14
Nodes (27): addDaysYmd(), compareYmd(), nowHm(), todayLabel(), todayYmd(), toYmd(), buildMarkdown(), faqSkill() (+19 more)

### Community 13 - "Smoke Checklist"
Cohesion: 0.10
Nodes (22): Booking Intake Skill, Anthropic, book_appointment, Cal.com, Chat, check_availability, Dashboard, DeepSeek (+14 more)

### Community 14 - "dropdown-menu.tsx"
Cohesion: 0.23
Nodes (13): signOut(), ChatUserMenu(), getInitials(), getInitials(), NavUser(), Avatar(), AvatarBadge(), AvatarFallback() (+5 more)

### Community 15 - "command.tsx"
Cohesion: 0.12
Nodes (19): BookingHit, LeadHit, PAGES, Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput() (+11 more)

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
Cohesion: 0.26
Nodes (12): ConversationDetailSheet(), ConversationsTable(), formatWhen(), outcomeBadgeClass(), outcomeLabel(), ViewId, VIEWS, Tabs() (+4 more)

### Community 20 - "input-group.tsx"
Cohesion: 0.28
Nodes (8): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea()

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

### Community 27 - "reasoning.tsx"
Cohesion: 0.15
Nodes (12): isInAppLink(), MarkdownLink(), normalizeChatLinkHref(), Reasoning, ReasoningContent, ReasoningContentProps, ReasoningContext, ReasoningContextValue (+4 more)

### Community 28 - "High-End Visual Design Skill"
Cohesion: 0.18
Nodes (15): High-End Visual Design Skill, Image to Code Skill, Mobile App Image Generation Skill, Web Frontend Image Generation Skill, Industrial Brutalist UI Skill, Minimalist UI Skill, Redesign Existing Projects Skill, Anti-AI-Slop Patterns (+7 more)

### Community 29 - "dropdown-menu.tsx"
Cohesion: 0.15
Nodes (14): AgentChatThread(), AgentStatus, StatusDot(), suggestions, ThreadBootstrap, ChatSessionDrawer(), ChatSessionSidebar(), ChatSessionsToggle() (+6 more)

### Community 30 - "Graphify Skill"
Cohesion: 0.15
Nodes (13): Add URL and Watch Folder, Extra Exports and Benchmark, Extraction Subagent Prompt, GitHub Clone and Cross-Repo Merge, Commit Hook and Agent Integration, Query, Path, Explain, Transcribe Video and Audio, Incremental Update and Cluster-only (+5 more)

### Community 31 - "conversation.tsx"
Cohesion: 0.16
Nodes (13): Conversation(), ConversationContent(), ConversationContentProps, ConversationDownload(), ConversationDownloadProps, ConversationEmptyState(), ConversationEmptyStateProps, ConversationProps (+5 more)

### Community 33 - "Design Taste Frontend Skill"
Cohesion: 0.20
Nodes (10): Bias Corrections (Anti-Slop Directives), Design Read (Brief Inference), Design System Map, Pre-Flight Check, Design Taste Frontend Skill, Three Dials (Variance, Motion, Density), Active Baseline Configuration, Creative Arsenal (+2 more)

### Community 34 - "dependencies"
Cohesion: 0.18
Nodes (11): ai, clsx, gsap, dependencies, ai, clsx, gsap, shiki (+3 more)

### Community 36 - "chart.tsx"
Cohesion: 0.40
Nodes (4): LenisProvider(), LenisProviderProps, lenis, lenis

### Community 37 - "DESIGN.md"
Cohesion: 0.22
Nodes (8): Accessibility (WCAG 2.2 AA), Color Palette Tokens, Dark Tokenized UI, Radius, Shadow, Motion Tokens, Rerun Brand, Spacing Scale Tokens, Typography Tokens, Writing Tone

### Community 38 - "Stitch Design Taste SKILL.md"
Cohesion: 0.29
Nodes (7): Design System Taste DESIGN.md, Stitch Design Taste SKILL.md, Google Stitch, Inline Image Typography, Perpetual Micro-Loops, Skeletal Shimmer, Spring Physics

### Community 39 - "shimmer.tsx"
Cohesion: 0.33
Nodes (6): getMotionComponent(), motionComponentCache, MotionHTMLProps, Shimmer, ShimmerComponent(), TextShimmerProps

### Community 41 - "20260722000002_workspaces_leads_bookings.sql"
Cohesion: 0.48
Nodes (6): public.bookings, public.conversation_logs, public.leads, public.profiles, public.workspaces, workspaces_updated_at

### Community 42 - "particles.tsx"
Cohesion: 0.47
Nodes (5): Circle, hexToRgb(), MousePosition, Particles(), ParticlesProps

### Community 43 - "patch-eve-package-resolve.mjs"
Cohesion: 0.33
Nodes (4): require, root, source, target

### Community 44 - "20260722000001_profiles_auth.sql"
Cohesion: 0.47
Nodes (5): on_auth_user_created, profiles_updated_at, public.handle_new_user(), public.handle_updated_at(), public.profiles

### Community 45 - "Brandkit Skill"
Cohesion: 0.40
Nodes (5): Board Composition, Logo Concept Methods, Premium Brand Kit Generation, Brandkit Skill, Visual Modes

### Community 47 - "sync-eve-compile.mjs"
Cohesion: 0.40
Nodes (4): folders, fromBase, root, toBase

### Community 48 - "GPT Taste Skill"
Cohesion: 0.50
Nodes (4): AIDA Structure, Advanced GSAP Motion, Python-Driven Randomization, GPT Taste Skill

### Community 49 - "workspace-settings-form.tsx"
Cohesion: 0.10
Nodes (33): AgentChat(), AnalyticsTrendChart(), ChartAreaInteractive(), chartData, DataTable(), TableCellViewer(), CardAction(), ChartConfig (+25 more)

### Community 51 - "middleware.ts"
Cohesion: 0.09
Nodes (47): execute(), execute(), nextStatusOnLog(), Params, POST(), GET(), Params, PATCH() (+39 more)

### Community 54 - "blur-fade.tsx"
Cohesion: 0.15
Nodes (20): FaqSettingsForm(), initial, toDraftItems(), initial, initial, Badge(), badgeVariants, Card() (+12 more)

### Community 55 - "bookings-table.tsx"
Cohesion: 0.11
Nodes (21): DashboardRefreshButton(), SiteHeader(), Separator(), SheetHeader(), Sidebar(), SidebarContext, SidebarContextProps, SidebarGroupAction() (+13 more)

### Community 56 - "auth-shell.tsx"
Cohesion: 0.16
Nodes (13): chartData, columns, schema, Checkbox(), Drawer(), DrawerClose(), DrawerContent(), DrawerDescription() (+5 more)

### Community 59 - "clsx"
Cohesion: 0.13
Nodes (20): AppSidebar(), navMain, navSecondary, DashboardCommandContext, DashboardCommandContextValue, DashboardCommandProvider(), useDashboardCommand(), DashboardCommand() (+12 more)

### Community 60 - "cmdk"
Cohesion: 0.13
Nodes (25): LeadActionState, requireWorkspace(), updateLeadNotesAction(), updateLeadStatusAction(), AiHealthAlert, AnalyticsDayPoint, AnalyticsKpis, buildAiHealthAlerts() (+17 more)

### Community 84 - "blur-fade.tsx"
Cohesion: 0.50
Nodes (4): BlurFade(), BlurFadeProps, getFilter(), MarginType

### Community 88 - "layout.tsx"
Cohesion: 0.18
Nodes (15): AiHealthPanel(), severityClass(), severityIcon(), formatWhen(), initialOf(), LeadDetailSheet(), LeadRow, LeadsTable() (+7 more)

### Community 127 - "createAdminClient"
Cohesion: 0.18
Nodes (7): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuGroup(), DropdownMenuRadioItem(), DropdownMenuShortcut(), DropdownMenuSubContent(), DropdownMenuSubTrigger()

### Community 128 - "button.tsx"
Cohesion: 0.14
Nodes (19): CreateMeetingTypeSheet(), extractDescription(), extractLocationLabel(), formatDateTime(), formatDuration(), formatNotice(), initial, LOCATIONS (+11 more)

### Community 130 - "meeting-types/actions.ts"
Cohesion: 0.50
Nodes (3): HoverCard(), HoverCardContent(), HoverCardTrigger()

## Knowledge Gaps
- **430 isolated node(s):** `AgentStatus`, `suggestions`, `ThreadBootstrap`, `AgentInputResponse`, `EveFilePart` (+425 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `button.tsx`, `calcom.ts`, `message.tsx`, `code-block.tsx`, `prompt-input.tsx`, `meeting-types/actions.ts`, `landing-page.tsx`, `sidebar.tsx`, `agent-chat.tsx`, `dropdown-menu.tsx`, `command.tsx`, `chain-of-thought.tsx`, `tool.tsx`, `input-group.tsx`, `agent-message.tsx`, `layout.tsx`, `login-form.tsx`, `reasoning.tsx`, `dropdown-menu.tsx`, `conversation.tsx`, `shimmer.tsx`, `particles.tsx`, `workspace-settings-form.tsx`, `blur-fade.tsx`, `bookings-table.tsx`, `auth-shell.tsx`, `clsx`, `utils.ts`, `layout.tsx`, `createAdminClient`?**
  _High betweenness centrality (0.295) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `chart.tsx`, `@ai-sdk/deepseek`, `scripts`, `data-table.tsx`, `Smoke Checklist`, `auth-shell.tsx`, `chart.tsx`, `workspace-settings-form.tsx`, `class-variance-authority`, `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@shikijs/engine-javascript`, `@gsap/react`, `lucide-react`, `motion`, `nanoid`, `next`, `next-themes`, `@phosphor-icons/react`, `radix-ui`, `@radix-ui/react-use-controllable-state`, `faq/actions.ts`, `recharts`, `@shikijs/core`, `@shikijs/engine-oniguruma`, `streamdown`, `@streamdown/math`, `@supabase/ssr`, `@tabler/icons-react`, `tailwind-merge`, `tailwindcss`, `use-stick-to-bottom`, `vaul`, `@vercel/connect`, `zod`, `@streamdown/cjk`, `@streamdown/code`, `react-dom`, `@streamdown/mermaid`, `@supabase/supabase-js`, `tw-animate-css`, `hover-card.tsx`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `react` connect `workspace-settings-form.tsx` to `dependencies`, `tool.tsx`, `bookings-table.tsx`, `layout.tsx`, `layout.tsx`, `clsx`, `dropdown-menu.tsx`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **What connects `AgentStatus`, `suggestions`, `ThreadBootstrap` to the rest of the system?**
  _430 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prompt-input.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03521825396825397 - nodes in this community are weakly interconnected._
- **Should `calcom.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06838106370543542 - nodes in this community are weakly interconnected._
- **Should `message.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0627177700348432 - nodes in this community are weakly interconnected._