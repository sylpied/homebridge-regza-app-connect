# homebridge-regza-app-connect v0.5.0

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

### ユーザー名／パスワードが分からない場合

REGZAの世代によって認証情報の準備方法が異なります。

#### テレビにユーザー名／パスワード欄がある機種

55J10Xのように「レグザAppsコネクト設定」にユーザー名とパスワードの入力欄がある場合は、テレビで任意の値を設定し、同じ値を本プラグインへ入力してください。

#### テレビにユーザー名／パスワード欄がない機種

比較的新しい機種では、テレビ画面で認証情報を直接設定せず、4桁PINによるクライアント登録でDigest認証用ID／パスワードを発行する場合があります。コミュニティ実装[9SQ/regza-digest-auth](https://github.com/9SQ/regza-digest-auth)の手順：

1. テレビのIPアドレスを固定し、レグザAppsコネクトを「利用する」にする
2. `register.py`の`ip`へテレビのIPアドレスを設定する
3. `user_id`へ任意のMACアドレス形式のID（例：`AA-AA-AA-AA-AA-AA`）を設定する
4. 必要なPythonパッケージを`pip3 install -r requirements.txt`で導入する
5. テレビをONにし、設定画面などを閉じて通常のテレビ視聴状態にする
6. `python3 register.py`を実行する
7. テレビに表示された4桁PINを入力する
8. 表示された`user_id`と`user_pw`を本プラグインのユーザー名／パスワードへ設定する

発行された認証情報は`/remote/`と`/v2/remote/` APIのDigest認証に利用できます。パスワードは再取得が必要にならないよう安全に保管し、GitHub Issueやログへ貼り付けないでください。参考：[9SQ氏のX投稿](https://x.com/9SQ/status/1357970437683040257)、[登録ツールと手順](https://github.com/9SQ/regza-digest-auth)。詳細は[日本語プロトコル調査ガイド](docs/PROTOCOL.ja.md)にも記載しています。

機種固有のネットワーク、レグザAppsコネクト、リモート電源オンの設定は、[J10X公式取扱説明書](https://cs.regza.com/document/manual/87826_01.pdf)を参照してください。

### HDMI入力

55J10Xの実機では、地デジ`40BF7A`、BS`40BF7C`、CS`40BF7D`、HDMI Next Active`40BF3A`の動作を確認済みです。HomeKitで「HDMI（次のアクティブ入力）」を選ぶたびに、次のアクティブなHDMI入力へ切り替わります。HDMI 1～3の直接コードは機種別のカスタム設定用として残していますが、55J10Xの既定入力には使用しません。

## 55J10X 推奨設定

v0.5.0 では `55J10X` モデルプロファイルを選び、IPアドレスと App Connect のユーザー名/パスワードだけ入力すれば使えます。

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

安全な確認コマンド、レスポンス形式、検証済みステータスAPI、他機種の報告方法は[REGZA App Connectプロトコル調査ガイド（日本語）](docs/PROTOCOL.ja.md)にまとめています。結果を共有する際は、認証情報、アクセスコード、機器IDなどを必ず削除してください。

## HomeKitリモコンのナビゲーションモード

HomeKitのTVリモコンにはREGZA専用のメニューボタンがありません。v0.4.0では、最初の「決定」でメニューを開き、その後の「決定」を通常の決定キーとして送信できます。

```json
{
  "selectKeyMode": "guideFirst",
  "navigationTimeoutSeconds": 60,
  "navigationPostSelectResetSeconds": 15,
  "contextualRemoteArrows": true
}
```

- `guideFirst`：最初の決定で番組表`40BF6E`
- `menuFirst`：最初の決定で設定メニュー`40BFD0`
- `quickFirst`：最初の決定でクイックメニュー`40BF27`
- `normal`：常に通常の決定`40BF3D`

通常視聴中は、上／下でチャンネルUP／DOWN、左で地デジ、右でBSへ切り替えます。最初の決定で設定した番組表／メニューを開くと、矢印は通常の方向キー、決定は通常の決定キーへ切り替わります。

番組表／メニュー内で決定した後、矢印または決定が15秒間押されなければ「戻る」を自動送信し、画面を閉じてナビゲーションモードを解除します。追加操作があれば15秒を再計測します。次の決定では、戻るを手動で押さなくても再び番組表を開けます。

戻る、終了、電源OFF、または長い無操作タイムアウトでも解除します。純正リモコンでメニューを閉じたことはHomebridgeから直接検出できないため、これらのタイマーを補助として使用します。

## ローカルインストール

```bash
sudo npm install -g /path/to/homebridge-regza-app-connect-0.5.0.tgz
```

その後、Homebridge を再起動してください。
