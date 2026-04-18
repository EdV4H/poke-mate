# ロードマップ

段階的にビルドできる実装プラン。Critical Path は **Phase 1a**（パーティ構築 × AI連携の貫通）。

---

## Phase 0: 土台（目安 1〜1.5 週間）

**Goal**: Electron が起動し、GUI でポケモン検索でき、MCP サーバーからも同じ DB が見える。

### 作るもの

1. **モノレポ初期化**
   - `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`
2. **packages/shared-types**
   - `Pokemon`, `Party`, `PokemonSet` 型、IPC チャンネル定数
3. **packages/data-service**
   - Drizzle schema（master_pokemon, parties, pokemon_sets, change_events のみ）
   - マイグレーション1本
   - `PartyService`: create/get/list/updateSlot
   - `ChangeBus` EventEmitter
4. **packages/master-data**
   - PokéAPIダンプを `pokemon.json` にコミット
   - シード投入スクリプト
5. **apps/electron**
   - electron-vite 雛形
   - Main/Preload/Renderer 最小配線
   - IPC で `search_pokemon` / `get_pokemon_details` を呼べる（MCPツール名と合わせる）
   - 「ポケモン検索画面」のみ
6. **apps/mcp-server**
   - MCP SDK 雛形、stdio transport
   - `search_pokemon`, `get_pokemon_details` のみ
   - DataService を import して使う
7. **手動検証**
   - `npx @modelcontextprotocol/inspector node apps/mcp-server/dist/index.js` で接続確認

### 最初に着手する 5 ファイル

骨格が決まり、残りは同パターン展開:

- `packages/shared-types/src/entities.ts`
- `packages/data-service/src/schema.ts`
- `packages/data-service/src/services/party.ts`
- `apps/electron/src/main/index.ts`
- `apps/mcp-server/src/index.ts`

---

## Phase 1a: パーティ構築 × AI連携 貫通（目安 2 週間）★Critical Path

**Goal**: GUI で 6匹編成（Champions仕様：Lv50/IV31固定、SP入力、メガ候補1匹、format=single/double）→ Claude が `review-party` Skill でレビュー → 承認で `update_party_slot` → GUI 即更新。

- `packages/data-service`: PartyService 拡張（6スロット、持ち物/技/特性/性格/SP、メガターゲットフラグ、format）
- `apps/electron/src/renderer/routes/party/`: 構築画面（D&D、6スロット、技選択モーダル、SP配分UI、メガマーク、選出シナリオ保存）
- `apps/electron/src/renderer/stores/party-store.ts`: Zustand + IPC 購読 + change-event 受信
- `apps/mcp-server/src/tools/parties.ts`: Party CRUD + `create_party_selection`
- `apps/electron/src/main/mcp-host.ts`: MCP 子プロセス起動、SQLite polling
- `packages/damage-calc` 初版（Lv50/IV31固定式、type-effectiveness、SP→実数値換算）
- `apps/mcp-server/src/tools/calc.ts`: `compute_stats`, `analyze_type_coverage`, `analyze_selection_patterns`
- `skills/review-party/SKILL.md`
- `tools/install-skills.ts`（`~/.claude/skills/poke-mate/` に symlink）
- `tools/register-mcp.ts`（`claude_desktop_config.json` 自動マージ）

---

## Phase 1b: ダメージ計算 & シミュレーション（目安 2 週間）

- `packages/damage-calc` 本格化（`@smogon/calc` フォーク → Champions仕様適用：独自バランス、新特性4種、状態異常弱体、Lv50/IV31固定式）
- `packages/damage-calc/__tests__/`: 既知ケース 50 件以上（Bulbapedia / 実機ログを出典）
- `apps/mcp-server/src/tools/calc.ts`: `simulate_damage`, `simulate_mega_timing`, `suggest_sp_spread`
- `apps/electron/.../routes/battle/`: シミュレーション画面（攻守選択 → 技 → ダメージ幅、フィールド/天候/持ち物、メガ切替、選出シナリオ連動）
- `skills/simulate-matchup/SKILL.md`, `skills/optimize-training/SKILL.md`

---

## Phase 2a: 対戦ログ振り返り（目安 1.5 週間）

- `packages/log-parser`: 中間表現設計 + テキスト入力パーサ。公式リプレイ形式が公開され次第アダプタ追加（Champions側の仕様調査と並行）
- `apps/mcp-server/src/tools/logs.ts`: `import_battle_log`, `get_battle_log`, `parse_battle_log_text`
- `apps/electron/.../routes/log/`: ログ一覧 + 詳細 + ターンスクラバー + 分岐点可視化
- `skills/analyze-battle-log/SKILL.md`

**補足**: Champions公式リプレイフォーマットは調査段階。Phase 2a開始時に最新状況を確認し、入手できなければ手動入力/テキスト貼り付けで貫通させる。

---

## Phase 2b: 環境メタ分析（目安 1.5 週間）

- `packages/master-data`: シーズン(M-N)別メタスナップショットローダー（CSV/JSON）
- `apps/mcp-server/src/tools/meta.ts`: `get_meta_snapshot`, `query_meta`（format × rank_band × season のキー）
- `apps/electron/.../routes/meta/`: 使用率ヒートマップ、メガ別採用率、技採用率、型構成分布、シーズン遷移
- `skills/meta-brief/SKILL.md`, `skills/counter-suggest/SKILL.md`

---

## Phase 2c: 配布（目安 1 週間）

- `electron-builder` 設定、dmg 生成
- macOS コード署名・公証
- 初回起動ウィザード: DB パス選択、マスタデータ投入、MCP 登録、Skills インストール
- README とスクリーンショット

---

## 後回し推奨

- **フル自動プレイ / AI vs AI**: 重すぎる
- **Web 版**: MVP 後の拡張候補。`data-service` を indexedDB アダプタに差し替え可能にする抽象化は Phase 2 以降で検討

---

## 検証方法

### Phase 0 完了時

1. `pnpm install && pnpm build`
2. `pnpm --filter electron dev` で Electron 起動、ポケモン検索動作確認
3. `npx @modelcontextprotocol/inspector node apps/mcp-server/dist/index.js` で `search_pokemon` を MCP 越しに叩いて GUI と同結果
4. 同じ DB ファイルを Main と MCP が同時に開いても破損しない（WAL 確認）
5. `tools/register-mcp.ts` 実行後、Claude Desktop から `search_pokemon` が呼べる

### Phase 1a 完了時の E2E シナリオ

1. GUI でシングル用パーティを作成、Championsプールから6匹登録（うち1匹をメガ候補に）
2. 各スロットにSP（ステータスポイント）/ 性格 / 特性 / 技4つ / 持ち物を設定
3. Claude Desktop で「このパーティ（party_id）をレビューして。対メガリザY・メガガブ・受けループへの選出も考えて」
4. `review-party` Skill 起動 → `analyze_type_coverage` + `analyze_selection_patterns` で弱点と推奨選出3セット提示
5. 「6枠目を別案に変えて」と指示
6. MCP `update_party_slot` と `update_training`（SP配分）が実行される
7. GUI にトースト表示、スロットが即座に書き換わる
