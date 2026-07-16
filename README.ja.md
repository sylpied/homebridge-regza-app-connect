# homebridge-regza-app-connect

REGZA App Connect / TV Web Interface を使って、HomeKit から REGZA を操作する Homebridge Dynamic Platform Plugin です。

## 主な機能

- HomeKit Television アクセサリ対応
- HTTPS TV Web Interface、ポート 4430 対応
- Digest 認証対応
- REGZA の自己署名/Private CA 証明書対応
- ON/OFF別電源キー対応
- 旧機種向けトグル電源キー対応
- モデルプロファイル対応
- Toshiba DBR-M590レコーダーのネットワークリモコン対応
- REGZA v2 APIによる低負荷な電源・入力状態の定期同期
- HomeKitリモコンのナビゲーションモード
- REGZA 55J10Xで実機検証済み

Appleのリモコンで複数機器を正しく選択できるよう、55J10XとDBR-M590はそれぞれ独立したHomeKit Televisionアクセサリとして公開します。初回またはv0.8.0への移行時は、Homeアプリの「アクセサリを追加」からTVとDBRを個別に追加してください。

## インストールとHome.appへの追加

このプラグインは、確認済みのTVとレコーダーをHomebridgeブリッジ内の子サービスではなく、**独立したHomeKit Televisionアクセサリ**として公開します。そのため、一般的なHomebridgeプラグインとはHome.appへの追加手順が少し異なります。

1. Homebridge UIの「プラグイン」から`homebridge-regza-app-connect`をインストールします。
2. プラグイン設定を開き、「機器を追加」でTVまたはレコーダーを登録します。
3. 機器種別とモデルを選択します。確認済みモデルでは名前、接続方式、ポート、キー割り当てが自動設定されます。
4. IPアドレス、ユーザー名、パスワードを入力します。TVでWOLを使う場合だけMACアドレスも入力します。DBR-M590のHomeKit識別にはIPアドレスを使うため、MACアドレスは空欄で構いません。
5. 設定を保存し、Homebridgeを再起動します。
6. iPhone/iPadのHomeアプリで「＋」→「アクセサリを追加」→「その他のオプション」を開きます。
7. 一覧に表示された`REGZA 55J10X`や`DBR-M590`を**1台ずつ**選択し、Homebridgeと同じセットアップコードで追加します。カメラでコードを読み取る必要はありません。
8. 複数台ある場合は、手順6～7を各機器について繰り返します。

### REGZA App Connectブリッジは追加しません

Homeアプリの候補に`Homebridge Regza App Connect`というブリッジと、TV／DBR本体の両方が表示されることがあります。v0.8.0の確認済みプロファイルでは、**ブリッジはHome.appへ追加せず、TV／DBR本体だけを追加してください**。ブリッジを先に追加する必要もありません。

Homebridge UIの「Child Bridge」は、プラグインプロセスを分離して運用するための任意機能です。有効でも無効でも、Home.appへペアリングする対象は独立表示されたTV／DBRです。Homebridge本体またはChild Bridgeはバックグラウンドで動作する必要がありますが、それ自体をHome.appへ登録する必要はありません。

候補が表示されない場合は、iPhone/iPadとHomebridgeを同じLANへ接続し、Homebridgeログで機器の公開成功を確認してください。以前同じ機器を登録したことがある場合は、Home.appとHomebridgeのキャッシュに古いペアリングが残っていないか確認します。MACアドレスの変更で別アクセサリを増やさないため、DBR-M590はIPアドレスを識別子として使用します。

## Toshiba DBR-M590

DBR-M590はHTTP 80番ポートとDigest認証を使用します。設定画面で`DBR-M590`プロファイルを選択すると、レコーダー専用の短縮キーコードが適用されます。

Appleのリモコン画面は同じHomeKitブリッジ内の複数のTelevisionサービスを個別候補にしないため、DBR-M590は既定で独立したHomeKitアクセサリとして公開します。プラグイン更新・Homebridge再起動後、Homeアプリの「アクセサリを追加」からDBR-M590を一度だけ追加してください。セットアップコードはHomebridgeと同じです。これによりREGZA TVとDBR-M590の両方がリモコンの機器一覧に表示されます。

