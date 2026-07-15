# REGZA App Connectプロトコル調査ガイド

## DBR-M590レガシーリモコン

DBR-M590はTV用v2 APIを公開しませんが、HTTP 80番ポートでDigest認証された次のリモコンAPIを提供します。

```text
GET /remote/remote.htm?key=<レコーダー用短縮コード>
```

### DBR-M590の電源状態調査

電源ON/OFFで次の経路を実機比較しましたが、いずれも同一の応答でした。

- TCP 1048の655バイト状態データ
- SSDPで公開される9種類のMediaServerサービス
- UPnPの引数なし読み取り専用SOAPアクション9件

SOAP応答はファイルサイズ10,767バイトとSHA-256が完全一致しました。`GetSystemUpdateID`は`40487`、`GetCurrentConnectionIDs`は`0`で変化せず、`X_Toshiba_GetTimeShiftSetting`、録画先、FriendlyNameなども同一です。DBRのDLNA/ネットdeナビ系サーバーは本体の表示上の電源状態とは独立して待機中も稼働していると考えられます。

このため、現時点でDBR-M590のHomeKit電源状態は楽観的に管理します。純正リモコンなど別経路の電源操作を確実に検出できる読み取り専用APIは確認できていません。

成功時はHTTP 200と空のHTMLページを返します。TVのような本文`0`は返さないため、モデルプロファイルごとに成功判定を分けます。

[English](PROTOCOL.md) | 日本語

一部のREGZAは、利用可能な機能を取得できるv2 APIを公開しています。未検証機種を調査するときは、最初にサポート情報APIを確認することを推奨します。

リモコンコードは[REGZAリモコンキー参考表](REMOTE_KEYS.ja.md)も参照してください。未確認のキーを含むため、機種ごとに安全に検証してください。

## 対応コマンド一覧の取得

REGZA 55J10Xで確認済み：

```text
GET https://TV_IP:4430/v2/remote/support
```

このAPIは、レグザAppsコネクトで設定したものと同じユーザー名とパスワードによるHTTP Digest認証を使用します。REGZAはプライベートCAまたは自己署名TLS証明書を使う場合があるため、ローカル環境で`curl`を使って確認するときは`-k`が必要です。

```bash
curl -k --digest \
  -u 'REGZA_USERNAME:REGZA_PASSWORD' \
  'https://TV_IP:4430/v2/remote/support'
```

レスポンスの`command`配列には、利用可能なAPIが記載されています。各項目の意味：

- `http_method`：必要なHTTPメソッド
- `resource`：APIのパス
- `params`：受け付けるパラメーター名

例：

```json
{
  "http_method": "GET",
  "resource": "/v2/remote/status/mute",
  "params": []
}
```

テレビの実IPアドレス、ユーザー名、パスワード、アクセスコード、機器ID、個人情報や機器固有情報を含む完全なレスポンスは公開しないでください。

## 機種・対応機能の取得

次のAPIから、機種とAPI機能に関する情報を取得できます。

```bash
curl -k \
  'https://TV_IP:4430/public/feature'
```

55J10Xでは、`ipc_version`が`v2`で、`V1Support`と`PIN_Auth`に対応していることを確認しています。

## 検証済みの読み取り専用ステータスAPI

```text
GET /v2/remote/play/status
GET /v2/remote/status/mute
GET /v2/remote/status/foreground_dtvapp
GET /v2/remote/settings/channel_list
```

55J10Xで確認済みの`play/status`の値：

| テレビの状態／入力 | `content_type` |
|---|---|
| スタンバイ | `other` |
| 地デジ／BS／CS | `broadcast` |
| HDMI | `external` |

重要：55J10XはHDMI表示からスタンバイへ移行した後も`external`を保持することがあります。そのため`external`単独ではONを確定できません。実機調査では、SSDPの`urn:schemas-upnp-org:device:MediaRenderer:1`が地デジ・BS・CS・HDMIのON中に応答し、スタンバイでは消失しました。本プラグインはMediaRenderer限定の問い合わせを使い、3回連続未応答でOFFを確定します。待機中も残る場合があるMediaServerは判定に使いません。

## ユーザー名・パスワードを設定できない機種

比較的新しいREGZAの一部では、レグザAppsコネクトを有効にできても、テレビの設定画面にユーザー名／パスワード欄がありません。このような機種では、PINを使ったクライアント登録によりDigest認証用のユーザーIDとパスワードを発行できる場合があります。

コミュニティによる参考実装[9SQ/regza-digest-auth](https://github.com/9SQ/regza-digest-auth)では、次の流れが説明されています（[関連するX投稿](https://x.com/9SQ/status/1357970437683040257)）。

1. テレビのIPアドレスを固定し、レグザAppsコネクトを有効にする
2. MACアドレス形式のクライアントユーザーIDを決める
3. テレビをONにし、設定画面などを閉じて通常のテレビ視聴状態で登録クライアントを実行する
4. テレビに表示された4桁のPINを入力する
5. 返されたユーザーIDと生成パスワードを安全に保管する

発行された認証情報は、`/remote/`と`/v2/remote/` APIのDigest認証に利用できます。55J10Xのようにテレビ側で認証情報を直接設定できる機種では、この登録作業は不要です。生成された認証情報をGitへコミットしたり、公開したりしないでください。

## 他機種を調査する手順

1. テレビ側でレグザAppsコネクトを有効にし、認証情報を準備する
2. `/public/feature`を取得し、機種、`ipc_version`、機能名を記録する
3. `/v2/remote/support`を取得し、コマンド一覧を保存する
4. 最初に読み取り専用の`GET` APIを検証する
5. `POST`や`DELETE`を試す前に全パラメーターを確認し、テレビ設定、録画、予約などが変更される可能性を想定する
6. 機種名、ファームウェア／バージョン情報、APIパス、HTTPメソッド、機密情報を削除したレスポンスをGitHub Issueへ報告する
