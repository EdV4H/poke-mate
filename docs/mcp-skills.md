# MCPツール と Claude Skills

## 設計原則

- **判断は Skill、計算は MCP**: Skill は手順とユーザー対話、複雑な計算は MCP ツール側に寄せる
- **1 Skill は 10 ステップ以内**: 長すぎると動作が不安定
- **書き込みは DataService 経由**: MCP ツールは独自 SQL を書かず、共通サービスを呼ぶ
- **change_event_id を返す**: 書き込み系レスポンスに含めて GUI の通知と紐付け

---

## MCP ツール一覧

### Read 系

| ツール | 引数 | 返り値 |
|---|---|---|
| `list_workspaces` | - | Workspace[] |
| `list_parties` | `workspace_id` | Party[] |
| `get_party` | `party_id` | Party（6匹フル展開） |
| `list_battle_sessions` | `workspace_id, status?` | BattleSession[] |
| `get_battle_session` | `session_id` | BattleSession |
| `list_battle_logs` | `workspace_id, tags?` | BattleLog[] |
| `get_battle_log` | `log_id, format: "raw" \| "parsed"` | BattleLog |
| `get_meta_snapshot` | `period?` | MetaSnapshot |
| `search_pokemon` | `query, regulation?` | PokemonMaster[] |
| `get_pokemon_details` | `species_id` | PokemonMaster |
| `get_move` | `move_id` | MoveMaster |

### Write 系

| ツール | 引数 |
|---|---|
| `create_party` | `workspace_id, name` |
| `update_party` | `party_id, {name?, notes?}` |
| `update_party_slot` | `party_id, slot, patch` ← AI提案の主役 |
| `delete_party` | `party_id` |
| `create_battle_session` | `workspace_id, my_party_id, ...` |
| `append_battle_turn` | `session_id, turn` |
| `import_battle_log` | `workspace_id, raw_text, source` |
| `save_note` | `target_type, target_id, body_md` |

### Pure calc 系（DB書かない）

| ツール | 引数 | 返り値 |
|---|---|---|
| `simulate_damage` | `{attacker, defender, move, field}` | `{min, max, rolls[]}` |
| `analyze_type_coverage` | `party` | 弱点/耐性マトリクス |
| `suggest_counters` | `opponent_party` | 候補ポケモンリスト |
| `parse_battle_log_text` | `raw_text` | 構造化ログ（保存は別ツール） |

---

## Claude Skills（MVP）

配置:
- **正本**: リポジトリ内 `skills/<name>/SKILL.md`
- **配布**: `tools/install-skills.ts` で `~/.claude/skills/poke-mate/` にコピーまたはsymlink
- **開発中**: symlink でホットリロード

| Skill | 目的 | 主な MCP ツール |
|---|---|---|
| `poke-mate:review-party` | 6匹の相性/穴を分析、改善提案 | `get_party`, `analyze_type_coverage`, `get_meta_snapshot`, `search_pokemon`, `update_party_slot` |
| `poke-mate:build-party-from-concept` | 「受けループ組んで」から新規構築 | `create_party`, `search_pokemon`, `update_party_slot` × 6 |
| `poke-mate:simulate-matchup` | 仮想対戦、読み合い木 | `get_party` × 2, `simulate_damage`, `append_battle_turn` |
| `poke-mate:analyze-battle-log` | ログの分岐点を指摘 | `get_battle_log`, `parse_battle_log_text`, `simulate_damage`, `save_note` |
| `poke-mate:meta-brief` | 今週のメタまとめ | `get_meta_snapshot`, `list_parties` |
| `poke-mate:counter-suggest` | 特定構築へのカウンター提案 | `get_party`, `suggest_counters`, `analyze_type_coverage` |

### SKILL.md の例（review-party）

```markdown
---
name: poke-mate:review-party
description: Review a team composition for type coverage, speed tiers, and role balance
---

# Steps
1. Ask user for party_id (or infer from context)
2. Call get_party(party_id)
3. Call analyze_type_coverage(party)
4. Call get_meta_snapshot() to compare against meta
5. Identify: 穴（弱点過多タイプ）, 役割の欠け, 速度ライン
6. 提案フェーズ: search_pokemon で代替候補を3つ、simulate_damage で裏取り
7. ユーザー承認後、update_party_slot で反映
```
