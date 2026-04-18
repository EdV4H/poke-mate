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
| `get_battle_log` | `log_id, representation: "raw" \| "parsed"` | BattleLog（`format` は対戦形式 single/double と衝突するため `representation` を使う） |
| `get_meta_snapshot` | `season?, format?, rank_band?` | MetaSnapshot（省略時は現在シーズンの集約） |
| `search_pokemon` | `query, regulation?` | PokemonMaster[] |
| `get_pokemon_details` | `species_id` | PokemonMaster |
| `get_move` | `move_id` | MoveMaster |

### Write 系

すべての書き込み系ツールは `change_event_id`（`change_events` テーブルのID）を返り値に含め、GUI 側の通知・監査と紐付けられるようにする。

| ツール | 引数 | 返り値 | 備考 |
|---|---|---|---|
| `create_party` | `workspace_id, name, format` | `{ party: Party, change_event_id }` | format: `'single'` \| `'double'` |
| `update_party` | `party_id, {name?, notes?, format?}` | `{ party: Party, change_event_id }` | |
| `update_party_slot` | `party_id, slot, patch` | `{ party: Party, change_event_id }` | AI提案の主役。`species_id, forme_id, nature_id, ability_id, item_id, sp_json, moves_json, is_mega_target` を変更 |
| `update_training` | `party_id, slot, {sp_json?, nature_id?, ability_id?, moves_json?}` | `{ party: Party, change_event_id }` | Champions独自の「トレーニング（VP消費）」概念に対応。SP最適化の提案適用に使う |
| `delete_party` | `party_id` | `{ success: true, change_event_id }` | |
| `create_party_selection` | `party_id, scenario_name, picked_slots[], lead_slots?` | `{ selection: PartySelection, change_event_id }` | 3匹/4匹選出パターンの保存 |
| `create_battle_session` | `workspace_id, my_party_id, format, my_selection_id?, ...` | `{ session: BattleSession, change_event_id }` | |
| `append_battle_turn` | `session_id, turn` | `{ session: BattleSession, change_event_id }` | |
| `import_battle_log` | `workspace_id, raw_text, source` | `{ log: BattleLog, change_event_id }` | `source: 'champions_replay' \| 'text' \| 'manual'` |
| `save_note` | `target_type, target_id, body_md` | `{ note: Note, change_event_id }` | |

### Pure calc 系（DB書かない、Champions仕様）

| ツール | 引数 | 返り値 |
|---|---|---|
| `compute_stats` | `{species_id, nature_id, sp_json}` | `{hp, atk, def, spa, spd, spe}` 実数値（Lv50固定・IV31固定） |
| `simulate_damage` | `{attacker, defender, move, field, mega_state}` | `{min, max, rolls[], mod_breakdown}` ― Champions独自バランス反映 |
| `analyze_type_coverage` | `party` | 弱点/耐性マトリクス、役割分布 |
| `analyze_selection_patterns` | `party, opponent_archetypes[]` | 3匹/4匹選出の推奨リストとマッチアップ評価 |
| `simulate_mega_timing` | `{battle_state, mega_target}` | メガシンカタイミング別のシミュレーション結果 |
| `suggest_sp_spread` | `{species_id, role, benchmarks[]}` | SP配分の推奨（最速ライン、耐久調整など） |
| `suggest_counters` | `opponent_party` | Championsプール内の候補ポケモンリスト |
| `parse_battle_log_text` | `raw_text` | 構造化ログ（保存は別ツール） |

---

## Claude Skills（MVP）

配置:
- **正本**: リポジトリ内 `skills/<name>/SKILL.md`
- **配布**: `tools/install-skills.ts` で `~/.claude/skills/poke-mate/` にコピーまたはsymlink
- **開発中**: symlink でホットリロード

| Skill | 目的 | 主な MCP ツール |
|---|---|---|
| `poke-mate:review-party` | 6匹の相性/穴/選出パターンを分析、改善提案 | `get_party`, `analyze_type_coverage`, `analyze_selection_patterns`, `get_meta_snapshot`, `search_pokemon`, `update_party_slot` |
| `poke-mate:build-party-from-concept` | 「メガリザYの軸で組んで」など概念から新規構築 | `create_party`, `search_pokemon`, `update_party_slot` × 6、メガ1匹制約を満たす |
| `poke-mate:optimize-training` | Champions独自のSP/特性/技のトレーニング最適化 | `get_party`, `suggest_sp_spread`, `compute_stats`, `update_training` |
| `poke-mate:simulate-matchup` | 仮想対戦、選出読み、メガタイミング | `get_party` × 2, `simulate_damage`, `simulate_mega_timing`, `append_battle_turn` |
| `poke-mate:analyze-battle-log` | ログの分岐点（選出/メガ/交代択）を指摘 | `get_battle_log`, `parse_battle_log_text`, `simulate_damage`, `simulate_mega_timing`, `save_note` |
| `poke-mate:meta-brief` | シーズンM-N のメタまとめ | `get_meta_snapshot`, `list_parties` |
| `poke-mate:counter-suggest` | トップ構築へのカウンター提案（Championsプール内） | `get_party`, `suggest_counters`, `analyze_type_coverage` |

### SKILL.md の例（review-party）

```markdown
---
name: poke-mate:review-party
description: Review a Pokémon Champions team (6 Pokémon, single/double format) for type coverage, selection patterns, speed tiers at Lv50, and role balance. Assumes Champions rules: Lv50 fixed, IV31 fixed, SP instead of EVs, Mega Evolution only.
---

# Steps
1. Ask user for party_id and format (single/double). Infer from context if possible.
2. Call get_party(party_id)
3. Call analyze_type_coverage(party)
4. Call analyze_selection_patterns(party, top_archetypes) for common opponents this season
5. Call get_meta_snapshot({ season: current_season, format: party.format }) to compare against meta
6. Identify: 穴（弱点過多タイプ）, 役割の欠け, 速度ライン(Lv50実数値ベース), メガ枠の適切さ(1匹制約)
7. 提案フェーズ: search_pokemon でChampionsプール内の代替候補を3つ、simulate_damage と suggest_sp_spread で裏取り
8. ユーザー承認後、update_party_slot または update_training で反映
```
