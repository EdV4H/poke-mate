# 主要リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| **ポケモンチャンピオンズのマスタデータ不足** | アプリの根幹が動かない | 既存作データ + 差分JSON、手動エディタ、コミュニティデータ取り込みローダ。発売直後は「種族値未確定」バッジで潔く示す |
| **ダメージ計算の正確性** | ユーザー信頼性が崩壊 | `packages/damage-calc` を独立させ、`@smogon/calc` をフォークベースに。既知ケース（公式ダメージ表/実機ログ）で 50 件以上のユニットテスト |
| **MCP と GUI の状態同期複雑化** | バグの温床 | Single writer 原則（DataService 経由のみ）、`change_events` テーブルで監査、楽観ロック。Renderer は「サーバ状態の投影」と割り切る |
| **Claude Desktop 更新で MCP 仕様が変わる** | 動かなくなる | MCP SDK をピン留め、`@modelcontextprotocol/inspector` で E2E テストを CI 化 |
| **Skill が長すぎて動作不安定** | UX 劣化 | 1 Skill は 10 ステップ以内。複雑な処理は MCP ツール側に寄せる（計算はツール、判断は Skill） |
| **SQLite 同時書き込み競合（Electron + standalone MCP）** | データ破損 | WAL モード、書き込みは常に DataService 経由、`BEGIN IMMEDIATE` でロック取得、リトライ。Electron 実行中は standalone MCP を自動 shutdown |
| **Electron 配布のコード署名・公証** | インストール不可 | 最初から `electron-builder` + Apple 公証フロー。Phase 0 で一度配布まで通す |
| **Zustand / IPC スキーマ不整合** | 型エラー地獄 | `@poke-mate/shared-types` パッケージで IPC チャンネル契約を一元化 |

## 早期検証が必要な仮説

Phase 0 のうちに潰しておきたい技術検証:

1. **MCP サーバーが Electron 子プロセスと standalone の両モードで動くか**
2. **SQLite WAL で複数プロセス同時アクセスが壊れないか**
3. **macOS 公証が通る Electron ビルドを作れるか**
4. **Claude Desktop の `claude_desktop_config.json` に自動マージして認識されるか**

## データパックの持続性

チャンピオンズのマスタデータは「誰がメンテするか」が長期リスク。

- 短期: 手動で維持
- 中期: コミュニティデータパックに依存
- 長期: マスタエディタをアプリ同梱し、ユーザー貢献で更新できるように
