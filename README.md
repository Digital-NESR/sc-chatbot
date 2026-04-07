# Supply Chain AI - Technical Documentation & System Context

This document is the **Ultimate Source of Truth** for the Supply Chain AI project. 
It is specifically designed to provide **comprehensive system context for AI Coding Assistants**, new developers, and architects. It details the exact stack, relational database architecture, business logic, and API contracts used throughout the platform.

---

## 1. Project Overview & AI Context

**Core Purpose:** Supply Chain AI is an enterprise-grade AI assistant platform built for NESR. It acts as a specialized conversational interface to disparate internal datasets (like Power BI, Logistics Policies, and Material Stock). 
Unlike generic LLMs, it restricts standard prompting by routing user queries into dedicated, highly tuned **AI Agents** (e.g., Material AI, SC Policy AI, SourceGuide AI).

**AI Context:** 
If you are an AI coding assistant reading this document, you must adhere strictly to the following parameters:
- **Never hardcode values** that belong in `src/config/site.ts`.
- **Enforce UI consistency:** Stick to the NESR brand green (`#307c4c`) and Tailwind CSS framework.
- **Respect Database Migrations:** The `User` and `ChatSession` normalized structure is complex; do not bypass Prisma relations when interacting directly with DB creation/update flows.

---

## 2. Tech Stack & Dependencies

The complete ecosystem of the application leverages:

- **Next.js (App Router)**: Framework for handling React Server Components (RSC) and backend API proxying.
- **Tailwind CSS**: Utility-first CSS. Modifying styles should always rely on arbitrarily built arbitrary hex variables defined in `tailwind.config.mjs` or inline `[#307c4c]`.
- **Prisma ORM**: Strongly typed database querying abstraction.
- **Neon (PostgreSQL)**: Scalable, serverless Postgres database where the Prisma schema is deployed.
- **n8n Orchestration (Backend/Webhook Context)**: The heavy lifting of AI processing (LLM chain construction, tool calling via DAX for PowerBI) is sent via Webhooks to self-hosted/cloud **n8n** nodes. 
- **NextAuth.js (v4)**: Session management driving Azure AD (Microsoft Entra) SSO and JWT logic.
- **Recharts**: Implemented aggressively inside the Admin Analytics Dashboard (`/admin`) for complex time-series data aggregation and dynamic multi-agent usage tracking.
- **react-markdown & remark-gfm**: Used to gracefully decode and format Markdown output pushed natively by n8n agents into the chat UI.

---

### 3. System Architecture & Data Flow

**Core Architecture Overview**
The system operates on a decoupled architecture where **Next.js** handles the frontend UI, authentication, and database state, while **n8n** acts as an independent, headless AI orchestration engine. They communicate strictly via HTTP Webhooks. 

**Data Lifecycle & System Interaction**

1. **Authentication & User DB Sync (Next.js -> Neon Postgres):** The user logs in via SSO. The NextAuth `jwt` and `session` callbacks intercept the login payload and perform a Prisma `upsert` operation against the **Neon Postgres Database**. This ensures the `User` table is always up to date with the latest SSO attributes (email, displayName, jobTitle, department, country, employeeId).
2. **Session Initialization & Persistence (Next.js -> Neon Postgres):** When a user selects an AI Agent (e.g., `sourceguide`), Next.js creates a new `ChatSession` record in the Neon Postgres database via Prisma, establishing a relational link to the `User` via their email.
3. **Webhook Dispatch (Next.js API -> n8n):** When the user submits a prompt, the Next.js backend route handler (`/api/chat/...`) intercepts it. It saves the user's message to the database, constructs a JSON payload containing the prompt and necessary context, and fires an **HTTP POST request to a dedicated n8n Webhook URL** mapped specifically to that agent. Next.js then awaits the response.
4. **Agentic Orchestration (n8n -> External APIs):** n8n intercepts the webhook. It acts as the "brain," routing the prompt to the appropriate LLM (OpenAI/Gemini). The LLM determines if it needs to use external tools. If required, n8n executes these tools via HTTP Request nodes—for example, sending dynamically generated DAX queries to the **Power BI API**, or querying a vector database (like Pinecone) for PDF knowledge retrieval.
5. **Response Delivery (n8n -> Next.js API -> Frontend):** Once n8n synthesizes the final response, it concludes the webhook workflow by returning a standard Markdown string as the HTTP response payload back to the waiting Next.js API. Next.js saves this AI response to the Neon Postgres database and forwards it to the client, where it is mapped to UI components via `react-markdown` (including rendering custom Markdown tables).

