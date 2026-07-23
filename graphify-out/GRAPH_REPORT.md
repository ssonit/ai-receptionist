# Graph Report - eve  (2026-07-23)

## Corpus Check
- 228 files · ~218,199 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1354 nodes · 2970 edges · 137 communities (72 shown, 65 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `afc11f9b`
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
- client.ts
- lucide-react
- motion
- nanoid
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
- streamdown
- @streamdown/math
- @supabase/ssr
- @ai-sdk/anthropic
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
- clsx
- @dnd-kit/modifiers
- 20260723000006_agent_tool_events.sql
- @gsap/react
- chart.tsx
- next
- 20260723000008_notifications.sql
- meeting-types/actions.ts
- account-profile-form.tsx
- particles.tsx
- @ai-sdk/google
- 20260723000009_notifications_phase2.sql

## God Nodes (most connected - your core abstractions)
1. `cn()` - 267 edges
2. `createClient()` - 50 edges
3. `createAdminClient()` - 42 edges
4. `getPilotWorkspaceId()` - 37 edges
5. `getDashboardUser()` - 28 edges
6. `Button()` - 26 edges
7. `react` - 25 edges
8. `compilerOptions` - 16 edges
9. `Badge()` - 15 edges
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

## Communities (137 total, 65 thin omitted)

### Community 0 - "prompt-input.tsx"
Cohesion: 0.03
Nodes (56): AttachmentsContext, captureScreenshot(), convertBlobUrlToDataUrl(), LocalAttachmentsContext, LocalReferencedSourcesContext, PromptInput(), PromptInputActionAddAttachments(), PromptInputActionAddAttachmentsProps (+48 more)

### Community 1 - "calcom.ts"
Cohesion: 0.06
Nodes (69): addDaysYmd(), compareYmd(), nowHm(), todayLabel(), todayYmd(), toYmd(), buildMarkdown(), execute() (+61 more)

### Community 2 - "message.tsx"
Cohesion: 0.09
Nodes (24): MessageActionProps, MessageActions(), MessageActionsProps, MessageBranch(), MessageBranchContent(), MessageBranchContentProps, MessageBranchContext, MessageBranchContextType (+16 more)

### Community 3 - "code-block.tsx"
Cohesion: 0.06
Nodes (33): CodeBlockActions(), CodeBlockBody, CodeBlockContainer(), CodeBlockContent(), CodeBlockContext, CodeBlockContextType, CodeBlockCopyButton(), CodeBlockCopyButtonProps (+25 more)

### Community 4 - "cn"
Cohesion: 0.07
Nodes (32): PromptInputActionMenuContent(), PromptInputActionMenuItem(), PromptInputBody(), PromptInputButton(), PromptInputCommand(), PromptInputCommandEmpty(), PromptInputCommandGroup(), PromptInputCommandInput() (+24 more)

### Community 5 - "createClient"
Cohesion: 0.07
Nodes (48): GET(), Params, GET(), sanitizeIlike(), uniqueById(), ChatPage(), AgentChat(), AccountProfileForm() (+40 more)

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
Nodes (15): CodeBlock(), getStatusBadge(), statusIcons, statusLabels, Tool(), ToolContent(), ToolContentProps, ToolHeader() (+7 more)

### Community 10 - "agent-chat.tsx"
Cohesion: 0.24
Nodes (9): Select(), SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger() (+1 more)

### Community 11 - "data-table.tsx"
Cohesion: 0.23
Nodes (10): ChartConfig, ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), INITIAL_DIMENSION, THEMES (+2 more)

### Community 12 - "utils.ts"
Cohesion: 0.07
Nodes (65): execute(), execute(), nextStatusOnLog(), Params, POST(), GET(), Params, PATCH() (+57 more)

### Community 13 - "Smoke Checklist"
Cohesion: 0.10
Nodes (22): Booking Intake Skill, Anthropic, book_appointment, Cal.com, Chat, check_availability, Dashboard, DeepSeek (+14 more)

### Community 14 - "dropdown-menu.tsx"
Cohesion: 0.30
Nodes (9): initial, WorkspaceSettingsForm(), optionalText(), requireWorkspaceId(), saveWorkspaceSettings(), WorkspaceMeetingTypeRow, WorkspaceSettingsFormProps, WorkspaceSettingsState (+1 more)

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
Cohesion: 0.10
Nodes (20): ChainOfThought, ChainOfThoughtContent, ChainOfThoughtContentProps, ChainOfThoughtContext, ChainOfThoughtContextValue, ChainOfThoughtHeader, ChainOfThoughtHeaderProps, ChainOfThoughtImage (+12 more)

