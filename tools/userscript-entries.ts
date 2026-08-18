
/** Registry metadata for entries published as installable overlays. */
export interface OverlayMeta {
  /** Immutable manifest id (^[a-z0-9]+(?:-[a-z0-9]+)*$). */
  id: string;
  /** Allow-list host rules (`*`, `*.suffix`, exact host). */
  hosts: string[];
  /** Optional deny-list, same matcher as `hosts`. */
  excludeHosts?: string[];
  tags?: string[];
  author?: string;
  defaultEnabled?: boolean;
}

export interface UserscriptEntry {
  source: string;
  output: string;
  name: string;
  version: string;
  description: string;
  match?: string[];
  excludeMatch?: string[];
  /** Present iff this artifact is published to the overlay registry. */
  overlay?: OverlayMeta;
}

export interface NodeBuild {
  source: string;
  output: string;
}

export const common = {
  namespace: "https://omnigent.local/userscripts",
  match: ["http://localhost/*", "http://127.0.0.1/*"],
  excludeMatch: [],
  runAt: "document-start",
  grant: "none",
};

export const entries: UserscriptEntry[] = [
  {
    source: "src/scripts/pinned-chats/index.ts",
    output: "userscripts/omnigent-pinned-chats.user.js",
    name: "Omnigent Pinned Chats",
    version: "0.11.0",
    description:
      "Managed pinned Omnigent chats.",
    overlay: {
      id: "pinned-chats",
      hosts: ["*"],
      tags: ["sidebar", "workspace", "productivity"],
      author: "dev",
      defaultEnabled: true,
    },
  },
  {
    source: "src/scripts/project-focus.ts",
    output: "userscripts/omnigent-project-focus.user.js",
    name: "Omnigent Project Focus",
    version: "0.2.2",
    description:
      "Allows for filtering the sidebar's Projects list to a subset you want to focus on.",
    overlay: {
      id: "project-focus",
      hosts: ["localhost", "127.0.0.1"],
      tags: ["sidebar", "projects", "declutter", "productivity"],
      author: "dev",
      defaultEnabled: true,
    },
  },
  {
    source: "src/scripts/palette-swapper.ts",
    output: "userscripts/omnigent-palette-swapper.user.js",
    name: "Omnigent Palette Swapper",
    version: "0.1.2",
    description:
      "Switcher for the app's colour palette",
    overlay: {
      id: "palette-swapper",
      hosts: ["*"],
      tags: ["theme", "appearance", "productivity"],
      author: "dev",
      defaultEnabled: true,
    },
  },
];

export const nodeBuilds: NodeBuild[] = [
  { source: "src/proxies/proxy.ts", output: "scripts/proxy.mjs" },
];
