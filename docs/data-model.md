# データモデル

## SQLite スキーマ

### マスタデータ（読み取り専用、アプリ配布時に初期投入）

```
master_pokemon        (id, dex_no, name_ja, name_en, types[], base_stats, abilities[], ...)
master_moves          (id, name_ja, name_en, type, category, power, accuracy, pp, effect_code)
master_items          (id, name_ja, name_en, effect_code, fling_power, ...)
master_abilities      (id, name_ja, name_en, description, effect_code)
master_natures        (id, name_ja, plus_stat, minus_stat)
master_type_chart     (attacker_type, defender_type, multiplier)
```

### ユーザーデータ

```
workspaces            (id, name, created_at, updated_at)
parties               (id, workspace_id, name, regulation, notes, created_at, updated_at, version)
pokemon_sets          (id, party_id, slot, species_id, level, nature_id, ability_id,
                       item_id, tera_type, evs_json, ivs_json, moves_json, happiness, version)
battle_sessions       (id, workspace_id, name, my_party_id, opponent_party_id?,
                       state_json, status, started_at, ended_at, version)
battle_turns          (id, session_id, turn_no, events_json, snapshot_json)
battle_logs           (id, workspace_id, source, raw_text, parsed_json, imported_at, tags)
battle_log_analyses   (id, log_id, summary, pivots_json, generated_at)
meta_snapshots        (id, source, period_label, data_json, fetched_at)
notes                 (id, workspace_id, target_type, target_id, body_md, updated_at)
```

### システム

```
schema_migrations     (version, applied_at)
change_events         (id, entity_type, entity_id, op, actor, ts)  -- 監査ログ兼メッセージキュー
```

## IDの方針

マスタデータのIDは **永続的な文字列キー**（例: `"garchomp"`, `"leftovers"`）を採用。
- マスタ更新に強い
- ユーザーデータ（parties/pokemon_sets）がマスタIDを参照しても壊れにくい
- 手動補完されたマスタデータのマージが容易

## マスタデータ戦略（最重要リスク）

ポケモンチャンピオンズには公式APIがない前提。段階的アプローチ:

### Phase 0/1: 既存データ + 差分上書き

- PokéAPI / Pokémon Showdown の `data/*.ts` を基礎として投入
- チャンピオンズで変化のある種族値・新技・新特性は `champions-diff.json` で上書き
- `packages/master-data/data/` にチェックイン

### Phase 1.5: コミュニティデータパック

- fan-maintained な「チャンピオンズ対応データパック」を取り込むローダを用意
- `data_pack_version` でバージョン管理

### Phase 2: 手動補完エディタ

- アプリ内にマスタデータエディタを内蔵
- 「このポケモンの技リストが間違ってる」をユーザーが修正・エクスポート可能
- 発売直後は「種族値未確定」バッジを表示する潔さ

## 変更通知: change_events テーブル

ファイル監視ではなく、テーブルをメッセージキューとして使う。

```
change_events
  - id            (bigint, autoincrement)
  - entity_type   ('party' | 'pokemon_set' | 'battle_session' | ...)
  - entity_id     (文字列/数値)
  - op            ('create' | 'update' | 'delete')
  - actor         ('gui' | 'mcp')
  - ts            (timestamp)
```

- すべての書き込みで INSERT
- MCPサーバーはstandalone時、0.5秒pollingでtail
- Electron Mainは直接 ChangeBus.emit
- Renderer は `webContents.send('change-event', ...)` で受信

## 楽観ロック

- すべての主要エンティティに `version` 列
- UPDATE は `WHERE id = ? AND version = ?` 条件
- 衝突時は `VersionConflictError` を返し、AI/GUI 双方がリトライ
