# homebridge-regza-app-connect v0.1.7

REGZA App Connect / TV Web Interface を使って、HomeKit からREGZAを操作する Homebridge Dynamic Platform Plugin です。

## v0.1.7 のポイント

この版では、55J10Xで確認した HTTPS API を標準にしました。

```text
https://<REGZA-IP>:4430/remote/remote.htm?key=40BF12
```

確認済みの挙動:

- `:4430` は REGZA の `TV Web Interface` HTTPS サーバー
- Digest 認証が必要
- 自己署名/Private CA証明書なので、標準で許可
- `key=40BF12` は電源トグル
- 戻り値 `0` は成功

## 設定例

```json
{
  "platform": "RegzaAppConnect",
  "debug": true,
  "devices": [
    {
      "name": "REGZA-55J10X",
      "ip": "192.168.100.150",
      "mac": "5C:93:A2:DB:3C:E1",
      "username": "saki",
      "password": "saki",
      "protocol": "https",
      "port": 4430,
      "allowSelfSignedCertificate": true,
      "powerKey": "40BF12",
      "enableWakeOnLan": false
    }
  ]
}
```

## インストール

```bash
npm install -g /path/to/homebridge-regza-app-connect-0.1.7
```

またはzipを展開して、そのフォルダを指定してください。

```bash
unzip homebridge-regza-app-connect-0.1.7.zip
npm install -g ./homebridge-regza-app-connect-0.1.7
```

## メモ

旧版では Wake on LAN を試していましたが、55J10Xでは HTTPS `remote.htm?key=40BF12` がスタンバイ状態からの電源トグルとして動作したため、v0.1.7ではWOLを標準無効にしています。

WOLも併用したい場合だけ、`enableWakeOnLan: true` を指定してください。
