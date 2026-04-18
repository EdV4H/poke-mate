#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createDataService } from "@edv4h/poke-mate-data-service";
import { resolveDbPath } from "./db-path.js";

const SearchPokemonInput = z.object({
  query: z.string(),
  champions_only: z.boolean().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

const GetPokemonDetailsInput = z.object({
  species_id: z.string(),
});

async function main(): Promise<void> {
  const data = createDataService({ dbPath: resolveDbPath(), actor: "mcp" });

  const server = new Server(
    { name: "poke-mate", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_pokemon",
        description:
          "Search the Pokémon Champions master pool by Japanese name, English name, or species id.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Partial match against name or species id." },
            champions_only: { type: "boolean", description: "Restrict to Champions-available pool." },
            limit: { type: "integer", minimum: 1, maximum: 200 },
          },
          required: ["query"],
        },
      },
      {
        name: "get_pokemon_details",
        description: "Fetch full master data for a single Pokémon by species id.",
        inputSchema: {
          type: "object",
          properties: {
            species_id: { type: "string" },
          },
          required: ["species_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    switch (req.params.name) {
      case "search_pokemon": {
        const input = SearchPokemonInput.parse(req.params.arguments ?? {});
        const results = data.searchPokemon({
          query: input.query,
          ...(input.champions_only !== undefined && { championsOnly: input.champions_only }),
          ...(input.limit !== undefined && { limit: input.limit }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }
      case "get_pokemon_details": {
        const input = GetPokemonDetailsInput.parse(req.params.arguments ?? {});
        const result = data.getPokemonDetails(input.species_id);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
      default:
        throw new Error(`Unknown tool: ${req.params.name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = (): void => {
    data.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[poke-mate-mcp] fatal:", err);
  process.exit(1);
});