- 電源、スタートメニュー、矢印、決定、戻る、再生操作に対応
- 地デジ・BS・CS切り替えに対応
- 最初の決定でスタートメニューを開き、その後は通常の決定・矢印として動作
- 再生／一時停止ボタンは通常どおり専用の再生・一時停止キーを交互に送信
- 電源ONは、DBRへスタートメニュー`46`を送った直後（起動待ちなし）に、選択した連動テレビへ専用ONキーを送信
- 電源OFFは、連動テレビがOFFの時だけ`46`でDBRをONにしてから既定10秒後にトグルキー`12`を送信。テレビがONの時は視聴を乱さないよう`12`だけを送信
- 連動テレビの確定したON→OFFを検出すると、HomeKit上のDBR表示がON／OFFのどちらでも、既定5秒待ってからDBRへ`46`→10秒待機→`12`を自動送信。起動時にテレビが既にOFFの場合は実行せず、待機中にテレビがONへ戻ればキャンセル
- 成功時の空HTML応答をHTTP 2xxとして判定
- DBR-M590に存在しないTV用v2状態APIのポーリングを停止
- REGZA TVも同時に設定すると、DBRの音量と消音操作を最初のREGZA TVへ転送
- HomeKit公開方式は`独立アクセサリ`（`external`）を推奨

HomeKit上のDBR表示は楽観状態なので、既に要求状態と同じ表示でも電源収束処理を省略しません。

DBRの読み取り状態は楽観的に管理します。ON要求は`46`で確実にONへ揃えます。OFF要求では、連動テレビがOFFと確認できる場合だけ`46`→待機→`12`で確実にOFFへ正規化します。テレビがONの時に`46`を送るとHDMI切替などで視聴を乱す可能性があるため、その場合は従来どおり`12`だけを送ります。また、連動テレビが確定したON状態からOFFへ変化した場合は、既定5秒後に同じOFF正規化を自動実行します。Homebridge起動時にテレビが既にOFFの場合は実行しません。最初の5秒または`46`送信後の10秒の間にテレビがONへ戻った場合も、最後の`12`を中止します。重複する電源要求はDBRごとに直列化し、古い処理をキャンセルします。連動テレビ、TV電源ON連動、TV電源OFF連動、テレビOFF後の待機時間、DBR正規化待機時間は設定画面で変更できます。TCP 1048、SSDP、UPnP SOAPのON/OFF比較はいずれも完全に同一で、待機中もネットdeナビ／DLNAサーバーが稼働するため、安全な読み取り専用判定方法は確認できていません。詳細は[プロトコル資料](docs/PROTOCOL.ja.md)を参照してください。

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

Homebridgeの専用設定画面で必須項目を先に表示し、接続・電源・リモコン・入力設定を折りたたんで整理しています。`55J10X`モデルプロファイルを選び、IPアドレスとApp Connectのユーザー名/パスワードだけ入力すれば使えます。

