import overview from "../../content/overview.md?raw";
import gettingStarted from "../../content/getting-started.md?raw";
import clientLibrary from "../../content/client-library.md?raw";
import spriteFormat from "../../content/sprite-format.md?raw";
import cvmProtocol from "../../content/cvm-protocol.md?raw";
import payments from "../../content/payments.md?raw";
import selfHosting from "../../content/self-hosting.md?raw";

export interface NavPage {
  title: string;
  slug: string;
}

export interface NavSection {
  title: string;
  pages: NavPage[];
}

export const sections: NavSection[] = [
  {
    title: "Getting Started",
    pages: [
      { title: "Overview", slug: "overview" },
      { title: "Getting Started", slug: "getting-started" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { title: "Client Library", slug: "client-library" },
      { title: "Sprite Format", slug: "sprite-format" },
      { title: "CVM Protocol", slug: "cvm-protocol" },
    ],
  },
  {
    title: "Operations",
    pages: [
      { title: "Payments", slug: "payments" },
      { title: "Self-Hosting", slug: "self-hosting" },
    ],
  },
];

export const contentMap: Record<string, string> = {
  overview,
  "getting-started": gettingStarted,
  "client-library": clientLibrary,
  "sprite-format": spriteFormat,
  "cvm-protocol": cvmProtocol,
  payments,
  "self-hosting": selfHosting,
};