![System Architecture Diagram](C:\Users\MohammedFarhan\Downloads\chat\sc-chatbot\public\ArchDiagram.png)

**Admin Dashboard Routing & Protection Logic**

* **Path:** `/admin` and `/api/admin/...`
* **Protection:** NextAuth session validation intercepts unauthenticated calls. Furthermore, an explicit configuration array via the `ADMIN_EMAILS` environment variable governs strict authorization.
* **Enforcement:** If a logged-in user attempts to access the Admin UI or trigger an Admin API route, the system checks their email against the parsed `ADMIN_EMAILS` array. If their email is missing, Next.js immediately kicks back a `403 Forbidden` Server Response on the API side, or forces a hard redirect to the home page (`/`) on the client side. This ensures usage metrics and chat histories are completely locked down.

---

## 4. Database Schema (Prisma)

The application utilizes a highly normalized PostgreSQL relational model to maintain scale and reporting accuracy.

```prisma
model User {
  email       String   @id
  displayName String?
  jobTitle    String?
  department  String?
  country     String?
  employeeId  String?
  chatSessions ChatSession[]
}

model ChatSession {
  id          String    @id @default(cuid())
  userEmail   String    @default("") // Foreign Key bridging relation to User Table
  user        User      @relation(fields: [userEmail], references: [email], onDelete: Cascade)
  botId       String    // Matches Agent ID inside siteConfig.ts
  title       String    @default("New Conversation")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  isDeleted   Boolean   @default(false) // Soft Delete Architecture
  messages    Message[]
}

model Message {
  id        String   @id @default(cuid())
  sessionId String
  role      String   // 'user' | 'assistant'
  content   String   @db.Text
  createdAt DateTime @default(now())
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

**Key DB Context**:
- **Normalized Data**: Profile details (Department, Country, Job Title) live explicitly on the `User` table, updated natively on *every SSO login* via an automatic `prisma.user.upsert` block inside `authOptions.ts`.
- **Soft Deletions**: We never hard-delete sessions inside the UI. Deletions flip the `isDeleted = true` flag. This allows Administators continuous audit-trail visibility underneath Level 2 Admin analytics.

---

## 5. AI Agents & Business Logic

The framework dictates that bots are rigidly separated by domain logic (`src/config/site.ts`).

### Current Agents:
1. **Material AI (`material`)**: Focuses on inventory, VDC stock, duplicate parts, and material tracking.
2. **SC Policy AI (`logistics`)**: A highly sophisticated Vector Retrieval system querying unstructured PDF documentation regarding exact internal supply chain operational policies.
3. **SourceGuide AI (`sourceguide`)**: Built to bridge vendor procurement queries. Uses highly specific n8n logic and heavy DAX logic to query standard internal PowerBI dashboards.

### Logic Frameworks (n8n Webhook Side)
While not directly in the `.ts` codebase, any UI parsing assumes n8n operates with the following frameworks (Example: SourceGuide):
- **Rule of 3**: The AI limits unpaginated mass supplier returns strictly to 3 distinct listings.
- **DAX Query Escaping**: If modifying the n8n JSON nodes or API handlers, standard Double-Quote escape validation *must* happen because PowerBI natively blocks unescaped DAX logic strings passed via REST APIs.

---

## 6. State Management & Component Structure

### Chat Interface
- **State Control**: Utilizes deeply nested local React components holding `messages[]`, `loadingState (boolean)`, and dynamic `AgentIds`. 
- **Tool UI**: Interactions map directly via `role: user/assistant`. 

### Admin Analytics Command Center
Location: `src/app/admin/page.tsx`
Built on a sophisticated **3-Level Drill Down Architecture**:
- **Level 1 (Users Table)**: The surface directory. Evaluates multi-factor aggregation across the `User` Prisma relation pulling `Department`, `Job Title`, `Country` alongside mathematically derived fields: *Total Sessions*, *Active Sessions*, *Total Messages*. Includes dynamic interactive dropdown Slicers hooked up to a secure `useMemo` filter chain.
- **Level 2 (Sessions View)**: Shows specific timelines for an individual selected `userEmail`. Displays exact `createdAt` metrics and highlights explicitly mapped `Soft-Deleted` interactions.
- **Level 3 (Transcript/Message View)**: Dumps raw `/api/admin/messages?sessionId=` logic mapped elegantly through the `react-markdown` interpreter so the Admin sees *exactly* what the user saw.

---

## 7. API Routing Contract

The system uses standard Next.js 14 API Route conventions handling `GET`, `POST`, `DELETE`. 

### Chat Actions
- **`POST /api/chat/message`**
  - **Body**: `{ sessionId: string, botId: string, role: string, content: string }`
  - **Logic**: Creates Session if missing, pushes `user` message to DB, pushes to n8n Webhook, waits for JSON response, pushes `assistant` message to DB, returns new message block.
- **`GET /api/chat/history?sessionId=xyz`**
  - **Logic**: Strictly validated against `session.user.email` matching the session's relational foreign key `userEmail`. Returns raw chronological message arrays.

### Admin Dashboard Interfaces
- **`GET /api/admin/users`**
  - **Returns**: Deep relational fetch pulling `prisma.user.findMany({ include: { chatSessions: true } })`. Emits a complex dual-layer JSON output: `{ users: [...], timeSeriesData: [...], activeTodayCount: number }`.
- **`GET /api/admin/sessions?userEmail=xyz`**
  - **Returns**: Entire session history mapping exclusively up to a defined target `userEmail` parameter.

---

## 8. Environment Variables

Below is documentation outlining the exact environment keys the system relies upon (never hardcode these values!).

```env
# Database Definition (Neon)
DATABASE_URL="postgres://..." # Transactional Pool
DIRECT_URL="postgres://..." # Session Pool for Prisma Migrations

