# コンセプト: 共有ワークスペース

## 目的

ポケモン対戦（最新作「ポケモンチャンピオンズ」想定）を**より深く考える**ための思考支援ツール。GUIの視覚的操作性とAIの分析力を、同じデータモデルの上で融合させる。

## 3つの芯

4機能を別々のアプリに見せず、**1つの「対戦研究ノート」** として統合する。

- **Workspace**: ユーザーの作業空間。複数の Party/BattleSession を束ねる最上位コンテナ。
- **Artifact**: Workspace に属する「モノ」。Party / BattleSession / BattleLog / MetaSnapshot / Note すべて Artifact の派生。
- **View**: 各 Artifact を操作する GUI 画面（構築/対戦/ログ/メタ）。

> AIが `update_party_slot` を呼ぶと、開いているPartyビューが即光って更新される。GUIとAIが「同じオブジェクトを編集している」感覚を作るのがこのアプリの根幹。

## MVPでカバーする4機能

1. **パーティ構築支援**: 6匹選出、技/持ち物/努力値/性格/テラス。AIが相性と穴を分析。
2. **対戦シミュレーション**: ダメージ計算、ターン読み、仮想対戦。
3. **対戦ログ振り返り**: ログを読み込み、AIが分岐点を指摘。
4. **環境メタ分析**: 流行構築/使用率/受けループなどの可視化。

## 典型的なユーザー動線

```
[メタ画面] 流行把握
    ↓ 「受けループ組みたい」
[新規Party] GUIで6匹ポチポチ
    ↓
Claude Desktopで「このパーティの穴を分析して」
    ↓
review-party Skill が起動
  → MCP: get_party → analyze_type_coverage → get_meta_snapshot
    ↓
AI: 「鋼が重い、XXで補えます」
  → update_party_slot を呼んで提案を反映
    ↓
GUIが即座に更新（トースト「AIが変更しました」）
    ↓
[シミュレーション] 読み合いを検証
    ↓
[試合後] ログをD&D
  → analyze-battle-log が分岐点を指摘
```

## 設計原則

- **Single Source of Truth**: SQLiteが真実。GUIもMCPもそれを見る。
- **Single writer**: 書き込みは必ず `DataService` 経由。GUI直SQL禁止、MCPもDataServiceを呼ぶ。
- **Change events**: `change_events` テーブルをメッセージキューとして使い、GUI↔MCP の状態同期を取る。
- **Optimistic UI + Reconcile**: GUIはローカル楽観更新、DBコミット後に差分照合。
- **AIの動きが見える**: AIによる書き込みはGUIに明示的にフィードバック（トースト、ハイライト）。
