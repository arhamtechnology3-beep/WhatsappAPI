import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CreditCard,
  Eye,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  Plug,
  Radio,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  UsersRound,
  Workflow,
  Zap,
} from "lucide-react";

/**
 * One map of the workspace. The sidebar, the header title, the one-line
 * page guide, and the dashboard feature directory all read from here so a
 * new page cannot show up in one place and stay hidden in the others.
 */
export interface WorkspaceNavItem {
  href: string;
  label: string;
  /** Shown on the dashboard card. */
  description: string;
  /** Shown in the slim bar under the header. */
  howTo: string;
  icon: LucideIcon;
  beta?: boolean;
  /** Hidden unless the IdentityFlow flag is on. */
  identityFlow?: boolean;
}

export interface WorkspaceNavGroup {
  id: string;
  /** Short label in the sidebar. */
  label: string;
  /** Sentence above the group on the dashboard. */
  summary: string;
  items: WorkspaceNavItem[];
}

export const WORKSPACE_NAV: WorkspaceNavGroup[] = [
  {
    id: "home",
    label: "Home",
    summary: "Where you land, and where the numbers live.",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        description: "Today’s numbers, and a map of every feature.",
        howTo: "Start here when you are not sure which page does what.",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    summary: "Read chats, keep the people list, and track deals.",
    items: [
      {
        href: "/inbox",
        label: "Inbox",
        description: "Read and reply to WhatsApp chats.",
        howTo: "Pick a chat on the left, reply on the right. Unread chats show a dot in the menu.",
        icon: MessageSquare,
      },
      {
        href: "/contacts",
        label: "Contacts",
        description: "Add a person, or import a spreadsheet.",
        howTo: "This is the customer list. Use Add to enter one person, or Import to upload a file.",
        icon: Users,
      },
      {
        href: "/visitors",
        label: "Visitors",
        description: "Store visitors, and the WhatsApp that brings them back.",
        howTo: "See who visited the store. Settings on this page control the recognition popup and recovery messages.",
        icon: Eye,
      },
      {
        href: "/pipelines",
        label: "Pipelines",
        description: "Move a deal from first chat to won.",
        howTo: "Each column is a stage. Drag a deal across, or open it to update the value.",
        icon: GitBranch,
      },
      {
        href: "/customers",
        label: "Customer 360",
        description: "One page for a person’s chats, orders, and notes.",
        howTo: "Open a customer to see their chats, orders, and notes together.",
        icon: UsersRound,
        beta: true,
        identityFlow: true,
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    summary: "Send messages out, and see what the store and ads did.",
    items: [
      {
        href: "/broadcasts",
        label: "Broadcasts",
        description: "Send one approved template to many people.",
        howTo: "A broadcast uses a template Meta has already approved. Create one, pick the audience, then send.",
        icon: Radio,
      },
      {
        href: "/ctwa-insights",
        label: "CTWA Insights",
        description: "See which ads start WhatsApp chats.",
        howTo: "These charts are Click-to-WhatsApp ads: which ads opened a chat, and what happened after.",
        icon: BarChart3,
      },
      {
        href: "/shopify",
        label: "Shopify",
        description: "Orders, abandoned carts, and store messages.",
        howTo: "Store orders and the WhatsApp messages that follow them. Connect the store under Integrations first.",
        icon: ShoppingBag,
      },
      {
        href: "/campaigns",
        label: "Campaigns",
        description: "Plan a send from one list.",
        howTo: "Build a campaign, then send it when the audience and template are ready.",
        icon: Store,
        beta: true,
        identityFlow: true,
      },
    ],
  },
  {
    id: "automate",
    label: "Automate",
    summary: "Messages that go out without you pressing send.",
    items: [
      {
        href: "/automations",
        label: "Automations",
        description: "A trigger, then the WhatsApp that follows.",
        howTo: "Pick when it runs (a new order, an abandoned cart) and the message that sends itself.",
        icon: Zap,
      },
      {
        href: "/flows",
        label: "Flows",
        description: "The path a customer walks through in chat.",
        howTo: "Each flow is a path of messages and questions. Open one to edit the steps.",
        icon: Workflow,
        beta: true,
      },
    ],
  },
  {
    id: "connect",
    label: "Connect",
    summary: "The other tools that feed this workspace.",
    items: [
      {
        href: "/integrations",
        label: "Integrations",
        description: "Link Shopify and the tools that send data in.",
        howTo: "Connect a tool here. Shopify is the one that brings orders and carts into WhatsApp.",
        icon: Plug,
      },
    ],
  },
];

export const ACCOUNT_NAV: WorkspaceNavItem[] = [
  {
    href: "/billing",
    label: "Billing",
    description: "Plan, invoices, and what the subscription includes.",
    howTo: "Your plan and invoices live here.",
    icon: CreditCard,
    beta: true,
    identityFlow: true,
  },
  {
    href: "/privacy",
    label: "Privacy",
    description: "What you store, and how a customer can opt out.",
    howTo: "Review what this workspace stores and how opt-out works.",
    icon: ShieldCheck,
    beta: true,
    identityFlow: true,
  },
  {
    href: "/settings",
    label: "Settings",
    description: "WhatsApp number, templates, team, and appearance.",
    howTo: "Use the menu on this page. WhatsApp is where the sending number is connected.",
    icon: Settings,
  },
];

export interface PageCopy {
  label: string;
  howTo: string;
  hideGuide?: boolean;
}

const NESTED_PAGES: { pattern: RegExp; copy: PageCopy }[] = [
  {
    pattern: /^\/broadcasts\/new$/,
    copy: {
      label: "New broadcast",
      howTo: "Pick an approved template, choose who receives it, then send or schedule.",
    },
  },
  {
    pattern: /^\/broadcasts\/[^/]+$/,
    copy: {
      label: "Broadcast",
      howTo: "See who received this message and whether it was delivered.",
    },
  },
  {
    pattern: /^\/automations\/new$/,
    copy: {
      label: "New automation",
      howTo: "Choose when it runs, then the WhatsApp message that follows.",
    },
  },
  {
    pattern: /^\/automations\/[^/]+\/edit$/,
    copy: {
      label: "Edit automation",
      howTo: "Change the trigger or the message, then save.",
    },
  },
  {
    pattern: /^\/automations\/[^/]+\/logs$/,
    copy: {
      label: "Automation log",
      howTo: "Each row is one time this automation ran.",
    },
  },
  {
    pattern: /^\/flows\/[^/]+\/runs$/,
    copy: {
      label: "Flow runs",
      howTo: "Each row is one customer who went through this flow.",
    },
  },
  {
    pattern: /^\/flows\/[^/]+$/,
    copy: {
      label: "Flow",
      howTo: "",
      hideGuide: true,
    },
  },
  {
    pattern: /^\/customers\/[^/]+$/,
    copy: {
      label: "Customer",
      howTo: "Chats, orders, and notes for this one person.",
    },
  },
  {
    pattern: /^\/integrations\/shopify$/,
    copy: {
      label: "Shopify",
      howTo: "Connect the store so orders and carts show up in WhatsApp.",
    },
  },
];

export function visibleNavItems(
  items: WorkspaceNavItem[],
  identityFlow: boolean,
): WorkspaceNavItem[] {
  return items.filter((item) => !item.identityFlow || identityFlow);
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function allNavItems(): WorkspaceNavItem[] {
  return [
    ...WORKSPACE_NAV.flatMap((group) => group.items),
    ...ACCOUNT_NAV,
  ];
}

export function resolvePage(pathname: string): PageCopy {
  for (const nested of NESTED_PAGES) {
    if (nested.pattern.test(pathname)) return nested.copy;
  }

  const match = allNavItems()
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isNavActive(pathname, item.href));

  if (match) {
    // Inbox and Shopify size themselves to the viewport under the
    // header. A guide bar would push those layouts past the screen.
    const fillsTheScreen = match.href === "/inbox" || match.href === "/shopify";
    return {
      label: match.label,
      howTo: match.howTo,
      hideGuide: match.href === "/dashboard" || fillsTheScreen,
    };
  }

  return { label: "Workspace", howTo: "", hideGuide: true };
}
