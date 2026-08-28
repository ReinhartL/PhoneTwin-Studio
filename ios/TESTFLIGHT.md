# PhoneTwin Sender TestFlight 使用说明

## 适用对象

这条路径适合没有 Xcode、Apple Developer Team 或 App Group 开发权限的普通用户。无需下载 IPA，也无需把 iPhone 注册到开发者账号。

## 安装 TestFlight 版本

1. 在 iPhone 上从 App Store 安装 Apple 的 `TestFlight` App。
2. 打开邀请链接：<https://testflight.apple.com/join/EFpEgJfW>
3. 在 TestFlight 中点击“开始测试”，然后安装 `PhoneTwin Sender`。
4. 如果邀请失效、测试名额已满或构建已过期，以 TestFlight 显示的状态为准。

## 连接 PhoneTwin Studio

电脑和 iPhone 必须连接同一个 Wi-Fi。先在电脑启动 PhoneTwin Studio 和 Relay，再打开 Sender。

### 方式 A：扫描二维码

1. 在 PhoneTwin Studio 中点击 `SHOW IPHONE SETUP QR`。
2. 在 PhoneTwin Sender 中点击二维码扫描按钮。
3. 扫描工作台二维码，确认保存的地址包含 `:8788/native`。

### 方式 B：手动填写

在 Sender 的工作台地址中填写电脑的局域网地址：

```text
ws://<电脑局域网 IP>:8788/native
```

例如：

```text
ws://192.168.1.50:8788/native
```

不要填写 `localhost`，因为对 iPhone 来说 `localhost` 指向手机自身。Windows 和 macOS 都使用同样的 `ws://` Sender 地址；区别只在于工作台本身的启动方式和电脑防火墙设置。

## 开启数据和屏幕流

1. 在 Sender 中点击“准备 Sender 会话”。
2. 首次使用时允许“本地网络”和“运动与健身”。如果要扫描二维码，还要允许相机。
3. 在电脑工作台点击 `CONNECT IPHONE SENDER`，等待显示姿态连接。
4. 在 iPhone 中打开系统屏幕广播选择器，选择 `PhoneTwin Broadcast`，点击开始广播。
5. 等待工作台出现屏幕帧计数。姿态数据由 Sender 主 App 发送，屏幕数据由 ReplayKit Broadcast Extension 发送，Relay 使用同一个会话把二者转发到 Three.js 模型。
6. 广播期间可以切换到其他 iPhone App；为避免系统暂停采集，请保持手机解锁并避免结束屏幕广播。

## 正面屏幕校准

首次连接或更换握持方向后：

1. 让 iPhone 屏幕正对自己，机身保持竖直。
2. 保持手机静止，在工作台点击 `FACE THE SCREEN FORWARD, THEN CALIBRATE`。
3. 完成后再转动手机，模型会以这个姿态作为正面基准同步旋转。

校准只记录当前姿态与 Three.js 模型坐标系之间的相对基准，不会修改手机发送的原始传感器数据。平放手机、屏幕背向自己或移动中点击校准，都会造成错误的初始朝向。

## 源码与 TestFlight 的关系

仓库的 `ios/PhoneTwinSender` 是可审阅和可自行签名的 iOS 工程，`ios/PhoneTwinBroadcast` 是 ReplayKit Broadcast Upload Extension。TestFlight 版本由同一项目的发布构建产生，并经过 Apple 的签名和分发处理。

因此：

- 产品功能、Relay 地址格式和屏幕/姿态数据协议应保持一致。
- TestFlight 用户不需要自己的 Team、证书、Provisioning Profile 或 App Group。
- TestFlight 下载的是 Apple 处理后的分发构建，不是仓库里可以直接取得的 IPA 文件。
- 如果自行从源码构建，必须使用自己的 Team，并按根目录 README 配置 Bundle ID、App Group 和 Broadcast Extension 签名。

## 非商用分享声明

当前 TestFlight 邀请仅用于 PhoneTwin Studio 的非商用试用、技术演示、评估和反馈收集。请勿将测试版本用于收费服务、商业交付、未经授权的公开镜像或其他违反 Apple 条款、当地法律及第三方软件许可的用途。TestFlight 构建可能在 Apple 规定的测试期限后失效，项目维护者也可能随时关闭测试入口或替换构建。