### Community 19 - "tool.tsx"
Cohesion: 0.38
Nodes (8): ensureVisitorId(), ensureVisitorIdOnResponse(), getVisitorId(), isVisitorId(), readVisitorIdFromRequest(), visitorCookieOptions(), config, middleware()

### Community 20 - "input-group.tsx"
Cohesion: 0.21
Nodes (10): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea() (+2 more)

### Community 21 - "GSAP Core Skill"
Cohesion: 0.21
Nodes (15): GSAP Core Skill, GSAP Frameworks Skill, GSAP Performance Skill, GSAP Plugins Skill, GSAP React Skill, GSAP ScrollTrigger Skill, GSAP Timeline Skill, GSAP Utils Skill (+7 more)

### Community 22 - "agent-message.tsx"
Cohesion: 0.17
Nodes (13): AgentInputResponse, AgentMessage(), AttachmentPart(), authorizationDescription(), AuthorizationPrompt(), authorizationTitle(), EveFilePart, formatAuthorizationOutcome() (+5 more)

### Community 24 - "models.ts"
Cohesion: 0.23
Nodes (14): anthropic, deepseek, defaultSlot(), envKeyFor(), extractLatestUserText(), forcedSlot(), google, hasProviderKey() (+6 more)

### Community 25 - "login-form.tsx"
Cohesion: 0.17
Nodes (12): AuthState, signIn(), signUp(), AuthShell(), initial, LoginForm(), initial, SignupForm() (+4 more)

### Community 27 - "reasoning.tsx"
Cohesion: 0.15
Nodes (12): isInAppLink(), MarkdownLink(), normalizeChatLinkHref(), Reasoning, ReasoningContent, ReasoningContentProps, ReasoningContext, ReasoningContextValue (+4 more)

### Community 28 - "High-End Visual Design Skill"
Cohesion: 0.18
Nodes (15): High-End Visual Design Skill, Image to Code Skill, Mobile App Image Generation Skill, Web Frontend Image Generation Skill, Industrial Brutalist UI Skill, Minimalist UI Skill, Redesign Existing Projects Skill, Anti-AI-Slop Patterns (+7 more)

### Community 29 - "dropdown-menu.tsx"
Cohesion: 0.29
Nodes (6): metadata, mono, RootLayout(), sans, Toaster(), TooltipProvider()

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
Nodes (11): ai, @ai-sdk/deepseek, gsap, dependencies, ai, @ai-sdk/deepseek, gsap, shiki (+3 more)

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
Cohesion: 0.08
Nodes (37): AppSidebar(), navMain, navSecondary, useDashboardCommand(), DashboardCommand(), NavMain(), NavSecondary(), NavSecondaryItem (+29 more)

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
Cohesion: 0.26
Nodes (13): AiHealthPanel(), severityClass(), severityIcon(), chartData, Badge(), badgeVariants, Card(), CardAction() (+5 more)

### Community 51 - "middleware.ts"
Cohesion: 0.08
Nodes (42): ChatSessionDrawer(), ChatSessionSidebar(), ChatSessionsToggle(), LeadActionState, requireWorkspace(), updateLeadNotesAction(), updateLeadStatusAction(), ConversationDetailSheet() (+34 more)

### Community 54 - "blur-fade.tsx"
Cohesion: 0.21
Nodes (10): AgentChatThread(), AgentStatus, StatusDot(), suggestions, ThreadBootstrap, ChatUser, PromptInputMessage, ChatSessionRow (+2 more)

### Community 55 - "bookings-table.tsx"
Cohesion: 0.16
Nodes (12): DashboardRefreshButton(), ShimmerButton, ShimmerButtonProps, SiteHeader(), Button(), buttonVariants, ButtonGroup(), ButtonGroupSeparator() (+4 more)

### Community 56 - "auth-shell.tsx"
Cohesion: 0.06
Nodes (46): signOut(), ChatUserMenu(), getInitials(), chartData, columns, schema, getInitials(), NavUser() (+38 more)

### Community 59 - "clsx"
Cohesion: 0.21
Nodes (8): highlights, BorderBeam(), BorderBeamProps, AnimatedGridPattern(), AnimatedGridPatternProps, Square, AnimatedShinyText(), AnimatedShinyTextProps

