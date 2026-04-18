# データモデル

## SQLite スキーマ

### マスタデータ（読み取り専用、アプリ配布時に初期投入）

Championsはレベル50固定・個体値31固定のため、`level` / `ivs` はスキーマから省く。

```
master_pokemon        (id, dex_no, name_ja, name_en, types[], base_stats, abilities[],
                       champions_available BOOLEAN,           -- 現在のChampionsプール(初期278種)
                       mega_forms_json,                       -- メガ形態のリスト
                       ...)
master_moves          (id, name_ja, name_en, type, category, power, accuracy, pp,
                       effect_code,
                       champions_power, champions_accuracy,   -- Champions独自のバランス上書き
                       champions_category, champions_notes)
master_items          (id, name_ja, name_en, effect_code, fling_power,
                       champions_available BOOLEAN)
master_abilities      (id, name_ja, name_en, description, effect_code,
                       is_champions_new BOOLEAN)              -- Dragonize/Mega Sol/Piercing Drill/Spicy Sprayなど
master_natures        (id, name_ja, plus_stat, minus_stat)
master_type_chart     (attacker_type, defender_type, multiplier)
master_mega_stones    (id, name_ja, species_id, forme_id, requires_omni_ring)
```

### ユーザーデータ

Champions仕様に合わせ、pokemon_setsから `level` / `ivs_json` / `happiness` を廃止し、
努力値の代わりに**ステータスポイント（SP）**を持つ。`tera_type` はChampions非対応なので現状はオフ、
将来実装された場合のみ使用。パーティは**6匹持ち**で、シングル時は3匹、ダブル時は4匹を選出する。

```
workspaces            (id, name, created_at, updated_at)
parties               (id, workspace_id, name,
                       format,                                -- 'single' | 'double'
                       notes, created_at, updated_at, version)
pokemon_sets          (id, party_id, slot, species_id, forme_id,
                       nature_id, ability_id, item_id,
                       sp_json,                               -- {hp, atk, def, spa, spd, spe} 合計上限あり
                       moves_json,                            -- [move_id × 4]
                       is_mega_target BOOLEAN,                -- メガシンカ候補（パーティに1匹、要ゼンブイリング）
                       origin,                                -- 'home' | 'scout'
                       origin_meta_json,                      -- HOME出張時の元EV等
                       version)
party_selections      (id, party_id, scenario_name,           -- 「対メガガブ選出」などのメモ
                       picked_slots_json,                     -- シングル: 3匹、ダブル: 4匹のslot配列
                       lead_slots_json)                       -- ダブル時の先発2匹
battle_sessions       (id, workspace_id, name,
                       my_party_id, opponent_party_id?,
                       format,                                -- 'single' | 'double'
                       my_selection_id?, opp_selection_json?,
                       state_json, status,
                       started_at, ended_at, version)
battle_turns          (id, session_id, turn_no, events_json, snapshot_json)
battle_logs           (id, workspace_id, source,              -- 'champions_replay' | 'text' | 'manual'
                       raw_text, parsed_json, imported_at, tags)
battle_log_analyses   (id, log_id, summary, pivots_json, generated_at)
meta_snapshots        (id, source, season_label,              -- 'M-1', 'M-2', ... 月次シーズン
                       format, rank_band,                     -- 'single'|'double' × 'master'|'champ'等
                       data_json, fetched_at)
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

## ステータス計算（Champions仕様）

`pokemon_sets.sp_json` は **HOME換算済みのSPそのもの**（EV値ではない）を保持する。
従来のEV式 `floor(ev/4)` の部分を、Championsでは **SPを直接加算** する形に置き換える:

```
HP    = floor((base*2 + 31 + sp_hp) * 50 / 100) + 50 + 10
other = floor( (floor((base*2 + 31 + sp_x) * 50 / 100) + 5) * nature_modifier )
```

- 従来のEVは HOME 転送時に `4 EV → 1 SP`、上乗せ分は `8 EV → +1 SP` で換算された値が `sp_hp`/`sp_x` に入る
- `sp_json` は既に換算済みなので、式中で再度 `/4` してはいけない（EV式の流用に注意）
- SPの合計上限、各ステの上限はゲーム内仕様に従う（データパックで持つ）
- 性格補正は従来通り（+10% / -10%）、HOME出張時のデフォルト性格は変更可能（VPでトレーニング）
- Lv50固定・IV31固定の前提でロジックが大幅に短くなる

**実装ガード**: `packages/damage-calc` 側に「入力は SP（換算後）であり EV ではない」旨のコメント/型名 (`StatPoints` 等) を明示し、将来の貢献者が EV 式を流用しないよう防ぐ。

## マスタデータ戦略（最重要リスク）

Championsには公式API/公式データダンプがない前提。段階的アプローチ:

### Phase 0/1: 既存データ + Champions差分上書き

- PokéAPI / Pokémon Showdown の `data/*.ts` を基礎として投入
- Championsで変化のある部分を `champions-diff.json` で上書き:
  - `champions_available`: 対戦プールの278種フラグ
  - 技の威力/命中/分類の上書き（例: Beak Blast・Mountain Gale・Trop Kick強化、Snap Trap鋼化）
  - 新特性4種（Dragonize / Mega Sol / Piercing Drill / Spicy Spray）
  - 状態異常の弱体化パラメータ
  - メガストーンと要求アイテム（ゼンブイリング）
- `packages/master-data/data/` にチェックイン

### Phase 1.5: コミュニティデータパック

- fan-maintainedな「Champions対応データパック」を取り込むローダを用意
- `data_pack_version` でバージョン管理（ゲームアップデート追従用）
- 将来のZワザ/ダイマックス/テラスタル解禁時もデータパック差し替えで対応

### Phase 2: 手動補完エディタ

- アプリ内にマスタデータエディタを内蔵
- 「この技の威力が違う」「この特性の説明が間違い」をユーザーが修正・エクスポート
- 更新初期は「ゲーム内仕様未確定」バッジを表示する潔さ

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
