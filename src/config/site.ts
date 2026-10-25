import { Package, Truck, Search, PackageSearch, Sparkles, type LucideIcon } from 'lucide-react';

/* ─────────────────────────────────────────────
   SINGLE SOURCE OF TRUTH
   All static text, images, and colors live here.
   Never hardcode these values in components.
   ───────────────────────────────────────────── */

export interface AgentConfig {
    id: string;
    name: string;
    icon: LucideIcon;
    description: string;
    tagline: string;
    disclaimer: string;
    /**
     * The buffered webhook. For the four specialists this is also the one the
     * orchestrator calls as a tool, so it must keep answering in plain JSON.
     */
    webhookUrl: string;
    /**
     * A second webhook on the same n8n workflow, in streaming mode, for the
     * app's own use.
     *
     * The specialists need two because each serves two consumers: the browser,
     * which wants the answer as it is written, and the orchestrator, which
     * reads it as JSON through an httpRequestTool. One webhook cannot do both,
     * so each workflow has a streaming trigger and a buffered one feeding the
     * same agent. The orchestrator needs no second webhook - nothing but the
     * app consumes it - so it streams on its only one.
     *
     * Absent or empty falls back to webhookUrl, which still works: a buffered
     * upstream arrives as one chunk rather than many.
     */
    streamWebhookUrl?: string;
    /**
     * Read this agent's reply as it is written rather than all at once.
     *
     * Turning this off puts an agent back on the buffered code path, which is
     * the same code it used before streaming existed. That is the rollback,
     * and it is per agent on purpose.
     */
    streaming?: boolean;
}

/**
 * Which webhook to call for an agent, and whether to read it as a stream.
 *
 * Kept here rather than at the call site so the fallbacks are stated once. A
 * missing stream webhook is not a failure: the agent is simply asked to stream
 * on its buffered webhook, and the whole answer arrives as a single chunk.
 */
export function agentEndpoint(agent: AgentConfig): { url: string; stream: boolean } {
    if (!agent.streaming) return { url: agent.webhookUrl, stream: false };
    return { url: agent.streamWebhookUrl || agent.webhookUrl, stream: true };
}

