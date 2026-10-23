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
    webhookUrl: string;
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
            `Supply Chain AI Internal Tool • ${agentDisclaimer}`,
        welcomeGreeting: (agentName: string) => `Hello, I am ${agentName}.`,

        // Table export
        exportTable: 'Export table to Excel',
        exportFilePrefix: 'SupplyChainAI',

        errorMessage:
            'Detailed error: Unable to connect to the agent. Please try again later.',
        genericError:
            'Chatbot is not available due to high demand right now. Please try again later.',

        // Login page
        login: {
            title: 'Welcome to Supply Chain AI',
            subtitle: 'Intelligent Supply Chain Assistant',
            ssoButton: 'Continue with SSO',
            divider: 'or',
            passwordPlaceholder: 'Enter password',
            loginButton: 'Login with Password',
            loadingText: 'Signing in…',
            errorText: 'Incorrect password. Please try again.',
            footer: 'NESR Internal Tool • Authorized Personnel Only',
            pageTitle: 'Sign In — Supply Chain AI',
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

    /* ── Suggestions ── */
    // Starter questions. All 25 were run against the live agents before being
    // put here, and each is ordered fastest first, because the first bubble a
    // user clicks sets their impression of how quick the product is.
    // Measured response times are in the comments. Re-test before editing:
    // a question that asks a clarifying question back, or takes a minute,
    // reads as a worse product than it is.
    suggestions: {
        // Every question routes to a different specialist, so the five
        // together show what the orchestrator actually does. Slowest is 36s;
        // the cross-agent version of the AF1797M question took 79s and was
        // dropped for that reason alone.
        orchestrator: [
            'How many contracted prices have already expired?',              // 11s
            'How many quotations do I need before raising a purchase order?', // 15s
            'Which suppliers are approved for laptops in HQ Dubai?',          // 21s
            'Is AF1797M already in the system?',                              // 24s
            'How many purchase orders are waiting for approval right now?',   // 36s
        ],
        material: [
            'Check VDC stock for material 000001100000046391',                    // 8s
            'How many materials are flagged for deletion but still have stock?',  // 10s
            'We need a 1/2 inch stainless ball valve. Does one already exist?',   // 19s
            'Is AF1797M already in the system?',                                  // 22s
            'Show me the Donaldson filters we have',                              // 23s
        ],
        logistics: [
            'What is the policy on sole source purchases?',                   // 9s
            'What are the incoterms rules we follow?',                        // 9s
            'How many quotations do I need before raising a purchase order?', // 10s
            'What is the approval threshold for a purchase order?',           // 10s
            'How do I arrange a shipment between NESR locations?',            // 15s
        ],
        sourceguide: [
            'How many contracted prices have already expired?',                 // 6s
            'Which suppliers are approved for laptops in HQ Dubai?',            // 14s
            'Which suppliers do we spend the most with?',                       // 16s
            'Show me the approved suppliers for safety boots in Saudi Arabia',  // 20s
            'Do we have any sole source approvals in place?',                   // 28s
        ],
        // Slowest set, 35s to 57s, because these scan the largest tables.
        // Faster phrasings were tried and were not meaningfully quicker.
        trackrequest: [
            'Who is the bottleneck in approvals right now?',                              // 35s
            'Which requests are stuck waiting for approval right now?',                   // 37s
            'We received goods but no invoice has come through. Which POs are like that?', // 41s
            'How many invoices are overdue, and what is the oldest?',                      // 53s
            'Which open POs are past their delivery date?',                                // 57s
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
                        'Delivery, invoice and payment status',
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
                    'Whether something has been paid',
                ],
            },
        },

        trackrequest: {
            summary:
                'I track where your documents are in their lifecycle, from raised to approved, delivered, invoiced and paid.',
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
                    title: 'Delivery & payment',
                    items: [
                        'Whether an order has been GRN\'ed, including partial deliveries',
                        'What is still outstanding',
                        'Whether an invoice has been paid, and what is overdue',
                        'How much of an order is in transit',
                    ],
                },
            ],
            examples: [
                'Who is the bottleneck in approvals right now?',
                'Which requests are stuck waiting for approval right now?',
                'How many invoices are overdue, and what is the oldest?',
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
        },
        {
            id: 'material',
            name: 'Material AI',
            icon: Package,
            description: 'Inventory & Materials Expert',
            tagline: 'How can I help you manage materials and inventory today?',
            disclaimer: 'Always verify stock levels before procurement',
            webhookUrl: process.env.NEXT_PUBLIC_MATERIAL_WEBHOOK || '',
        },
        {
            id: 'logistics',
            name: 'SC Policy AI',
            icon: Truck,
            description: 'Supply Chain Policy Expert',
            tagline: 'How can I help you navigate Supply Chain policies today?',
            disclaimer: 'Always verify policy details with the relevant authority',
            webhookUrl: process.env.NEXT_PUBLIC_LOGISTICS_WEBHOOK || '',
        },
        {
            id: 'sourceguide',
            name: 'SourceGuide AI',
            icon: Search,
            description: 'Procurement & Vendor Expert',
            tagline: 'I can help you find approved suppliers and check vendor details.',
            disclaimer: 'Always confirm vendor status with procurement',
            webhookUrl: process.env.NEXT_PUBLIC_SOURCEGUIDE_WEBHOOK || '',
        },
        {
            id: 'trackrequest',
            name: 'Track My Request',
            icon: PackageSearch,
            description: 'Request & Shipment Tracking',
            tagline: 'I can track your purchase requests and shipments from approval to delivery.',
            disclaimer: 'Status may lag the source system by a few hours',
            webhookUrl: process.env.NEXT_PUBLIC_TRACKREQUEST_WEBHOOK || '',
        },
    ] satisfies AgentConfig[],
} as const;

export type AgentId = (typeof siteConfig.agents)[number]['id'];
