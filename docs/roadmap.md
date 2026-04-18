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
   - IPC で `list_pokemon`, `search_pokemon` を呼べる
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

**Goal**: GUI で 6 匹編成 → Claude が `review-party` Skill でレビュー → 承認で `update_party_slot` → GUI 即更新。

- `packages/data-service`: PartyService 拡張（6スロット、持ち物/技/努力値/性格/テラス）
- `apps/electron/src/renderer/routes/party/`: 構築画面（D&D、6スロット、技選択モーダル、努力値 UI）
- `apps/electron/src/renderer/stores/party-store.ts`: Zustand + IPC 購読 + change-event 受信
- `apps/mcp-server/src/tools/parties.ts`: Party CRUD 7ツール
- `apps/electron/src/main/mcp-host.ts`: MCP 子プロセス起動、SQLite polling
- `packages/damage-calc` 初版（type-effectiveness まで）
- `apps/mcp-server/src/tools/calc.ts`: `analyze_type_coverage`
- `skills/review-party/SKILL.md`
- `tools/install-skills.ts`（`~/.claude/skills/poke-mate/` に symlink）
- `tools/register-mcp.ts`（`claude_desktop_config.json` 自動マージ）

---

## Phase 1b: ダメージ計算 & シミュレーション（目安 2 週間）

- `packages/damage-calc` 本格化（`@smogon/calc` ベースでチャンピオンズ仕様に調整）
- `packages/damage-calc/__tests__/`: 既知ケース 50 件以上
- `apps/mcp-server/src/tools/calc.ts`: `simulate_damage`
- `apps/electron/.../routes/battle/`: シミュレーション画面（攻守選択 → 技 → ダメージ幅、フィールド/天候/持ち物）
- `skills/simulate-matchup/SKILL.md`

---

## Phase 2a: 対戦ログ振り返り（目安 1.5 週間）

- `packages/log-parser`: Showdown テキストパーサ（チャンピオンズ形式を抽象化）
- `apps/mcp-server/src/tools/logs.ts`: `import_battle_log`, `get_battle_log`, `parse_battle_log_text`
- `apps/electron/.../routes/log/`: ログ一覧 + 詳細 + ターンスクラバー
- `skills/analyze-battle-log/SKILL.md`

---

## Phase 2b: 環境メタ分析（目安 1.5 週間）

- `packages/master-data`: メタスナップショットローダー（CSV/JSON）
- `apps/mcp-server/src/tools/meta.ts`: `get_meta_snapshot`, `query_meta`
- `apps/electron/.../routes/meta/`: 使用率ヒートマップ、技採用率、型構成分布
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

1. GUI でパーティ作成、6 匹登録
2. Claude Desktop で「このパーティ（party_id）をレビューして」
3. `review-party` Skill 起動、タイプ弱点を指摘
4. 「ガブリアスをドラパルトに変えて」と指示
5. MCP `update_party_slot` が実行される
6. GUI にトースト表示、スロットが即座に書き換わる