export const siteConfig = {
    /* ── Colors ── */
    colors: {
        brandPrimary: '#307c4c',
        brandPrimaryHover: '#25603a',
        brandPrimaryActive: '#1f5232',
        brandPrimaryDark: '#28663E',

        // Chat bubble colors
        userBubbleBg: '#307c4c',
        assistantBubbleBg: '#f0f0f0',
        assistantBubbleBorder: '#e0e0e0',
        assistantTextColor: '#1a1a1a',

        // Login
        loginGlow: 'rgba(48,124,76,0.35)',
        loginBgGlow: '#307c4c',

        // Fallback avatar
        fallbackAvatarBg: '#307c4c',

        /* Chart series, in fixed assignment order.

           The NESR brand manual asks for charts in the green family, running
           dark to light, with mid gray available. That is a single-hue ramp
           rather than a set of unrelated hues, so the series are told apart by
           lightness, which is also the one signal that survives every form of
           colour blindness. Checked pairwise before being written down.

           Slot 1 is the app's own green so a chart matches the buttons around
           it. Four slots is the cap: a fifth step of one hue stops being
           separable, and every chart carries data labels and a legend anyway.

           The two lighter steps sit under 3:1 against white on their own,
           which is exactly why the data labels are not optional. */
        chartSeries: ['#307c4c', '#8FC4A9', '#1B4D31', '#58595B'],

        // Chart furniture. Recessive on purpose: the grid is a reading aid,
        // not something to look at.
        chartGrid: '#ececec',
        chartAxis: '#D1D3D4',
        chartLabel: '#58595B',
    },

    /* ── Images ── */
    images: {
        logo: '/nesr-logo.jpg',
        favicon: '/icon.png',
    },

    /* ── Text Strings ── */
    text: {
        appName: 'Supply Chain AI',
        appDescription: 'Intelligent Supply Chain Assistant',

        // Shown by <BetaBadge /> wherever the product names itself. The word
        // lives here rather than in the component so it can be changed or
        // emptied in one place when this stops being a beta.
        betaLabel: 'Beta',

        // Sidebar
        sidebarTitle: 'Supply Chain AI',
        newChatButton: 'New Chat',
        masterAgentLabel: 'MASTER AGENT',
        agentsLabel: 'SUBORDINATE AGENTS',
        signOutButton: 'Sign Out',

        // Chat
        chattingWith: 'Chatting with',
        youLabel: 'You',
        defaultUserName: 'NESR User',
        defaultJobTitle: 'NESR Employee',
        inputPlaceholder: (agentName: string) => `Message ${agentName}...`,
        disclaimer: (agentDisclaimer: string) =>
            `Supply Chain AI Internal Tool (Beta) • ${agentDisclaimer}`,
        welcomeGreeting: (agentName: string) => `Hello, I am ${agentName}.`,

        /* The conversation list. It grows forever and is the one part of the
           app people come back to, so it gets a search box, date headings and
           a way to put a thread out of sight. */
        sidebar: {
            history: 'Chat History',
            search: 'Search chats',
            noMatches: 'Nothing matches that.',
            empty: 'No conversations yet.',
            rename: 'Rename',
            renameHint: 'Enter to save, Escape to cancel',
            collapse: 'Hide sidebar',
            expand: 'Show sidebar',
            groups: {
                today: 'Today',
                yesterday: 'Yesterday',
                week: 'Previous 7 days',
                older: 'Older',
            },
        },

        // Table export
        exportTable: 'Export table to Excel',
        copyTable: 'Copy table for Excel',
        jumpToLatest: 'Jump to latest',

        /* What the interface says only to a screen reader.
           State changes only - never the answer text itself, which commits
           about ten times a second and would be read out as a stutter of
           half-sentences restarting over each other. The answer is read the
           normal way, once, when the reader chooses to go to it. */
        a11y: {
            working: (agentName: string) => `${agentName} is working`,
            answerReceived: 'Answer received',
            stopped: 'Stopped before the answer finished',
            failed: 'That did not work',
            copied: 'Copied',
            tableCopied: 'Table copied, ready to paste into a spreadsheet',
            ratingSaved: 'Rating saved',
            ratingCleared: 'Rating removed',
            loadingHistory: 'Loading conversation',
            conversationLoaded: (turns: number) => `Conversation loaded, ${turns} messages`,
        },
        exportFilePrefix: 'SupplyChainAI',

        // A failure the user can do something about, rather than one they can
        // only read. Both put the question back within reach instead of making
        // them type it again.
        tryAgain: 'Try again',
        editQuestion: 'Edit and ask again',

        errorMessage:
            'Detailed error: Unable to connect to the agent. Please try again later.',
        genericError:
            'Chatbot is not available due to high demand right now. Please try again later.',

        // The collapsed "how was this worked out" note under an answer
        derivationLabel: 'How I got this',

        /* What a thumbs-down can say beyond "wrong".
           The thumb is already saved by the time these appear, so every one
           of them is optional - the row can be ignored or dismissed and the
           rating stands. The ids are stored, not the labels, so the wording
           can change without orphaning what has already been collected. */
        feedback: {
            prompt: 'What went wrong?',
            optional: 'optional',
            // On the cross that closes the reason row. It had to be asked
            // about, which means it read as "undo my rating" - so it now says
            // what it actually does.
            dismiss: 'Skip - your rating is already saved',
            thanks: 'Thanks - noted.',
            notePlaceholder: 'In a few words...',
            reasons: [
                { id: 'wrong-number', label: 'Wrong number' },
                { id: 'missing-rows', label: 'Missing rows' },
                { id: 'misread', label: 'Misread my question' },
                { id: 'too-slow', label: 'Too slow' },
                { id: 'other', label: 'Something else' },
            ],
        },

        // Streaming
        stopGenerating: 'Stop generating',
        stoppedLabel: 'Stopped — this answer is incomplete.',
        // Shown under whatever text arrived before a mid-stream failure. The
        // partial answer stays; this says not to trust it as a whole one.
        streamInterrupted: 'The connection dropped before this answer finished.',

        // Login page
        login: {
            title: 'Welcome to Supply Chain AI',
            subtitle: 'Intelligent Supply Chain Assistant · Beta',
            ssoButton: 'Continue with SSO',
            divider: 'or',
            passwordPlaceholder: 'Enter password',
            loginButton: 'Login with Password',
            loadingText: 'Signing in…',
            errorText: 'Incorrect password. Please try again.',
            footer: 'NESR Internal Tool (Beta) • Authorized Personnel Only',
            pageTitle: 'Sign In — Supply Chain AI (Beta)',
        },
    },

    /* ── Thinking Words ──
       Rotated while an agent is working. Kept per agent so the status line
       matches what was actually asked: a material lookup should never claim
       to be referencing purchase orders. Two words max, they sit inline. */
    thinkingWords: {
        orchestrator: [
            'Routing question',
            'Asking specialists',
            'Consulting agents',
            'Gathering answers',
            'Cross-checking',
            'Comparing sources',
            'Combining replies',
            'Pulling it together',
        ],
        material: [
            'Checking stock',
            'Scanning inventory',
            'Matching parts',
            'Finding duplicates',
            'Reading records',
            'Verifying codes',
            'Pulling levels',
            'Searching VDC',
        ],
        logistics: [
            'Reading policies',
            'Finding clauses',
            'Checking rules',
            'Scanning documents',
            'Locating sections',
            'Tracing approvals',
            'Citing sources',
            'Parsing text',
        ],
        sourceguide: [
            'Finding vendors',
            'Ranking suppliers',
            'Checking tiers',
            'Pulling contacts',
            'Matching commodity',
            'Verifying status',
            'Sorting options',
            'Reading contracts',
        ],
        trackrequest: [
            'Tracing request',
            'Checking status',
            'Locating shipment',
            'Reading updates',
            'Following PO',
            'Checking approvals',
            'Pulling timeline',
            'Confirming delivery',
        ],
    },

    /* ── Suggestions ──
       Three templates then two complete questions, per agent.

       The templates end in a colon on purpose: they are the everyday asks,
       and the user finishes them with their own number or material. The two
       complete ones underneath are there to show the product can answer
       something they would not have thought to ask.

       The complete ones were run against the live agents; measured times are
       in the comments. Templates cannot be timed, since they are finished by
       the user.

       Pick the complete ones for whether a buyer would actually ask them, not
       for whether they return quickly. An earlier set was chosen on speed and
       included "how many contracted prices have already expired", which is
       fast, truthful and of no use to anyone. */
    suggestions: {
        orchestrator: [
            'Do we have a material for this, and who supplies it: ',
            'What is the policy and the approved vendor for: ',
            'Is it in stock, and can I raise a PR for it at plant: ',
            'How many purchase orders are waiting for approval right now?',  // 36s
            'Is AF1797M already in the system?',                             // 24s
        ],
        material: [
            'Check VDC stock for material ID: ',
            'Is there a duplicate part for: ',
            'Can I create a new material for: ',
            'We need a 1/2 inch stainless ball valve. Does one already exist?',  // 19s
            'How many materials are flagged for deletion but still have stock?', // 10s
        ],
        logistics: [
            'What is the SC policy for: ',
            'Summarize the policy on: ',
            'What is the procedure for: ',
            'How many quotations do I need before raising a purchase order?',  // 10s
            'What is the approval threshold for a purchase order?',            // 10s
        ],
        sourceguide: [
            'Which suppliers are approved for: ',
            'What have we spent with supplier: ',
            'Is there a sole source approval for: ',
            'Which suppliers are approved for laptops in HQ Dubai?',  // 14s
            'Which suppliers do we spend the most with?',             // 16s
        ],
        trackrequest: [
            'What is the status of my request: ',
            'Where is the shipment for PO: ',
            'Who is holding up PR: ',
            'Who is the bottleneck in approvals right now?',             // 35s
            'Which requests are stuck waiting for approval right now?',   // 37s
        ],
    },


    /* ── Capabilities ──
       Shown in the "What can I do?" panel. Taken from each agent's own answer
       when asked what it can do, then trimmed to what fits in a panel someone
       will actually read. Keep it that way: this is a menu, not documentation.
       If an agent's scope changes, ask it the question again and update here. */
    capabilities: {
        orchestrator: {
            summary:
                'I work out which specialist your question needs, ask them, and come back with one answer. You never have to pick.',
            groups: [
                {
                    title: 'Materials & stock',
                    note: 'Material AI',
                    items: [
                        'Stock levels by plant and storage location',
                        'Duplicate checks before creating a new material',
                        'Stock aging, slow movers and consumption',
                        'Spend and price history',
                    ],
                },
                {
                    title: 'Document tracking',
                    note: 'Track My Request',
                    items: [
                        'Where a PR or PO has got to',
                        'Who is holding up approval, and for how long',
                        'Delivery and goods receipt status',
                        'How much of an order is still in transit',
                    ],
                },
                {
                    title: 'Vendors & sourcing',
                    note: 'SourceGuide AI',
                    items: [
                        'Approved suppliers by material or category',
                        'Contracted prices and what is expiring',
                        'Historic spend by supplier or country',
                        'Sole and single source approvals',
                    ],
                },
                {
                    title: 'Policy & rules',
                    note: 'SC Policy AI',
                    items: [
                        'Approval thresholds and limits',
                        'What is permitted under supply chain policy',
                        'Process and compliance requirements',
                    ],
                },
            ],
            examples: [
                'Do we have material X in stock at plant 1015?',
                'Where is PO 5190034063 and who is sitting on it?',
                'Who are the approved vendors for safety gloves?',
                'What is the approval threshold for capital equipment?',
            ],
        },

        material: {
            summary:
                'I cover the material master, stock on hand and the analysis around them.',
            groups: [
                {
                    title: 'Material master',
                    items: [
                        'Duplicate checks by part number or description',
                        'Whether a material is extended to your plant',
                        'Finding materials by brand, type or characteristics',
                        'Tracing a deleted material to its live replacement',
                    ],
                },
                {
                    title: 'Inventory & stock',
                    items: [
                        'Stock by plant, storage location or VDC',
                        'Stock aging and slow movers',
                        'Goods issues, receipts and consumption history',
                        'Min and max levels, and coverage',
                    ],
                },
                {
                    title: 'Analysis',
                    items: [
                        'Spend by supplier, country, plant or material group',
                        'Price and order value history',
                        'Comparisons across plants',
                    ],
                },
            ],
            examples: [
                'Is AF1797M already in the system?',
                'Check VDC stock for material 000001100000046391',
                'We need a 1/2 inch stainless ball valve. Does one already exist?',
                'How many materials are flagged for deletion but still have stock?',
            ],
            notFor: {
                title: 'Ask Track My Request instead for',
                items: [
                    'The status of one specific PR or PO',
                    'Who is holding a document up',
                    'How much of an order is still to be delivered',
                ],
            },
        },

        trackrequest: {
            summary:
                'I track where your documents are in their lifecycle, from raised to approved to delivered and booked in.',
            groups: [
                {
                    title: 'Where is it',
                    items: [
                        'The status of a PR or PO',
                        'Why a requisition has not been approved yet',
                        'Lists of open requisitions and unapproved orders',
                    ],
                },
                {
                    title: 'Who is sitting on it',
                    items: [
                        'The approver holding a document right now',
                        'How long it has been waiting',
                        'Who is the biggest bottleneck',
                    ],
                },
                {
                    title: 'Delivery & receipt',
                    items: [
                        'Whether an order has been GRN\'ed, including partial deliveries',
                        'What is still outstanding',
                        'Every individual receipt against a line, including reversals',
                        'How much of an order is in transit',
                    ],
                },
            ],
            examples: [
                'Who is the bottleneck in approvals right now?',
                'Which requests are stuck waiting for approval right now?',
                'Show me everything in transit for Iraq.',
                'Which open POs are past their delivery date?',
            ],
            notFor: {
                title: 'Ask Material AI instead for',
                items: [
                    'How much stock we have of a material',
                    'Whether a material already exists, or duplicate checks',
                    'Slow moving stock and spend analysis',
                ],
            },
        },

        sourceguide: {
            summary:
                'I cover who we may buy from, what we actually paid, what it is contracted to cost, and whether the spend has to be competed.',
            groups: [
                {
                    title: 'Approved suppliers',
                    items: [
                        'Who is approved for a commodity or product',
                        'Whether a supplier is approved in your country',
                        'Supplier tier, contact details and block status',
                    ],
                },
                {
                    title: 'Historic spend',
                    items: [
                        'What we bought from a supplier, and at what unit price',
                        'Spend by country, supplier or commodity',
                        'Price comparisons across suppliers or periods',
                    ],
                },
                {
                    title: 'Contracted prices',
                    items: [
                        'The agreed price for a material',
                        'Whether a rate is still valid or has expired',
                        'What is expiring soon',
                    ],
                },
                {
                    title: 'Sole & single source',
                    items: [
                        'Whether a supplier is approved as the only source',
                        'The justification, and whether it is still in date',
                        'The approved spend ceiling',
                    ],
                },
            ],
            examples: [
                'How many contracted prices have already expired?',
                'Which suppliers are approved for laptops in HQ Dubai?',
                'Which suppliers do we spend the most with?',
                'Do we have any sole source approvals in place?',
            ],
        },

        logistics: {
            summary:
                'I answer from NESR\'s own policy documents, and I cite the source. If a policy does not cover it, I say so rather than guessing.',
            groups: [
                {
                    title: 'Freight & transport',
                    items: [
                        'Road, sea and air freight guidelines',
                        'Carrier selection standards',
                        'Critical air freight limits',
                    ],
                },
                {
                    title: 'Warehouse & inventory',
                    items: [
                        'Warehouse audit procedures',
                        'Physical inventory count and disposal SOPs',
                        'Rubber material storage',
                    ],
                },
                {
                    title: 'Field operations',
                    items: [
                        'Wellsite materials management',
                        'Field Material Transfer and Hand Carry SOPs',
                        'Materials Management focal points',
                    ],
                },
                {
                    title: 'Compliance',
                    items: [
                        'Field Level Service Agreement requirements',
                        'GHS compliance checklists',
                        'FMC terms and conditions',
                        'Approval thresholds and when exceptions apply',
                    ],
                },
            ],
            examples: [
                'What is the policy on sole source purchases?',
                'How many quotations do I need before raising a purchase order?',
                'What is the approval threshold for a purchase order?',
                'How do I arrange a shipment between NESR locations?',
            ],
        },
    },

    /* ── Help ──
       Two entry points, not one: the video and the guide answer different
       questions, and someone wanting one rarely wants the other.

       The guide is not generic prompting advice. Every line comes from a way
       these specific agents have actually gone wrong or been misread in
       testing, so it stays useful only if it is updated when that changes. */
    help: {
        // SharePoint / Stream embed. Viewers must be signed in to SharePoint,
        // which Azure AD SSO normally handles, but someone outside the tenant
        // sees a sign-in screen rather than the video.
        videoUrl:
            'https://nesrcorp.sharepoint.com/sites/digitalstudio/_layouts/15/embed.aspx?UniqueId=06892c2c-54c4-485d-86f8-6e09b5c96698&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
        videoTitle: 'Meet SCAI',
        videoBlurb: 'A quick tour of what it does.',
        videoButton: 'Meet SCAI',
        firstVisit: {
            title: 'Welcome to Supply Chain AI (Beta)',
            // The thumbs are the only signal we get, and this is the one moment
            // every user reads something, so it is where to ask for them.
            body: 'A quick tour before you start. You can watch it again any time. This is a beta, so if an answer looks wrong please mark it with the thumbs.',
            dismiss: 'Start using SCAI',
        },
        guide: {
            title: 'How to ask',
            intro: 'It reads your real SAP data. It is good at finding things and bad at guessing, so be specific.',
            button: 'How to ask',
            sections: [
                {
                    title: 'Be specific',
                    tone: 'do',
                    items: [
                        'Give the number. "Where is PR 1005026000" beats "where is my request" by a mile.',
                        'Name the plant, as a 4-digit code. Material AI will stop and ask otherwise.',
                        'Name the supplier, not a code. A brand is usually several codes: DHL alone is seven.',
                        'Ask one thing at a time. Four questions in a paragraph gets you the weakest of four answers.',
                    ],
                },
                {
                    title: 'What will not work',
                    tone: 'dont',
                    items: [
                        '"Show me my requests." Nothing links you to a requisition, so give a number or a name.',
                        'Treating a material number and a manufacturer part number as the same thing.',
                        'Reading a count off a table. If it shows 50 rows, ask how many there are altogether.',
                        'Asking the wrong assistant. Unsure? Ask SCAI and it picks.',
                    ],
                },
                {
                    title: 'What it cannot know',
                    tone: 'cant',
                    items: [
                        'Where a shipment physically is. There is no AWB or container number anywhere, only how much is in transit.',
                        'Which GRN document a receipt was posted under. The receipt is there; the document number is not.',
                        'Goods issues. Only receipts are loaded.',
                        'Anything about invoices or payment. The invoice data is not logged reliably in SAP, so tracking ends at the goods receipt.',
                        'HS codes. Not held in any system we read.',
                    ],
                },
                {
                    title: 'Worth double-checking',
                    tone: 'check',
                    items: [
                        'Plant extension is inferred, not read from SAP. Confirm before raising a PR against it.',
                        'Data refreshes daily, so it can sit a few hours behind SAP. Ask when it last loaded if timing matters.',
                        'A deleted material can look perfectly normal. Ask for the live replacement.',
                        'If it says there are none and that surprises you, ask again another way. A wrong filter and an empty table look identical.',
                    ],
                },
            ],
            /* The two keys worth knowing. They live here rather than in the
               sidebar: clicking an assistant already starts a fresh
               conversation, so a button saying so again was one more thing to
               read for something you can already do. */
            shortcuts: [
                { keys: 'Ctrl K', what: 'Search your conversations.' },
                { keys: 'Ctrl Shift K', what: 'Start a new conversation. Clicking an assistant does the same thing.' },
                { keys: 'Esc', what: 'Stop an answer that is still being written.' },
                { keys: 'Shift Enter', what: 'A new line in your question instead of sending it.' },
            ],
        },
    },

    /* ── Agents ── */
    agents: [
        {
            id: 'orchestrator',
            name: 'SCAI',
            icon: Sparkles,
            description: 'Works across all four assistants',
            tagline: 'Ask anything. I will work out which specialists it needs and bring back one answer.',
            disclaimer: 'Every fact comes from a specialist. Questions spanning several take longer',
            webhookUrl: process.env.NEXT_PUBLIC_ORCHESTRATOR_WEBHOOK || '',
            streaming: true,
        },
        {
            id: 'material',
            name: 'Material AI',
            icon: Package,
            description: 'Inventory & Materials Expert',
            tagline: 'How can I help you manage materials and inventory today?',
            disclaimer: 'Always verify stock levels before procurement',
            webhookUrl: process.env.NEXT_PUBLIC_MATERIAL_WEBHOOK || '',
            streamWebhookUrl: process.env.NEXT_PUBLIC_MATERIAL_STREAM_WEBHOOK || '',
            streaming: true,
        },
        {
            id: 'logistics',
            name: 'SC Policy AI',
            icon: Truck,
            description: 'Supply Chain Policy Expert',
            tagline: 'How can I help you navigate Supply Chain policies today?',
            disclaimer: 'Always verify policy details with the relevant authority',
            webhookUrl: process.env.NEXT_PUBLIC_LOGISTICS_WEBHOOK || '',
            streamWebhookUrl: process.env.NEXT_PUBLIC_LOGISTICS_STREAM_WEBHOOK || '',
            streaming: true,
        },
        {
            id: 'sourceguide',
            name: 'SourceGuide AI',
            icon: Search,
            description: 'Procurement & Vendor Expert',
            tagline: 'I can help you find approved suppliers and check vendor details.',
            disclaimer: 'Always confirm vendor status with procurement',
            webhookUrl: process.env.NEXT_PUBLIC_SOURCEGUIDE_WEBHOOK || '',
            streamWebhookUrl: process.env.NEXT_PUBLIC_SOURCEGUIDE_STREAM_WEBHOOK || '',
            streaming: true,
        },
        {
            id: 'trackrequest',
            name: 'Track My Request',
            icon: PackageSearch,
            description: 'Request & Shipment Tracking',
            tagline: 'I can track your purchase requests and shipments from approval to delivery.',
            disclaimer: 'Status may lag the source system by a few hours',
            webhookUrl: process.env.NEXT_PUBLIC_TRACKREQUEST_WEBHOOK || '',
            streamWebhookUrl: process.env.NEXT_PUBLIC_TRACKREQUEST_STREAM_WEBHOOK || '',
            streaming: true,
        },
    ] satisfies AgentConfig[],
} as const;

export type AgentId = (typeof siteConfig.agents)[number]['id'];