### Community 60 - "cmdk"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 63 - "@dnd-kit/modifiers"
Cohesion: 0.24
Nodes (15): AiHealthAlert, AnalyticsDayPoint, AnalyticsKpis, buildAiHealthAlerts(), buildAnalyticsKpis(), buildDailySeries(), buildLeadFunnel(), AnalyticsDashboardData (+7 more)

### Community 67 - "@gsap/react"
Cohesion: 0.50
Nodes (4): BlurFade(), BlurFadeProps, getFilter(), MarginType

### Community 82 - "utils.ts"
Cohesion: 0.18
Nodes (20): faqSkill(), FaqSettingsForm(), initial, toDraftItems(), parseFaqItems(), saveFaqSettings(), blockSection(), buildBookingFaqMarkdown() (+12 more)

### Community 131 - "chart.tsx"
Cohesion: 0.24
Nodes (10): AnalyticsTrendChart(), ChartAreaInteractive(), DataTable(), TableCellViewer(), ChartContainer(), SidebarMenuSkeleton(), SidebarProvider(), useIsMobile() (+2 more)

### Community 134 - "meeting-types/actions.ts"
Cohesion: 0.38
Nodes (11): createMeetingTypeAction(), mirrorRow(), requireWorkspaceId(), revalidateMeetingTypePaths(), setAiBookingMeetingTypeAction(), setAiBookingOnWorkspace(), syncMeetingTypesAction(), CalEventType (+3 more)

### Community 136 - "account-profile-form.tsx"
Cohesion: 0.23
Nodes (13): CreateMeetingTypeSheet(), DetailRow(), extractDescription(), extractLocationLabel(), formatDateTime(), formatDuration(), formatNotice(), initial (+5 more)

### Community 137 - "particles.tsx"
Cohesion: 0.47
Nodes (5): Circle, hexToRgb(), MousePosition, Particles(), ParticlesProps

## Knowledge Gaps
- **442 isolated node(s):** `AgentStatus`, `suggestions`, `ThreadBootstrap`, `AgentInputResponse`, `EveFilePart` (+437 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **65 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `prompt-input.tsx`, `calcom.ts`, `message.tsx`, `code-block.tsx`, `chart.tsx`, `createClient`, `landing-page.tsx`, `account-profile-form.tsx`, `sidebar.tsx`, `data-table.tsx`, `utils.ts`, `particles.tsx`, `agent-chat.tsx`, `command.tsx`, `chain-of-thought.tsx`, `input-group.tsx`, `agent-message.tsx`, `login-form.tsx`, `reasoning.tsx`, `dropdown-menu.tsx`, `conversation.tsx`, `shimmer.tsx`, `particles.tsx`, `workspace-settings-form.tsx`, `middleware.ts`, `blur-fade.tsx`, `bookings-table.tsx`, `auth-shell.tsx`, `clsx`, `cmdk`?**
  _High betweenness centrality (0.304) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `@dnd-kit/modifiers`, `@gsap/react`, `chart.tsx`, `next`, `scripts`, `@ai-sdk/google`, `Smoke Checklist`, `auth-shell.tsx`, `chart.tsx`, `class-variance-authority`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@shikijs/engine-javascript`, `lucide-react`, `motion`, `nanoid`, `next-themes`, `@phosphor-icons/react`, `radix-ui`, `@radix-ui/react-use-controllable-state`, `faq/actions.ts`, `recharts`, `@shikijs/core`, `@shikijs/engine-oniguruma`, `streamdown`, `@streamdown/math`, `@supabase/ssr`, `@ai-sdk/anthropic`, `@tabler/icons-react`, `tailwind-merge`, `tailwindcss`, `use-stick-to-bottom`, `vaul`, `@vercel/connect`, `zod`, `@streamdown/cjk`, `@streamdown/code`, `react-dom`, `@streamdown/mermaid`, `@supabase/supabase-js`, `tw-animate-css`, `hover-card.tsx`, `clsx`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `react` connect `chart.tsx` to `calcom.ts`, `dependencies`, `createClient`, `particles.tsx`, `data-table.tsx`, `utils.ts`, `middleware.ts`, `blur-fade.tsx`, `auth-shell.tsx`, `cmdk`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **What connects `AgentStatus`, `suggestions`, `ThreadBootstrap` to the rest of the system?**
  _442 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prompt-input.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03424056189640035 - nodes in this community are weakly interconnected._
- **Should `calcom.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05727605727605728 - nodes in this community are weakly interconnected._
- **Should `message.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._