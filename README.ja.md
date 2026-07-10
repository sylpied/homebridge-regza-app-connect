# homebridge-regza-app-connect v0.2.1

REGZA App Connect / TV Web Interface を使って、HomeKit から REGZA を操作する Homebridge Dynamic Platform Plugin です。

## 主な機能

- HomeKit Television アクセサリ対応
- HTTPS TV Web Interface、ポート 4430 対応
- Digest 認証対応
- REGZA の自己署名/Private CA 証明書対応
- ON/OFF別電源キー対応
- 旧機種向けトグル電源キー対応
- モデルプロファイル対応
- REGZA 55J10Xで実機検証済み

## REGZA 55J10X 実機検証結果

| 項目 | 値 |
|---|---|
| Protocol | HTTPS |
| Port | 4430 |
| Auth | Digest |
| Certificate | TV private/self-signed CA |
| Power ON | `40BF7E` |
| Power OFF | `40BF7F` |
| Power Toggle | `40BF12` |
| Remote endpoint | `/remote/remote.htm?key=<KEY>` |

`remote.htm` は成功時に text/plain の `0` を返します。

## テレビ側の初期設定

Homebridgeを設定する前に、テレビ側で以下を設定してください。メニュー名は機種により異なります。以下はJ10Xシリーズを基準にしています。

1. テレビとHomebridgeサーバーを同じ家庭内ネットワークへ接続します。
2. テレビのIPアドレスが変わらないようにします。ルーターのDHCP固定割り当て（推奨）を使うか、テレビの「IPアドレス自動取得」を「しない」にして、IPアドレス、サブネットマスク、デフォルトゲートウェイ、DNSを手動設定します。
3. テレビで **設定 → ネットワーク・サービス設定 → 外部連携設定 → レグザAppsコネクト設定** を開きます。
4. **レグザAppsコネクト**を**利用する**にし、ユーザー名とパスワードを設定します。
5. 同じIPアドレス、ユーザー名、パスワードをHomebridge UIの本プラグイン設定へ入力します。

### 認証、リモート電源オン、Wake on LAN

- 実機検証済みの55J10Xプロファイルは、**HTTPS 4430番ポート＋HTTP Digest認証**を使用します。レグザAppsコネクトで設定したユーザー名とパスワードがDigest認証に使われます。
- **55J10XプロファイルではBasic認証設定は不要です。** REGZAの世代や旧アプリによってBasic認証の設定が別に存在する場合がありますが、その機種の取扱説明書または実際に利用するAPIで必要な場合だけ設定してください。
- 55J10Xは検証済みの電源ON/OFF専用ネットワークキー（`40BF7E`/`40BF7F`）を使うため、**Wake on LANは不要**です。`enableWakeOnLan`は無効のままにしてください。
- Wake on LANは、リモートAPIだけでは電源ONできない機種向けの任意機能です。有効にする場合は、現在使用中のネットワークアダプターのMACアドレスを設定し、テレビ側のリモート電源オン／ネットワーク待機設定も有効にします。待機時の消費電力が増える場合があります。
- WOLを使わない場合、MACアドレスは必須ではありません。ただし、設定しておくとIPアドレスが変わってもHomeKitアクセサリの識別情報を安定させられます。

機種固有のネットワーク、レグザAppsコネクト、リモート電源オンの設定は、[J10X公式取扱説明書](https://cs.regza.com/document/manual/87826_01.pdf)を参照してください。

## 55J10X 推奨設定

v0.2.1 では `55J10X` モデルプロファイルを選び、IPアドレスと App Connect のユーザー名/パスワードだけ入力すれば使えます。

```json
{
  "platform": "RegzaAppConnect",
  "debug": true,
  "devices": [
    {
      "name": "REGZA 55J10X",
      "model": "55J10X",
      "ip": "192.168.100.150",
      "username": "REGZAで設定したユーザー名",
      "password": "REGZAで設定したパスワード"
    }
  ]
}
```

このプロファイルでは以下が自動適用されます。

```json
{
  "protocol": "https",
  "port": 4430,
  "allowSelfSignedCertificate": true,
  "powerMode": "discrete",
  "powerOnKey": "40BF7E",
  "powerOffKey": "40BF7F",
  "powerToggleKey": "40BF12"
}
```

## 電源制御方式

### Discrete mode 推奨

```json
{
  "powerMode": "discrete",
  "powerOnKey": "40BF7E",
  "powerOffKey": "40BF7F"
}
```

HomeKit ON で `powerOnKey`、HomeKit OFF で `powerOffKey` を送信します。

### Toggle mode 旧機種向け

```json
{
  "powerMode": "toggle",
  "powerToggleKey": "40BF12"
}
```

HomeKit ON/OFF のどちらでもトグルキーを送信します。ON/OFF別キーが効かない機種向けです。

`powerKey`だけを定義したv0.1.xの既存設定は、従来どおりトグル動作を維持します。

## 電源状態

REGZAがHTTP `200 OK`と本文`0`を返した場合だけ、HomeKitの電源表示を楽観的に更新します。本文`1`または`2`はコマンド失敗として扱い、HomeKitの状態を更新しません。

## ローカルインストール

```bash
sudo npm install -g /path/to/homebridge-regza-app-connect-0.2.0.tgz
```

その後、Homebridge を再起動してください。
