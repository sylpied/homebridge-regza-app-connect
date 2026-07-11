# homebridge-regza-app-connect v0.4.0

REGZA App Connect / TV Web Interface を使って、HomeKit から REGZA を操作する Homebridge Dynamic Platform Plugin です。

## 主な機能

- HomeKit Television アクセサリ対応
- HTTPS TV Web Interface、ポート 4430 対応
- Digest 認証対応
- REGZA の自己署名/Private CA 証明書対応
- ON/OFF別電源キー対応
- 旧機種向けトグル電源キー対応
- モデルプロファイル対応
- REGZA v2 APIによる電源・入力・消音状態の定期同期
- HomeKitリモコンのナビゲーションモード
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
| 地デジ | `40BF7A` |
| BS | `40BF7C` |
| CS | `40BF7D` |
| HDMI Next Active | `40BF3A` |
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

### HDMI入力

55J10Xの実機では、地デジ`40BF7A`、BS`40BF7C`、CS`40BF7D`、HDMI Next Active`40BF3A`の動作を確認済みです。HomeKitで「HDMI（次のアクティブ入力）」を選ぶたびに、次のアクティブなHDMI入力へ切り替わります。HDMI 1～3の直接コードは機種別のカスタム設定用として残していますが、55J10Xの既定入力には使用しません。

## 55J10X 推奨設定

v0.4.0 では `55J10X` モデルプロファイルを選び、IPアドレスと App Connect のユーザー名/パスワードだけ入力すれば使えます。

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

REGZAがHTTP `200 OK`と本文`0`を返した直後にHomeKitの電源表示を更新します。放送視聴中は確実にONと判定できます。一方、55J10XはHDMIからスタンバイへ移行しても`external`を保持するため、曖昧な状態では実機検証済みの消音プローブを使います。

1. 現在の消音状態を取得
2. 消音キー`40BF10`を送信
3. 消音状態を再取得
4. 変化なしならスタンバイ、変化ありならON
5. 変化した場合は消音キーを再送し、元の状態へ復元されたことを確認

55J10Xで確認済みの値：

| テレビ状態／入力 | `content_type` | HomeKit状態 |
|---|---|---|
| 放送視聴後のスタンバイ | `other` | 消音プローブで確認 |
| 地デジ／BS／CS | `broadcast` | ON |
| HDMIまたはHDMI視聴後のスタンバイ | `external` | 消音プローブで判別 |

消音状態は`GET /v2/remote/status/mute`で同期します。通常の入力・消音取得は既定30秒です。消音プローブは一瞬の音切れや画面表示を減らすため既定300秒とし、`enableMutePowerProbe`と`powerProbeInterval`で変更できます。内蔵アプリ表示中の状態はまだ十分に検証できていません。

## 他のREGZA機種を調査する

対応テレビでは、利用可能なv2 APIの一覧を次のURLから取得できる場合があります。

```text
https://TV_IP:4430/v2/remote/support
```

安全な確認コマンド、レスポンス形式、検証済みステータスAPI、他機種の報告方法は[REGZA App Connectプロトコル調査ガイド](docs/PROTOCOL.md)にまとめています。結果を共有する際は、認証情報、アクセスコード、機器IDなどを必ず削除してください。

## HomeKitリモコンのナビゲーションモード

HomeKitのTVリモコンにはREGZA専用のメニューボタンがありません。v0.4.0では、最初の「決定」でメニューを開き、その後の「決定」を通常の決定キーとして送信できます。

```json
{
  "selectKeyMode": "guideFirst",
  "navigationTimeoutSeconds": 60,
  "navigationPostSelectResetSeconds": 5
}
```

- `guideFirst`：最初の決定で番組表`40BF6E`
- `menuFirst`：最初の決定で設定メニュー`40BFD0`
- `quickFirst`：最初の決定でクイックメニュー`40BF27`
- `normal`：常に通常の決定`40BF3D`

番組表／メニュー内で通常の決定を送った後、5秒でナビゲーションモードを解除します。その間に矢印または追加の決定を操作すると解除を延期するため、確認ダイアログも操作できます。番組を選んで視聴を開始した後は、戻るを押さなくても次の決定で再び番組表を開けます。

戻る、終了、電源OFF、または長い無操作タイムアウトでも解除します。純正リモコンでメニューを閉じたことはHomebridgeから直接検出できないため、これらのタイマーを補助として使用します。

## ローカルインストール

```bash
sudo npm install -g /path/to/homebridge-regza-app-connect-0.4.0.tgz
```

その後、Homebridge を再起動してください。
