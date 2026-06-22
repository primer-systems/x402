#!/usr/bin/env node
import { program } from "commander";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

// ============ EMBEDDED TEMPLATES ============

const WORKER_TS = `import { Hono } from "hono";
import { paymentMiddleware } from "@x402/hono";
import { primerFacilitator } from "@primersystems/x402";

// Set your wallet address before deploying
const RECIPIENT = "0xYOUR_WALLET_ADDRESS";

const routes = {
  "/v1/chat/completions": { price: "$0.001", network: "eip155:8453", payTo: RECIPIENT },
  "/v1/completions": { price: "$0.001", network: "eip155:8453", payTo: RECIPIENT },
  "/v1/embeddings": { price: "$0.0001", network: "eip155:8453", payTo: RECIPIENT },
  "/v1/images/generations": { price: "$0.01", network: "eip155:8453", payTo: RECIPIENT },
};

// Initialize once at module level
const facilitator = primerFacilitator();
const x402 = paymentMiddleware(routes, { facilitator });

type Env = { CHUTES_API_KEY: string };
const app = new Hono<{ Bindings: Env }>();

app.use("/v1/*", x402);

app.all("/v1/*", async (c) => {
  const url = new URL(c.req.url);
  const response = await fetch(\`https://llm.chutes.ai\${url.pathname}\`, {
    method: c.req.method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${c.env.CHUTES_API_KEY}\`,
      "Accept": c.req.header("Accept") || "application/json",
    },
    body: c.req.method !== "GET" ? await c.req.text() : undefined,
  });

  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    return new Response(response.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  return response;
});

export default app;
`;

const WRANGLER_TOML = (name: string) => `name = "${name}"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

# Set via: wrangler secret put CHUTES_API_KEY
`;

const PACKAGE_JSON = (name: string) =>
  JSON.stringify(
    {
      name,
      private: true,
      scripts: {
        dev: "wrangler dev",
        deploy: "wrangler deploy",
      },
      dependencies: {
        "@primersystems/x402": "^1.0.0",
        "@x402/hono": "^2.0.0",
        "@x402/evm": "^2.0.0",
        hono: "^4.0.0",
      },
      devDependencies: {
        "@cloudflare/workers-types": "^4.0.0",
        typescript: "^5.0.0",
        wrangler: "^3.0.0",
      },
    },
    null,
    2
  );

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: true,
      types: ["@cloudflare/workers-types"],
    },
    include: ["src"],
  },
  null,
  2
);

const README = (name: string) => `# ${name}

Paid AI proxy powered by [Chutes](https://chutes.ai) (Bittensor Subnet 64) + [x402](https://x402.org) micropayments.

## Setup

\`\`\`bash
npm install
\`\`\`

Edit \`src/worker.ts\` and set your wallet address:

\`\`\`typescript
const RECIPIENT = "0xYOUR_WALLET_ADDRESS";
\`\`\`

Set your Chutes API key:

\`\`\`bash
wrangler secret put CHUTES_API_KEY
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

## Endpoints

| Endpoint | Price |
|----------|-------|
| \`/v1/chat/completions\` | $0.001 |
| \`/v1/completions\` | $0.001 |
| \`/v1/embeddings\` | $0.0001 |
| \`/v1/images/generations\` | $0.01 |

Payments are accepted on Base mainnet (\`eip155:8453\`) via the Primer facilitator.

## Deploy

\`\`\`bash
npm run deploy
\`\`\`

## How It Works

1. Client makes request to your proxy
2. Proxy returns 402 Payment Required with x402 payment details
3. Client signs payment with their wallet
4. Client retries request with payment header
5. Proxy verifies payment via Primer facilitator
6. Proxy forwards request to Chutes AI
7. Response returned to client
8. Payment settled on-chain

## Customization

- **Pricing**: Edit the \`routes\` object in \`src/worker.ts\`
- **Network**: Change \`eip155:8453\` to another supported network (e.g., \`eip155:1187947933\` for SKALE)
- **Models**: The proxy forwards to Chutes which supports various models via OpenAI-compatible API
`;

const GITIGNORE = `node_modules/
dist/
.wrangler/
.dev.vars
`;

// ============ CLI ============

program.name("x402").description("Primer x402 CLI tools").version("1.0.0");

program
  .command("create <type> <name>")
  .description("Create a new x402 project")
  .addHelpText(
    "after",
    `
Project types:
  chutes-proxy    Paid AI proxy using Chutes + x402

Examples:
  $ npx @primersystems/x402 create chutes-proxy my-ai-api
`
  )
  .action(async (type: string, name: string) => {
    if (type !== "chutes-proxy") {
      console.error(`Unknown project type: ${type}`);
      console.error("Available types: chutes-proxy");
      process.exit(1);
    }

    const dir = join(process.cwd(), name);

    try {
      await mkdir(join(dir, "src"), { recursive: true });

      await Promise.all([
        writeFile(join(dir, "src/worker.ts"), WORKER_TS),
        writeFile(join(dir, "wrangler.toml"), WRANGLER_TOML(name)),
        writeFile(join(dir, "package.json"), PACKAGE_JSON(name)),
        writeFile(join(dir, "tsconfig.json"), TSCONFIG),
        writeFile(join(dir, "README.md"), README(name)),
        writeFile(join(dir, ".gitignore"), GITIGNORE),
      ]);

      console.log(`Created ${name}/`);
      console.log();
      console.log("Next steps:");
      console.log(`  cd ${name}`);
      console.log("  npm install");
      console.log("  # Edit src/worker.ts with your wallet address");
      console.log("  wrangler secret put CHUTES_API_KEY");
      console.log("  npm run dev");
    } catch (err) {
      console.error("Failed to create project:", err);
      process.exit(1);
    }
  });

program.parse();
