import { Package, Truck, Search, PackageSearch, type LucideIcon } from 'lucide-react';

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
        agentsLabel: 'SUPPLY CHAIN AGENTS',
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
    suggestions: {
        material: [
            'Check VDC stock for material ID: ',
            'Is there a duplicate part for: ',
            'Can I create a new material for: ',
        ],
        logistics: [
            'What is the SC policy for: ',
            'Summarize the policy on: ',
            'Who is responsible for the policy on: ',
        ],
        sourceguide: [
            'Which Supplier to use for Laptops in HQ Dubai?',
            'Who supplies Medical Insurance in Egypt?',
            'Check vendor details for Barite in UAE',
        ],
        trackrequest: [
            'What is the status of my request: ',
            'Where is the shipment for PO: ',
            'Show me all my pending requests',
        ],
    },

    /* ── Agents ── */
    agents: [
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
