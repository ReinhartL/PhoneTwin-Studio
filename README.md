# PhoneTwin Studio

PhoneTwin Studio 是一个运行在 macOS 或 Windows 浏览器中的 iPhone 3D 分身工作台。原生 iOS Sender 使用 Core Motion 发送姿态数据，并通过 ReplayKit Broadcast Upload Extension 发送手机屏幕。Relay 将两类数据转发给 Three.js 场景，最终把实时屏幕贴到手机模型上，并驱动模型跟随真机旋转。

macOS 版本位于 `main` 分支；Windows 版本位于 [`windows-edition`](https://github.com/ReinhartL/PhoneTwin-Studio/tree/windows-edition) 分支，使用 HTTP/WS 和 Windows 专用启动脚本。

本项目采用 [MIT License](LICENSE)，可以自由使用、修改和再发布。外部产品参考位图不包含在公开仓库中，也不属于 MIT 授权范围。

## 功能

- 程序化 iPhone 17 Pro Max Three.js 模型
- iPhone 姿态实时同步，支持一键校准
- ReplayKit 全屏投送，切换到其他 App 后仍可继续采集
- 30 FPS JPEG 屏幕流与 60 Hz 姿态流
- 动态背景、灯光预设、材质和设备颜色调节
- 自动旋转、视角切换和镜头导演动画
- 浏览器工作台录制，保存为 WebM

## 系统结构

```text
iPhone
  PhoneTwin Sender (Core Motion, 60 Hz JSON) ───────┐
  ReplayKit Extension (screen, 30 FPS JPEG) ───────┤
                                                    ▼
                                      Mac Relay :8788 (WS)
                                                    │
                                                    ▼
                                      Mac Relay :8787 (WSS)
                                                    │
                                                    ▼
                                  Vite / Three.js Workbench :5173
```

屏幕和姿态共享同一个 `sessionId`。Relay 的 8788 端口接收原生 iOS 数据，8787 端口供网页接收；Vite 将网页的 `/motion` 请求代理到 8787。

更详细的数据格式见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 项目目录

```text
PhoneTwin-Studio/
├── README.md
├── package.json                 # 前端、Relay、测试和构建命令
├── index.html
├── vite.config.mjs
├── web/
│   └── src/                     # React、Three.js 模型、动态背景和工作台 UI
├── relay/
│   └── server.mjs               # WSS/WS/SSE Relay
├── ios/
│   ├── PhoneTwinSender.xcodeproj
│   ├── PhoneTwinSender/         # iOS App 与共享传输代码
│   ├── PhoneTwinBroadcast/      # Broadcast Extension 配置与权限
│   └── project.yml              # 可选的 XcodeGen 工程定义
├── certs/                       # 本地生成的自签名证书，不提交私钥
├── scripts/                     # 开发证书生成脚本
├── assets/model-reference/      # 自备的产品参考图目录
└── docs/
    ├── ARCHITECTURE.md
    └── model-generation/        # img2threejs 建模过程、规格和评估文件
```

## 环境要求

- Node.js `20.19+` 或 `22.12+`
- npm
- Xcode 16 或更高版本
- iOS 17 或更高版本的真机
- Mac/Windows 和 iPhone 连接同一个局域网
- 建议使用 Apple Developer Program 账号。项目包含 App Group 和 Broadcast Extension，免费 Personal Team 可能无法签署全部能力。

当前开发环境验证版本为 Node.js 25、npm 11、Xcode 26 和 iOS 26；项目部署目标仍是 iOS 17。

## 快速启动

### 1. 查看 Mac 局域网 IP

Wi-Fi 通常使用：

```bash
ipconfig getifaddr en0
```

如果没有输出，可在“系统设置 → Wi-Fi → 详情 → TCP/IP”查看 IPv4 地址。下文用 `<MAC_IP>` 表示这个地址，例如 `192.168.0.105`。

### 2. 安装依赖

```bash
git clone https://github.com/ReinhartL/PhoneTwin-Studio.git
cd PhoneTwin-Studio
npm ci
```

### 3. 生成本地开发证书

公开仓库不会包含 TLS 私钥。使用上一步查到的 Mac IP 生成本地证书：

```bash
./scripts/generate-dev-cert.sh <MAC_IP>
```

生成的 `certs/dev-key.pem` 和 `certs/dev-cert.pem` 已被 Git 忽略，不会误传到仓库。

### 4. 启动前端

```bash
npm run dev
```

在 Mac 上打开：

```text
https://localhost:5173
```

项目使用刚生成的自签名开发证书。浏览器第一次访问时会提示证书不受信任，选择继续访问即可。证书包含 `localhost` 和你传给脚本的 Mac IP；在 Mac 本机仍建议使用 `https://localhost:5173`。

### 5. 启动 Relay

下面两种方法二选一，不要同时启动。

方法 A，使用网页按钮：

1. 保持 `npm run dev` 正在运行。
2. 打开工作台的 Model 页面。
3. 点击 `START MAC RELAY`。
4. 按钮显示 `MAC RELAY RUNNING · 8787 / 8788` 即成功。

方法 B，使用单独终端：

```bash
cd PhoneTwin-Studio
npm run relay
```

正常日志：

```text
Motion bridge wss://0.0.0.0:8787
Native sender bridge ws://0.0.0.0:8788
```

如果端口已被占用，先关闭旧的 Relay，再重新启动。可检查监听状态：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
lsof -nP -iTCP:8788 -sTCP:LISTEN
```

## 打包并安装 iOS App

### 1. 打开工程

```bash
open ios/PhoneTwinSender.xcodeproj
```

工程包含两个 target：

- `PhoneTwinSender`：主应用，管理 Relay 地址、权限、前台姿态采样和系统广播入口。
- `PhoneTwinBroadcast`：ReplayKit Broadcast Upload Extension，在后台采集屏幕和姿态。

### 2. 配置签名

在 Xcode 左侧选择蓝色的 `PhoneTwinSender` 工程，然后分别设置两个 target：

1. 打开 `Signing & Capabilities`。
2. 为 `PhoneTwinSender` 和 `PhoneTwinBroadcast` 选择同一个 Apple Developer Team。
3. 打开 `Automatically manage signing`。
4. 如果现有 Bundle Identifier 被占用，改成自己账号下的唯一标识，例如：

```text
com.yourname.PhoneTwinSender
com.yourname.PhoneTwinSender.Broadcast
```

5. 两个 target 都必须保留相同的 App Group：

```text
group.com.img2threejs.phonetwin
```

如果该 App Group 不属于你的开发者账号，需要在 Apple Developer 后台创建新的 App Group，并同时修改这些位置：

```text
ios/PhoneTwinSender/PhoneTwinSender.entitlements
ios/PhoneTwinBroadcast/PhoneTwinBroadcast.entitlements
ios/PhoneTwinSender/PhoneTwinSenderApp.swift
ios/PhoneTwinSender/BroadcastSampleHandler.swift
```

如果修改 Broadcast Extension 的 Bundle Identifier，还必须同步修改 `PhoneTwinSenderApp.swift` 中两处 `preferredExtension`，否则系统广播按钮会空白或点击无反应。

### 3. 准备真机

1. 用 USB 连接 iPhone 和 Mac。
2. 在 iPhone 上选择信任这台电脑。
3. 在 Xcode 顶部设备菜单中选择该 iPhone。
4. 如果系统要求，前往“设置 → 隐私与安全性 → 开发者模式”，开启后重启 iPhone。
5. Scheme 选择 `PhoneTwinSender`，不要选择 Broadcast Extension。

### 4. 构建并安装

点击 Xcode 左上角 Run，或按 `Command + R`。Xcode 会把主应用和 Broadcast Extension 一起安装到手机。

首次安装后如果无法启动，前往“设置 → 通用 → VPN 与设备管理”，信任对应开发者证书。使用正式 Apple Developer Program 签名时通常不需要这一步。

只验证代码编译、不签名安装时，可在项目根目录运行：

```bash
xcodebuild \
  -project ios/PhoneTwinSender.xcodeproj \
  -scheme PhoneTwinSender \
  -sdk iphoneos \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## 连接 iPhone 与工作台

建议按以下顺序操作：

1. 在 Mac 启动前端和 Relay。
2. 打开 iPhone 上的 `PhoneTwin Sender`。
3. 将 `Mac 工作台` 地址改为：

```text
ws://<MAC_IP>:8788/native
```

例如：

```text
ws://192.168.0.105:8788/native
```

4. 点击“准备 Sender 会话”。这一步会连接 Relay、保存地址、请求本地网络权限，并启动姿态采样。
5. 允许“本地网络”和“运动与健身”权限。齿轮按钮中可以重新检查权限。
6. 回到 Mac 工作台，点击 `CONNECT IPHONE SENDER`。
7. 在 iPhone 的“系统屏幕广播”区域点击广播图标。
8. 在系统弹窗中选择 `PhoneTwin Broadcast`，然后点击“开始广播”。
9. Mac 工作台出现帧计数后，手机屏幕会显示在 3D 模型上。
10. 正视手机屏幕，在工作台点击 `FACE THE SCREEN FORWARD, THEN CALIBRATE`，建立当前握持姿态的基准。

完成后可以切换到其他 iPhone App。ReplayKit Extension 会继续发送屏幕，但录制期间应保持手机解锁。

### 正面屏幕姿态校准

首次连接 Sender 后，必须建立一次正面基准，否则真机和 3D 模型的初始朝向可能不一致。

1. 正常握住 iPhone，让手机屏幕朝向自己，保持机身竖直，不要平放在桌面上。
2. 在 Mac 工作台确认姿态数据正在变化。
3. 保持手机不动，点击 `FACE THE SCREEN FORWARD, THEN CALIBRATE`。
4. 校准完成后，当前姿态会被设为模型的正面直立状态。转动真机，模型应从这个基准继续同步旋转。

校准只记录当前设备姿态与 Three.js 模型坐标系之间的相对偏移，不会修改 iPhone 发送的原始陀螺仪角度。更换握持方向、重新连接 Sender，或发现模型初始朝向偏离时，重新正视屏幕并点击一次校准即可。校准时如果手机平放、屏幕背向自己或仍在移动，得到的基准会不正确。

## 工作台操作

- 拖动模型：手动旋转视角。
- 鼠标滚轮：缩放模型。
- `CONNECT IPHONE SENDER`：开始或停止接收 iPhone 数据。
- `FACE THE SCREEN FORWARD, THEN CALIBRATE`：把当前正视手机屏幕的握持姿态设为模型的正面基准。
- `SPIN`：自动旋转模型。
- `RESET ACTIONS`：清除当前导演动画和自动运动，回到默认视角。
- `VIEW`：切换正面、背面、左右侧、顶部和三分之四视角。
- `CAMERA DIRECTOR`：播放推进、倾斜、俯冲和拉远动作。
- `LIGHT PRESETS`：切换灯光和动态背景方案。
- `DEVICE COLOR` 和材质参数：修改机身、玻璃和摄像头岛外观。

## 录制视频

1. 在 `HIGH-RES OUTPUT` 中保持 `INCLUDE WORKSPACE BACKGROUND` 开启，可录制整个工作台。
2. 点击 `START RECORDING`。
3. 浏览器弹出屏幕共享选择器时，选择当前 Chrome 标签页。
4. 完成后点击 `STOP & DOWNLOAD`。

录制文件固定保存为 WebM，以避免浏览器生成的 MP4 在系统播放器中只显示首帧。关闭 `INCLUDE WORKSPACE BACKGROUND` 后只录制 Three.js 模型画布。

## 生产构建

运行测试和前端构建：

```bash
npm test
npm run build
```

本地预览构建结果：

```bash
npm run preview
```

`vite preview` 不提供网页内的 Relay 启动接口，因此预览生产构建时需要另开终端执行：

```bash
npm run relay
```

## Windows 前端通道

[`windows-edition`](https://github.com/ReinhartL/PhoneTwin-Studio/tree/windows-edition) 分支提供 Windows 开发机的 HTTP/WS 接入方式，不需要生成或信任 macOS 自签名证书。它仍使用同一个 Relay 协议：iPhone Sender 发送姿态和 ReplayKit 屏幕帧，Windows 浏览器接收并渲染 Three.js 模型。

在 Windows 10/11 上安装 Node.js 20 LTS 或更高版本后，在 PowerShell 中运行：

```powershell
git clone -b windows-edition https://github.com/ReinhartL/PhoneTwin-Studio.git
cd PhoneTwin-Studio
.\scripts\start-windows.ps1
```

启动脚本会先检查依赖。第一次运行（或 `node_modules` 不完整）会自动执行 `npm ci`，无需手动安装；后续运行会直接启动工作台。脚本随后请求一次管理员权限，并在 Windows Defender 防火墙中创建 `PhoneTwin Studio LAN` 规则，仅允许专用网络上的 TCP `5173`、`8787`、`8788`。如果公司电脑不允许修改防火墙，可以跳过自动配置：

```powershell
.\scripts\start-windows.ps1 -SkipFirewall
```

然后在 Windows 浏览器打开：

```text
http://localhost:5173
```

查看 Windows 局域网地址：

```powershell
ipconfig
```

### 使用二维码连接 iPhone Sender

工作台启动后，在控制面板点击 `SHOW IPHONE SETUP QR`。用 iPhone `PhoneTwin Sender` 扫描二维码即可导入 Endpoint，无需手动输入。二维码使用 Windows 的默认局域网网卡地址（与 Vite 启动日志中的 `Network: http://<WINDOWS_IP>:5173` 一致），不会把 `localhost` 写入 iPhone 配置。

如果扫码不可用，也可以在 iPhone `PhoneTwin Sender` 中手动将 Endpoint 填为 Windows 的局域网 IPv4 地址：

```text
ws://<WINDOWS_IP>:8788/native
```

例如：

```text
ws://192.168.1.50:8788/native
```

首次运行需要在 Windows Defender 防火墙中允许 Node.js 访问专用网络，并确保端口 `5173`、`8787`、`8788` 可被局域网访问。打开工作台后点击 `START MAC RELAY` 仍可启动本地 Relay，按钮名称沿用现有 UI。

### Windows 屏幕流选择

推荐继续使用 iPhone App 内的 ReplayKit 广播：在系统屏幕广播列表中选择 `PhoneTwin Broadcast`，它会把 JPEG 屏幕帧发送到 Windows Relay。Windows 端不需要实现 Apple 私有投屏协议。

如果需要完全脱离 PhoneTwin Broadcast，也可以使用 AirPlay 接收器（例如 UxPlay 或其他 Windows AirPlay receiver）先把 iPhone 画面接入 Windows，再开发额外的采集适配层。AirPlay 接收器涉及 Bonjour/mDNS、Windows 防火墙和 Apple 私有协议，不属于当前分支的默认数据管道，也不能直接提供 Core Motion 姿态数据。

## 常见问题

### iPhone 无法连接 Relay

- 确认电脑和 iPhone 在同一个局域网，关闭会隔离设备的访客 Wi-Fi。
- Endpoint 必须使用电脑的局域网 IP，不能在 iPhone 上填写 `localhost`。
- 确认地址是 `ws://<电脑_IP>:8788/native`，不是 8787。
- 在 macOS 防火墙弹窗中允许 Node 接收入站连接。
- 确认 8788 正在监听，并查看 Relay 终端是否出现 `sender/receiver connected`。

### Mac 显示已连接，但没有姿态数据

- 在 iPhone App 中点击“准备 Sender 会话”。
- 打开齿轮页，确认“运动与健身”已授权。
- 在工作台点击 `CONNECT IPHONE SENDER`。
- 如果方向不正确，保持手机正视后重新校准，不要手动转换四元数角度。

### 姿态正常，但模型屏幕没有画面

- 姿态由主 App 发送，屏幕必须另外启动 ReplayKit 广播。
- 点击 iPhone App 内的广播图标，选择 `PhoneTwin Broadcast`。
- 确认系统状态栏显示正在广播，并保持 iPhone 解锁。
- 工作台屏幕状态应从 waiting 变为 JPEG frame count。

### 广播按钮空白或点击无反应

- 确认 `PhoneTwinBroadcast` 已作为 Extension 嵌入主 App。
- 确认 `preferredExtension` 与 Broadcast target 的 Bundle Identifier 完全一致。
- 确认两个 target 使用同一个 Team，并能正常签名。
- 在 Xcode 执行 `Product → Clean Build Folder` 后重新安装 App。

### Xcode 提示 Bundle 无效

检查两个 Info.plist 是否包含有效的 `CFBundleIdentifier` 和 `CFBundleExecutable`。当前工程使用：

```xml
<key>CFBundleIdentifier</key>
<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key>
<string>$(EXECUTABLE_NAME)</string>
```

然后执行 `Product → Clean Build Folder` 并重新构建。

### 浏览器提示证书错误

`certs/` 中生成的是本地开发证书，不适合公网部署。开发时可在 Mac 浏览器中访问 `https://localhost:5173` 并确认继续。Mac IP 变化后重新运行：

```bash
./scripts/generate-dev-cert.sh <MAC_IP>
```

生成后重启前端和 Relay。

## 端口表

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 5173 | HTTPS | Vite 工作台 |
| 8787 | HTTPS/WSS | 网页接收端、SSE 和 WebSocket Relay |
| 8788 | WS | 原生 iOS Sender 与 ReplayKit Extension |

## 安全与部署说明

- `certs/dev-key.pem` 是本地生成的开发私钥，已被 Git 忽略，不要部署到公网。
- iOS 开发通道 8788 使用明文 WS，目的是避免真机信任自签名证书。正式公网产品应改为受信任的 WSS 或 WebRTC DTLS/SRTP。
- iOS Info.plist 当前允许任意网络加载，仅适用于开发版本。
- Relay 会把同一 session 的屏幕和姿态转发给接收端，不包含用户账号或云端存储。

## 当前限制

- ReplayKit 屏幕流为约 30 FPS 的 JPEG，不是硬件编码视频流。
- iOS 锁屏后可能暂停广播。
- 网络质量差时会丢弃旧的未发送帧，以保持低延迟。
- 录制输出固定为 WebM；需要 MP4 时可在录制完成后使用视频工具转码。
- 当前模型由程序化 Three.js 几何生成，不是 Apple 官方 CAD 模型。
