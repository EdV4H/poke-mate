---
name: build-party-with-me
description: ユーザーと対話しながら poke-mate のパーティを6匹埋めて完成させる。評価ではなく「一緒に組む」ループ。
---

# build-party-with-me

poke-mate で空 or 編成途中のパーティに対して、ユーザーと **対話しながら残りのスロットを埋めていく** スキル。一方的に提案するのではなく、意図を聞き → 候補を提示 → 合意したら `update_party_slot` で書き込む、を繰り返す。

## 入力

- `party_id`（必須）: poke-mate GUI で表示されるパーティID

## 前提

- poke-mate MCP サーバーが稼働していること（ツール `get_party`, `update_party_slot`, `suggest_party_slot`, `search_pokemon` が呼べる状態）
- GUI が開いていれば、書き込みは即座に反映される（フラッシュ + トースト）

## 手順

### Step 1: 現状把握

`get_party` で `party_id` から現在のパーティを取得する。以下を把握:

- 埋まっているスロット数、各スロットのポケモン
- 空きスロットの数
- 形式（single/double）

### Step 2: 意図のヒアリング

ユーザーに短く質問する（1〜2問で済ます）:

- どんな軸のパーティにしたい？（高速アタッカー / 受け回し / 天候 / トリル 等）
- 好きなポケモン、絶対入れたいポケモンはある？
- 嫌い・苦手なタイプはある？

回答を受けて、以下の形に整理する:

```
intent = {
  roles?: ["attacker" | "wall" | "fast" | "support"],
  cover_types?: ["dragon", "fairy", ...],
  avoid_types?: ["water", ...],
}
```

### Step 3: スロットごとの提案ループ

空きスロット1つずつについて、以下を繰り返す:

1. `suggest_party_slot({ party_id, intent })` を呼び、候補3件を取得
2. ユーザーに提示する。各候補について:
   - 名前（日本語）
   - 役割（attacker/fast/wall/support）
   - 採用理由（サーバーが返す `reasons` を要約）
3. ユーザーがどれかを選んだら `update_party_slot` で該当スロットに書き込む
   - `expected_version` は既存 set があれば付ける。無ければ省略
4. 書き込み成功を1行で報告（「スロット2にドラパルトを入れました」）

### Step 4: 完成 → 最終チェック

全スロットが埋まったら、ユーザーに聞く:

> 6匹揃いました。最終チェックしますか？

Yes なら `review-party` Skill に委譲する（そちらのスキルを呼び出す）。No なら終了。

## エラー対応

- `update_party_slot` が `VersionConflict` を返したら:
  1. `get_party` を再実行して最新版を取得
  2. 同じ slot を最新情報でもう1度書き込む（1回だけリトライ）
  3. それでも衝突するなら、ユーザーに「GUI 側で編集中かもしれません」と伝えて中断

## 禁止事項

- ユーザーの合意なしに `update_party_slot` / `delete_party_slot` を呼ばない
- 1回のメッセージで6匹すべてを提示しない（スロット1つずつ合意を取る）
- レビューや評価に終始しない（このスキルは「構築」が主軸）

## 設計メモ

- 1 Skill 10ステップ以内（Step 3 のループは「1スロット分」で1ステップと数える）
- 計算・検索は MCP ツールに任せ、Skill 側は判断と対話に集中する