# Azure Entra (Active Directory) SSO
AZURE_AD_CLIENT_ID="UUID"
AZURE_AD_CLIENT_SECRET="Secret_String"
AZURE_AD_TENANT_ID="UUID"
NEXTAUTH_SECRET="Randomized_Cryptographic_String"
NEXTAUTH_URL="http://localhost:3000"

# Admin Override Access Array (Comma Separated Strings)
ADMIN_EMAILS="example_admin1@nesr.com,example_admin2@nesr.com"

# Webhooks pointing to specific n8n Workflow Processors
NEXT_PUBLIC_MATERIAL_WEBHOOK="https://.../webhook/material"
NEXT_PUBLIC_LOGISTICS_WEBHOOK="https://.../webhook/logistics"
NEXT_PUBLIC_SOURCEGUIDE_WEBHOOK="https://.../webhook/sourceguide"
```

---

## 9. Future Development & Known Quirks

- **n8n Reliance**: If the chatbot responds with generic failures (e.g. "Chatbot is not available due to high demand"), it almost exclusively means the n8n endpoint threw a 500 Error or timed out unexpectedly. Next.js natively handles the failure gracefully, but the debugging happens entirely inside the external n8n node execution canvas.
- **DAX Query Power BI Limitations**: Power BI Semantic modes block execution natively within Microsoft environments if RLS (Row Level Security) conflicts with the System Principal calling the endpoint. The `employeeId` parameter populated via the SSO layer inside the Postgres Table is intended to combat mapping these RLS structures internally on the workflow side.
- **IDE Linting**: Complex nested Prisma relation returns often generate superficial IDE Typescript squiggly lines inside API routes (Ex: Property mapping not recognized via loosely typed `ChatSessionWhereInput`) depending on how quickly the Prisma Client generates index files. Rely heavily on `npm run build` logs over inline IDE telemetry when modifying database relation files.

---

👉 **[View our complete UI & Design Guidelines here](UI_GUIDELINES.md)**

---


*(End of Technical Specifications for Supply Chain AI)*
