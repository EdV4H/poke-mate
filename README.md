# poke-mate

**Pokémon Champions**（2026年4月8日 Switch/Switch2発売、モバイル版2026年夏）の対戦をより深く考えるためのデスクトップアプリ。

- **ユーザー**: GUIで視覚的に操作（パーティ構築、シミュレーション、ログ閲覧、メタ可視化）
- **AI**: MCP + Claude Skills 経由で同じデータを読み書きし「AI Native」に相互作用
- 両者が同じ状態を共有する **共有ワークスペース** モデル

Championsの独自仕様（Lv50/IV31固定、EV→SP換算、メガシンカのみ、独自バランス調整、278種プール、月次シーズンなど）に最適化した設計。

## ステータス

MVP設計フェーズ。実装はこれから。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/concept.md](docs/concept.md) | コア体験と共有ワークスペースモデル |
| [docs/architecture.md](docs/architecture.md) | Electron + MCP の全体アーキテクチャ |
| [docs/data-model.md](docs/data-model.md) | SQLiteスキーマとマスタデータ戦略 |
| [docs/mcp-skills.md](docs/mcp-skills.md) | MCPツールとClaude Skillsの設計 |
| [docs/roadmap.md](docs/roadmap.md) | Phase 0〜2cの段階的実装プラン |
| [docs/risks.md](docs/risks.md) | 主要リスクと対策 |

## 技術スタック（想定）

- Electron + React + Vite + TypeScript
- Zustand / TanStack Router / shadcn/ui + Tailwind
- SQLite (better-sqlite3) + Drizzle ORM
- @modelcontextprotocol/sdk（MCPサーバー）
- pnpm workspaces（モノレポ）
