import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { buildServer } from "../bin/mcp-server.ts";

describe("claudespeak MCP server", () => {
  test("exposes all 5 expected tools via tools/list", async () => {
    const server = buildServer();
    const client = new Client({ name: "test-client", version: "0.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "get_feedback_stats",
      "get_last_analyzer_report",
      "list_voices",
      "speak",
      "tag_feedback",
    ]);

    await client.close();
    await server.close();
  });
});