```json
{
  "platform": "RegzaAppConnect",
  "debug": true,
  "devices": [
    {
      "name": "REGZA 55J10X",
      "model": "55J10X",
      "ip": "192.0.2.10",
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

REGZAがHTTP `200 OK`と本文`0`を返した直後にHomeKitの電源表示を更新します。さらに55J10Xでは、SSDPで`urn:schemas-upnp-org:device:MediaRenderer:1`だけを問い合わせます。実機検証では地デジ・BS・CS・HDMIのON中にMediaRendererが応答し、スタンバイでは応答しません。3回連続で応答がない場合だけOFFを確定するため、一時的なUDPパケット欠落による誤判定も抑えます。

待機中も残ることがある`MediaServer`は電源判定に使いません。SSDPは映像や音声を変更せず、消音プローブも不要です。SSDPに未対応のカスタム機種では、従来の可逆的な消音プローブをフォールバックとして利用できます。

55J10Xで確認済みの値：

| テレビ状態／入力 | `content_type` | HomeKit状態 |
|---|---|---|
| 放送視聴後のスタンバイ | `other` | MediaRenderer 3回未応答でOFF |
| 地デジ／BS／CS | `broadcast` | ON |
| HDMI | `external` | MediaRenderer応答でON |
| HDMI視聴後のスタンバイ | `external`が残る場合あり | MediaRenderer 3回未応答でOFF |

通常の定期取得は既定120秒間隔です。55J10Xでは最初にMediaRenderer限定のSSDP問い合わせを1回送り、ON応答があった場合だけ`GET /v2/remote/play/status`で入力を確認します。OFF中に4430へ接続を繰り返さないため、従来よりネットワーク負荷とタイムアウトを減らせます。旧設定の120秒未満の値は実行時に120秒へ引き上げられます。

MediaRenderer応答があればHDMIを含めてONと判定します。続けて取得した再生状態が`broadcast`なら地デジ・BS・CSを、`external`ならHDMIをHomeKitへ反映します。

既定の`operation`（操作連動）では、地デジ・BS・CS、音量、Muteの操作前に、最後のユーザー操作から30秒以上経過していれば電源ON専用キーを先に送ります。既にONでも電源を切らない専用キーなので、HDMI視聴後に純正リモコンでOFFにされた場合でも、次の対応操作を復帰と同時に実行できます。30秒は`operationPowerOnThresholdSeconds`で変更できます。

また、最後のユーザー操作から既定8時間経過した時点でもSSDPで状態を再確認します。音切れや消音表示は発生しません。8時間は設定画面の「状態を再確認する無操作時間」または`stalePowerProbeHours`で変更できます。SSDPに未対応のカスタム機種だけ、従来の消音プローブ設定が適用されます。

リモコンコードの一覧は[REGZAリモコンキー参考表](docs/REMOTE_KEYS.ja.md)にまとめています。「未確認」としたキーは提供された参考表からの転記であり、機種ごとの動作保証はありません。

## 他のREGZA機種を調査する

対応テレビでは、利用可能なv2 APIの一覧を次のURLから取得できる場合があります。

```text
https://TV_IP:4430/v2/remote/support
```

同梱の診断スクリプトではSSDP応答を一覧化できます。

```bash
node scripts/probe-ssdp.mjs 5000
```

DBRなどUPnP MediaServer対応機器は、IPアドレスだけ指定してデバイス定義、サービス定義、アクション名、電源状態候補を調査できます。

```bash
node scripts/probe-upnp-actions.mjs 192.168.1.151 5000
```

探索に応答しない場合は、SSDPログで確認したdescription URLを直接指定できます（ポート番号は環境により変わります）。

```bash
node scripts/probe-upnp-actions.mjs http://192.168.1.151:55247/dms/
```

さらに、引数なしの読み取り専用SOAPアクションだけを実行し、応答本文と比較用SHA-256を取得できます。

```bash
node scripts/probe-upnp-read-state.mjs http://192.168.1.151:55247/dms/
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

通常視聴中は、上／下でチャンネルUP／DOWN、右で「地デジ→BS→CS→地デジ」、左で逆順に切り替えます。HDMI表示中の最初の切替は地デジへ戻します。地デジ／BS／CS／HDMIの絶対選択は、HomeKitの既存の入力選択画面から利用できます。最初の決定で設定した番組表／メニューを開くと、矢印は通常の方向キー、決定は通常の決定キーへ切り替わります。

REGZAテレビでは、番組表／メニュー内で決定した後、矢印または決定が15秒間押されなければ「戻る」を自動送信し、画面を閉じてナビゲーションモードを解除します。追加操作があれば15秒を再計測します。次の決定では、戻るを手動で押さなくても再び番組表を開けます。レコーダーでは再生を中断しないよう「戻る」を自動送信せず、プラグイン内部のナビゲーション状態だけを解除します。

戻る、終了、電源OFF、または長い無操作タイムアウトでも解除します。純正リモコンでメニューを閉じたことはHomebridgeから直接検出できないため、これらのタイマーを補助として使用します。

## ローカルインストール

```bash
sudo npm install -g /path/to/homebridge-regza-app-connect-0.8.1.tgz
```

その後、Homebridge を再起動してください。
