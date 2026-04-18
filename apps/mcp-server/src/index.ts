#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createDataService,
  DEFAULT_WORKSPACE_ID,
  VersionConflictError,
} from "@edv4h/poke-mate-data-service";
import {
  analyzeDefensive,
  analyzeParty,
  classifyRole,
  suggestPartySlot,
  type Role,
} from "@edv4h/poke-mate-damage-calc";
import type {
  PokemonMaster,
  PokemonType,
} from "@edv4h/poke-mate-shared-types";
import { resolveDbPath } from "./db-path.js";

const ACTOR = "mcp" as const;

const POKEMON_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;

const ROLES = ["attacker", "wall", "fast", "support"] as const;

const SearchPokemonInput = z.object({
  query: z.string(),
  champions_only: z.boolean().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

const GetPokemonDetailsInput = z.object({
  species_id: z.string(),
});

const ListPartiesInput = z.object({
  workspace_id: z.string().optional(),
});

const GetPartyInput = z.object({ party_id: z.string() });

const CreatePartyInput = z.object({
  workspace_id: z.string().optional(),
  name: z.string().min(1),
  format: z.enum(["single", "double"]).default("single"),
  notes: z.string().optional(),
});

const UpdatePartyInput = z.object({
  party_id: z.string(),
  expected_version: z.number().int().nonnegative(),
  patch: z.object({
    name: z.string().optional(),
    format: z.enum(["single", "double"]).optional(),
    notes: z.string().optional(),
  }),
});

const PokemonSetInputSchema = z.object({
  species_id: z.string(),
  forme_id: z.string().optional(),
  nature_id: z.string().optional(),
  ability_id: z.string().optional(),
  item_id: z.string().optional(),
  sp_json: z.record(z.string(), z.number()).optional(),
  moves_json: z.array(z.string()).optional(),
  is_mega_target: z.boolean().optional(),
});

const UpdatePartySlotInput = z.object({
  party_id: z.string(),
  slot: z.number().int().min(1).max(6),
  set: PokemonSetInputSchema,
  expected_version: z.number().int().nonnegative().optional(),
});

const DeletePartySlotInput = z.object({
  party_id: z.string(),
  slot: z.number().int().min(1).max(6),
});

const DeletePartyInput = z.object({ party_id: z.string() });

const SuggestPartySlotInput = z.object({
  party_id: z.string(),
  intent: z
    .object({
      roles: z.array(z.enum(ROLES)).optional(),
      cover_types: z.array(z.enum(POKEMON_TYPES)).optional(),
      avoid_types: z.array(z.enum(POKEMON_TYPES)).optional(),
    })
    .optional(),
  candidate_limit: z.number().int().positive().max(500).optional(),
  return_limit: z.number().int().positive().max(10).optional(),
});

const AnalyzeTypeCoverageInput = z.object({ party_id: z.string() });

function textResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

async function main(): Promise<void> {
  const data = createDataService({ dbPath: resolveDbPath() });

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
            query: { type: "string" },
            champions_only: { type: "boolean" },
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
          properties: { species_id: { type: "string" } },
          required: ["species_id"],
        },
      },
      {
        name: "list_parties",
        description: "List all parties in a workspace (defaults to 'default').",
        inputSchema: {
          type: "object",
          properties: { workspace_id: { type: "string" } },
        },
      },
      {
        name: "get_party",
        description: "Fetch a full party with all 6 slot sets.",
        inputSchema: {
          type: "object",
          properties: { party_id: { type: "string" } },
          required: ["party_id"],
        },
      },
      {
        name: "create_party",
        description: "Create an empty party in a workspace.",
        inputSchema: {
          type: "object",
          properties: {
            workspace_id: { type: "string" },
            name: { type: "string" },
            format: { type: "string", enum: ["single", "double"] },
            notes: { type: "string" },
          },
          required: ["name"],
        },
      },
      {
        name: "update_party",
        description: "Update party metadata (name, format, notes). Requires expected_version.",
        inputSchema: {
          type: "object",
          properties: {
            party_id: { type: "string" },
            expected_version: { type: "integer" },
            patch: {
              type: "object",
              properties: {
                name: { type: "string" },
                format: { type: "string", enum: ["single", "double"] },
                notes: { type: "string" },
              },
            },
          },
          required: ["party_id", "expected_version", "patch"],
        },
      },
      {
        name: "update_party_slot",
        description:
          "Create or replace a slot (1..6) in a party. Pass expected_version when updating an existing set.",
        inputSchema: {
          type: "object",
          properties: {
            party_id: { type: "string" },
            slot: { type: "integer", minimum: 1, maximum: 6 },
            set: {
              type: "object",
              properties: {
                species_id: { type: "string" },
                forme_id: { type: "string" },
                nature_id: { type: "string" },
                ability_id: { type: "string" },
                item_id: { type: "string" },
                sp_json: { type: "object" },
                moves_json: { type: "array", items: { type: "string" } },
                is_mega_target: { type: "boolean" },
              },
              required: ["species_id"],
            },
            expected_version: { type: "integer" },
          },
          required: ["party_id", "slot", "set"],
        },
      },
      {
        name: "delete_party_slot",
        description: "Empty a slot in a party.",
        inputSchema: {
          type: "object",
          properties: {
            party_id: { type: "string" },
            slot: { type: "integer", minimum: 1, maximum: 6 },
          },
          required: ["party_id", "slot"],
        },
      },
      {
        name: "delete_party",
        description: "Delete a party and all its slots.",
        inputSchema: {
          type: "object",
          properties: { party_id: { type: "string" } },
          required: ["party_id"],
        },
      },
      {
        name: "suggest_party_slot",
        description:
          "Propose up to N candidate Pokémon to fill the party. Uses type coverage + role analysis.",
        inputSchema: {
          type: "object",
          properties: {
            party_id: { type: "string" },
            intent: {
              type: "object",
              properties: {
                roles: {
                  type: "array",
                  items: { type: "string", enum: [...ROLES] },
                },
                cover_types: {
                  type: "array",
                  items: { type: "string", enum: [...POKEMON_TYPES] },
                },
                avoid_types: {
                  type: "array",
                  items: { type: "string", enum: [...POKEMON_TYPES] },
                },
              },
            },
            candidate_limit: { type: "integer", minimum: 1, maximum: 500 },
            return_limit: { type: "integer", minimum: 1, maximum: 10 },
          },
          required: ["party_id"],
        },
      },
      {
        name: "analyze_type_coverage",
        description:
          "Analyze the party's defensive type coverage: per-type weakness count, resistance count, and notable holes.",
        inputSchema: {
          type: "object",
          properties: { party_id: { type: "string" } },
          required: ["party_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      switch (req.params.name) {
        case "search_pokemon": {
          const input = SearchPokemonInput.parse(req.params.arguments ?? {});
          const results = data.searchPokemon({
            query: input.query,
            ...(input.champions_only !== undefined && { championsOnly: input.champions_only }),
            ...(input.limit !== undefined && { limit: input.limit }),
          });
          return textResult(results);
        }
        case "get_pokemon_details": {
          const input = GetPokemonDetailsInput.parse(req.params.arguments ?? {});
          return textResult(data.getPokemonDetails(input.species_id));
        }
        case "list_parties": {
          const input = ListPartiesInput.parse(req.params.arguments ?? {});
          const workspaceId = input.workspace_id ?? DEFAULT_WORKSPACE_ID;
          return textResult(data.party.listParties(workspaceId));
        }
        case "get_party": {
          const input = GetPartyInput.parse(req.params.arguments ?? {});
          return textResult(data.party.getParty(input.party_id));
        }
        case "create_party": {
          const input = CreatePartyInput.parse(req.params.arguments ?? {});
          const result = data.party.createParty(
            {
              ...(input.workspace_id !== undefined && { workspaceId: input.workspace_id }),
              name: input.name,
              format: input.format,
              ...(input.notes !== undefined && { notes: input.notes }),
            },
            ACTOR,
          );
          return textResult({ party: result.value, change_event_id: result.changeEventId });
        }
        case "update_party": {
          const input = UpdatePartyInput.parse(req.params.arguments ?? {});
          const patch: Parameters<typeof data.party.updateParty>[1] = {
            ...(input.patch.name !== undefined && { name: input.patch.name }),
            ...(input.patch.format !== undefined && { format: input.patch.format }),
            ...(input.patch.notes !== undefined && { notes: input.patch.notes }),
          };
          const result = data.party.updateParty(
            input.party_id,
            patch,
            input.expected_version,
            ACTOR,
          );
          return textResult({ party: result.value, change_event_id: result.changeEventId });
        }
        case "update_party_slot": {
          const input = UpdatePartySlotInput.parse(req.params.arguments ?? {});
          const setInput: Parameters<typeof data.party.upsertPartySlot>[2] = {
            speciesId: input.set.species_id,
            ...(input.set.forme_id !== undefined && { formeId: input.set.forme_id }),
            ...(input.set.nature_id !== undefined && { natureId: input.set.nature_id }),
            ...(input.set.ability_id !== undefined && { abilityId: input.set.ability_id }),
            ...(input.set.item_id !== undefined && { itemId: input.set.item_id }),
            ...(input.set.sp_json !== undefined && { spJson: input.set.sp_json }),
            ...(input.set.moves_json !== undefined && { movesJson: input.set.moves_json }),
            ...(input.set.is_mega_target !== undefined && { isMegaTarget: input.set.is_mega_target }),
          };
          const result = data.party.upsertPartySlot(
            input.party_id,
            input.slot,
            setInput,
            ACTOR,
            input.expected_version,
          );
          return textResult({ set: result.value, change_event_id: result.changeEventId });
        }
        case "delete_party_slot": {
          const input = DeletePartySlotInput.parse(req.params.arguments ?? {});
          const result = data.party.deletePartySlot(input.party_id, input.slot, ACTOR);
          return textResult({ ...result.value, change_event_id: result.changeEventId });
        }
        case "delete_party": {
          const input = DeletePartyInput.parse(req.params.arguments ?? {});
          const result = data.party.deleteParty(input.party_id, ACTOR);
          return textResult({ ...result.value, change_event_id: result.changeEventId });
        }
        case "suggest_party_slot": {
          const input = SuggestPartySlotInput.parse(req.params.arguments ?? {});
          const party = data.party.getParty(input.party_id);
          if (!party) throw new Error(`Party not found: ${input.party_id}`);

          const candidateLimit = input.candidate_limit ?? 200;
          const pool = data.listPokemonMasters({ championsOnly: true, limit: candidateLimit });

          const masterIndex = new Map<string, PokemonMaster>(pool.map((p) => [p.id, p]));
          for (const s of party.sets) {
            if (!masterIndex.has(s.speciesId)) {
              const m = data.getPokemonDetails(s.speciesId);
              if (m) masterIndex.set(m.id, m);
            }
          }

          const intent = input.intent ?? {};
          const results = suggestPartySlot({
            currentSets: party.sets.map((s) => ({ speciesId: s.speciesId })),
            candidates: pool,
            intent: {
              ...(intent.roles !== undefined && { roles: intent.roles as Role[] }),
              ...(intent.cover_types !== undefined && { coverTypes: intent.cover_types as PokemonType[] }),
              ...(intent.avoid_types !== undefined && { avoidTypes: intent.avoid_types as PokemonType[] }),
            },
            masterIndex,
            ...(input.return_limit !== undefined && { limit: input.return_limit }),
          });
          return textResult({ candidates: results });
        }
        case "analyze_type_coverage": {
          const input = AnalyzeTypeCoverageInput.parse(req.params.arguments ?? {});
          const party = data.party.getParty(input.party_id);
          if (!party) throw new Error(`Party not found: ${input.party_id}`);

          const masterIndex = new Map<string, PokemonMaster>();
          for (const s of party.sets) {
            const m = data.getPokemonDetails(s.speciesId);
            if (m) masterIndex.set(m.id, m);
          }
          const coverage = analyzeParty(
            party.sets.map((s) => ({ speciesId: s.speciesId })),
            masterIndex,
          );

          const perTypeBreakdown = party.sets.map((s) => {
            const m = masterIndex.get(s.speciesId);
            return m
              ? {
                  slot: s.slot,
                  species_id: s.speciesId,
                  name_ja: m.nameJa,
                  role: classifyRole(m),
                  defensive: analyzeDefensive(m.types),
                }
              : { slot: s.slot, species_id: s.speciesId };
          });

          const weaknesses = Object.fromEntries(coverage.weaknessCounts);
          const resistances = Object.fromEntries(coverage.resistanceCounts);
          const roles = Object.fromEntries(coverage.roleCounts);

          return textResult({
            party_id: party.id,
            sets: perTypeBreakdown,
            totals: { weaknesses, resistances, roles },
          });
        }
        default:
          throw new Error(`Unknown tool: ${req.params.name}`);
      }
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "VersionConflict",
                entity_type: err.entityType,
                entity_id: err.entityId,
                expected_version: err.expectedVersion,
                hint: "Re-fetch and retry with the latest version.",
              }),
            },
          ],
        };
      }
      throw err;
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
