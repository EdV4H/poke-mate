# アーキテクチャ

Pokémon Championsの対戦をローカルで深掘りするデスクトップ思考支援ツール。
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
| **Electron Main** | GUI側のDBアクセス窓口（Rendererは直接SQLiteに触れずIPC経由）。better-sqlite3、DataService、ChangeBus、MCP子プロセス管理、IPCハンドラ |
| **Preload** | `contextBridge` で安全にIPC APIを露出 |
| **Renderer (React)** | Zustand stores、shadcn/ui、TanStack Router、IPC越しにDataService呼出 |
| **MCP Server** | DataServiceをimportして同DBに読み書き、stdio transport、standalone起動可 |

> **SQLiteへの接続主体はMainとMCP Serverの2プロセス**。両者がDataService経由で同じDBを叩く（Rendererは触らない）。WALモードと `BEGIN IMMEDIATE` + `busy_timeout` + リトライで整合性を担保する（詳細は後述）。

## MCPサーバーの起動方式

**2系統で動けるバイナリ**:

1. **standalone モード** (Claude Desktop から): `claude_desktop_config.json` に登録された Node プロセスとして起動。SQLiteファイルを直接開く。
2. **embedded モード** (Electron 内から): Mainプロセスが子プロセスとして `child_process.spawn`。

両モードで同じ `DataService` を共有する。

### 同時書き込み対策

- SQLite は **WAL モード** (`PRAGMA journal_mode=WAL`)
- 書き込みは常に `DataService` 経由、`BEGIN IMMEDIATE` + `busy_timeout`（例: 5000ms）+ 指数バックオフのリトライ
- **Electron と standalone MCP の同時起動は非推奨**（Claude Desktop 起動の別プロセスは Electron から確実に停止できない前提）
- 協調は次の手段で実現:
  - 起動時に `lockfile`（pidとプロセス種別を書く）を確認、他方が生きていればユーザーに警告ダイアログを出す
  - 書き込みロック継続を検知したらユーザーに切替案内（「Electronを使う間はClaude Desktop側のMCPを停止してください」）
  - 実行中に相手側が起動した場合は、ChangeBus / polling の両方で動く設計で破綻しないようにする

## GUI↔AI 状態同期

ChangeBusはNodeのEventEmitterなのでプロセス境界を越えられない。よって **standalone MCPとembedded MCPで経路を分ける**。

### standalone MCP（別プロセス）から書き込まれた場合

```
[MCP Server（別プロセス） が update_party_slot を実行]
    ↓ DataService.updatePartySlot()
    ↓ SQLite UPDATE + change_events INSERT
    ↓
[Main Process が change_events を tail/polling（0.5秒間隔）で検知]
    ↓ ChangeBus.emit('party.updated', {party_id, change_event_id})  -- Main内に再注入
    ↓ webContents.send('change-event', payload)
    ↓
[Renderer の preload が受信]
    ↓ Zustand store の invalidate(party_id)
    ↓ 影響コンポーネント再レンダ + トースト「AIが変更しました」
```

### embedded MCP（Main内 child_process）から書き込まれた場合

child_processの `process.send` IPCでMainに通知できるため、pollingを介さない:

```
[embedded MCP が update_party_slot を実行]
    ↓ DataService.updatePartySlot()
    ↓ SQLite UPDATE + change_events INSERT
    ↓ process.send({type: 'change', ...}) → Main の ChangeBus.emit
    ↓ webContents.send('change-event', payload) → Renderer更新
```

### Main内の書き込み（GUI経由）

最短経路。DataService呼出後に直接 `ChangeBus.emit` → `webContents.send`。

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
