# アーキテクチャ

Pokémon Championsの対戦をローカルで深堀りするデスクトップ思考支援ツール。
ゲーム本体（Switch/Switch2/モバイル）とは直接通信せず、HOMEエクスポートデータ・
手動入力・リプレイテキスト・画面ログなどの**外部入力**を取り込んで分析する前提。

## 全体図

```
┌──────────────────────────────────────────────────────────────┐
│  Claude Desktop                                               │
│  ├─ Skills (~/.claude/skills/poke-mate/*)                     │
│  └─ MCP Client ──stdio──▶ poke-mate MCP Server                │
└──────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│  poke-mate Electron App                                       │
│  ┌──────────────────────┐  ┌───────────────────────────────┐  │
│  │ Main Process          │  │ Renderer Process (React)       │  │
│  │ - App lifecycle       │  │ - Party Builder View           │  │
│  │ - Window管理          │  │ - Battle Sim View              │  │
│  │ - DataService (SQLite)│◄─┤ - Log Viewer                   │  │
│  │ - ChangeBus           │  │ - Meta Dashboard               │  │
│  │ - IPC ハンドラ        │  │ - Zustand ストア               │  │
│  │ - MCP子プロセス管理   │  │                                │  │
│  └──────────┬───────────┘  └───────────────┬───────────────┘  │
│             │ IPC                           │                  │
│             └───────────────────────────────┘                  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Local MCP Server (Node.js, standalone可)              │   │
│  │ - @modelcontextprotocol/sdk                            │   │
│  │ - DataServiceを直接import                             │   │
│  │ - stdio transport                                      │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ SQLite WAL (~/Library/Application Support/poke-mate/)  │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## プロセスと責務

| プロセス | 責務 |
|---|---|
| **Electron Main** | SQLite唯一アクセス（better-sqlite3）、DataService、ChangeBus、MCP子プロセス管理、IPCハンドラ |
| **Preload** | `contextBridge` で安全にIPC APIを露出 |
| **Renderer (React)** | Zustand stores、shadcn/ui、TanStack Router、IPC越しにDataService呼出 |
| **MCP Server** | DataServiceをimportして同DBに読み書き、stdio transport、standalone起動可 |

## MCPサーバーの起動方式

**2系統で動けるバイナリ**:

1. **standalone モード** (Claude Desktop から): `claude_desktop_config.json` に登録された Node プロセスとして起動。SQLiteファイルを直接開く。
2. **embedded モード** (Electron 内から): Mainプロセスが子プロセスとして `child_process.spawn`。

両モードで同じ `DataService` を共有する。

### 同時書き込み対策

- SQLite は **WAL モード** (`PRAGMA journal_mode=WAL`)
- 書き込みは常に `DataService` 経由、`BEGIN IMMEDIATE` でロック取得、失敗時リトライ
- Electron 実行中は standalone MCP を自動 shutdown（競合回避）

## GUI↔AI 状態同期

```
[MCP Server が update_party_slot を実行]
    ↓ DataService.updatePartySlot()
    ↓ SQLite UPDATE + change_events INSERT
    ↓ ChangeBus.emit('party.updated', {party_id, change_event_id})
    ↓
[Main Process の ChangeBus が受信]
    ↓ webContents.send('change-event', payload)
    ↓
[Renderer の preload が受信]
    ↓ Zustand store の invalidate(party_id)
    ↓ 影響コンポーネント再レンダ + トースト「AIが変更しました」
```

### プロセス間連携

- **MCP → Main**:
  - MVP: `change_events` テーブルを 0.5 秒 polling（シンプル・壊れにくい）
  - 後日: Electron実行中はIPC/Unix socketに切替
- **Main → Renderer**: `webContents.send` / `ipcRenderer.on`
- **Renderer → Main**: `ipcRenderer.invoke`（Promise形）

### 一貫性

- 各エンティティに `version` 列、UPDATE は `WHERE version = ?` で楽観ロック
- 衝突時は `VersionConflictError` を返し、Skill側で `get → merge → retry`
- 書き込みは必ず `change_events` に記録。MCPレスポンスに `change_event_id` を含め、GUI側で「AIが変えました」バッジ表示に使える

## Claude Desktop 連携

- `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`) にMCPサーバーを登録
- Skills は `~/.claude/skills/poke-mate/` に配置（開発中はリポジトリ `skills/` へsymlink）
- 初回起動ウィザードで自動セットアップ（`tools/register-mcp.ts`, `tools/install-skills.ts`）

## 技術選定

| 領域 | 選定 | 理由 |
|---|---|---|
| デスクトップ | Electron + electron-vite | 情報量が段違い、Nodeエコシステム流用 |
| UI | React + TypeScript | 雇用可能性と型安全 |
| 状態 | Zustand | IPC push event を store に流すのが素直 |
| ルーティング | TanStack Router | 型安全 |
| スタイル | Tailwind + shadcn/ui | プロト速度最優先 |
| DB | SQLite + better-sqlite3 | 同期API、Mainでシンプル |
| ORM | Drizzle | Prismaより軽くElectron同梱しやすい |
| MCP | @modelcontextprotocol/sdk | 公式 |
| リポジトリ | pnpm workspaces | モノレポ、packages共有 |
| 配布 | electron-builder | macOS署名・公証サポート |

## ディレクトリ構成

```
poke-mate/
├── apps/
│   ├── electron/              # Electronアプリ（main/preload/renderer）
│   └── mcp-server/            # MCPサーバー（standalone起動可）
├── packages/
│   ├── shared-types/          # エンティティ、IPC/MCP契約
│   ├── data-service/          # SQLite + Drizzle + ドメインロジック
│   ├── damage-calc/           # 純粋関数、テスト網羅
│   ├── master-data/           # マスタJSON + ローダー
│   └── log-parser/            # 対戦ログパーサ
├── skills/                    # Claude Skills 正本
├── tools/                     # install-skills.ts, register-mcp.ts
└── docs/
```
