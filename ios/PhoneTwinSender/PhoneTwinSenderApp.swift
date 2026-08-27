import SwiftUI
import Combine
import ReplayKit
import UIKit
import CoreMotion
import AVFoundation

private let appGroup = "group.com.img2threejs.phonetwin"

@MainActor
final class SenderController: ObservableObject {
    @Published var running = false
    @Published var motionStatus = "等待运动与健身授权"
    @Published var motionSamples = 0
    @Published var localNetworkStatus = "尚未请求"
    @Published var endpoint: String
    @Published var configurationStatus = "请输入运行 PhoneTwin Studio 的电脑地址"
    private let sessionId = UUID().uuidString
    private var transport: WebSocketSessionTransport?
    private let motionManager = CMMotionManager()
    private let activityManager = CMMotionActivityManager()

    init() {
        endpoint = UserDefaults.standard.string(forKey: "phonetwin.endpoint")
            ?? UserDefaults(suiteName: "group.com.img2threejs.phonetwin")?.string(forKey: "endpoint")
            ?? ""
        if !endpoint.isEmpty {
            configurationStatus = "已保存上次使用的地址"
        }
    }

    var normalizedEndpoint: URL? {
        let value = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        let candidate: String
        if value.contains("://") {
            candidate = value
        } else if value.contains("/") || value.contains(":") {
            candidate = "ws://\(value)"
        } else {
            candidate = "ws://\(value):8788/native"
        }
        guard let url = URL(string: candidate),
              url.scheme == "ws" || url.scheme == "wss",
              url.host != nil,
              url.port == 8788 || url.port == nil else { return nil }
        return url
    }

    func applyScannedEndpoint(_ value: String) {
        endpoint = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalizedEndpoint != nil {
            endpoint = normalizedEndpoint!.absoluteString
            UserDefaults.standard.set(endpoint, forKey: "phonetwin.endpoint")
            UserDefaults(suiteName: appGroup)?.set(endpoint, forKey: "endpoint")
            configurationStatus = "二维码地址已保存"
        } else {
            configurationStatus = "二维码内容不是有效的 Sender 地址"
        }
    }

    func start() {
        guard let url = normalizedEndpoint else {
            configurationStatus = "地址格式无效，例如 192.168.1.100:8788/native"
            return
        }
        endpoint = url.absoluteString
        UserDefaults.standard.set(endpoint, forKey: "phonetwin.endpoint")
        UserDefaults(suiteName: "group.com.img2threejs.phonetwin")?.set(endpoint, forKey: "endpoint")
        UserDefaults(suiteName: "group.com.img2threejs.phonetwin")?.set(sessionId, forKey: "sessionId")
        let transport = WebSocketSessionTransport(url: url, sessionId: sessionId)
        self.transport = transport
        transport.connect()
        localNetworkStatus = "已请求本地网络连接"
        requestMotionPermission()
        // The broadcast extension later owns the continuous stream after the user
        // starts ReplayKit. This foreground stream exists to trigger authorization
        // and make the state visible before the broadcast picker is used.
        motionManager.deviceMotionUpdateInterval = 1.0 / 60.0
        motionManager.startDeviceMotionUpdates(
            using: .xArbitraryCorrectedZVertical,
            to: .main
        ) { [weak self] motion, error in
            guard let self else { return }
            if let error { self.motionStatus = "运动权限失败：\(error.localizedDescription)"; return }
            guard let motion else { return }
            let q = motion.attitude.quaternion
            self.motionSamples += 1
            self.motionStatus = "运动与健身已授权"
            transport.send(MotionPacket(
                source: "foreground",
                sessionId: self.sessionId,
                timestamp: Date().timeIntervalSince1970,
                alpha: motion.attitude.yaw,
                beta: motion.attitude.pitch,
                gamma: motion.attitude.roll,
                quaternion: .init(x: q.x, y: q.y, z: q.z, w: q.w)
            ))
        }
        running = true
    }

    func refreshPermissions() {
        switch CMMotionActivityManager.authorizationStatus() {
        case .authorized:
            motionStatus = "运动与健身已授权"
        case .denied, .restricted:
            motionStatus = "运动权限被拒绝"
        case .notDetermined:
            motionStatus = "尚未请求运动权限"
        @unknown default:
            motionStatus = "运动权限状态未知"
        }
    }

    private func requestMotionPermission() {
        guard CMMotionActivityManager.isActivityAvailable() else {
            motionStatus = "设备不支持 Core Motion"
            return
        }
        switch CMMotionActivityManager.authorizationStatus() {
        case .authorized:
            motionStatus = "运动与健身已授权"
        case .denied, .restricted:
            motionStatus = "运动权限被拒绝，请到 设置 → 隐私与安全性 → 运动与健身 开启"
        case .notDetermined:
            activityManager.startActivityUpdates(to: .main) { [weak self] activity in
                guard let self else { return }
                if activity != nil { self.motionStatus = "运动与健身已授权" }
            }
        @unknown default:
            motionStatus = "等待运动与健身授权"
        }
    }

    func stop() {
        transport?.close()
        motionManager.stopDeviceMotionUpdates()
        activityManager.stopActivityUpdates()
        transport = nil
        running = false
    }
}

@main
struct PhoneTwinSenderApp: App {
    @StateObject private var controller = SenderController()

    var body: some Scene {
        WindowGroup {
            SenderView(controller: controller)
        }
    }
}

struct SenderView: View {
    @ObservedObject var controller: SenderController
    @State private var scannerPresented = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                Text("把 iPhone 屏幕和姿态发送到 PhoneTwin Studio 工作台")
                    .foregroundStyle(.secondary)
                GroupBox("PhoneTwin Studio 工作台") {
                    TextField("电脑 IP:8788/native", text: $controller.endpoint)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textFieldStyle(.roundedBorder)
                    Text("例如：192.168.1.100:8788/native。手机和运行工作台的电脑必须连接同一个 Wi-Fi。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Label(controller.configurationStatus, systemImage: "network")
                        .font(.caption)
                        .foregroundStyle(controller.configurationStatus.contains("无效") ? .red : .secondary)
                    Button { scannerPresented = true } label: {
                        Label("扫描工作台二维码", systemImage: "qrcode.viewfinder")
                    }
                }
                Button(controller.running ? "结束 Sender 会话" : "准备 Sender 会话") {
                    controller.running ? controller.stop() : controller.start()
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)

                GroupBox("系统屏幕广播") {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("点击下方按钮，在系统弹窗中选择 PhoneTwin Broadcast。之后可以切换到任意 App，ReplayKit 会继续发送屏幕。")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        BroadcastPicker()
                            .frame(width: 64, height: 64)
                        Text("点击图标后选择 PhoneTwin Broadcast")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Label(controller.running ? "姿态通道已启动" : "等待连接", systemImage: controller.running ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(controller.running ? .green : .secondary)
                Label(controller.motionStatus, systemImage: "gyroscope")
                    .font(.footnote)
                    .foregroundStyle(controller.motionStatus.contains("已授权") ? .green : .secondary)
                if controller.motionSamples > 0 {
                    Text("已读取姿态样本：\(controller.motionSamples)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text("锁屏后 iOS 可能暂停广播；录制时请保持设备解锁。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
                .padding(24)
            }
            .navigationTitle("PhoneTwin Sender")
            .sheet(isPresented: $scannerPresented) {
                QRScannerView { value in
                    controller.applyScannedEndpoint(value)
                    scannerPresented = false
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        PermissionSettingsView(controller: controller)
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("权限设置")
                }
            }
        }
    }
}

struct PermissionSettingsView: View {
    @ObservedObject var controller: SenderController

    private var settingsURL: URL? {
        URL(string: UIApplication.openSettingsURLString)
    }

    var body: some View {
        List {
            Section("权限状态") {
                PermissionRow(
                    title: "运动与健身",
                    detail: controller.motionStatus,
                    icon: "gyroscope",
                    tint: controller.motionStatus.contains("已授权") ? .green : .orange
                )
                PermissionRow(
                    title: "本地网络",
                    detail: controller.localNetworkStatus,
                    icon: "network",
                    tint: controller.localNetworkStatus.contains("已请求") ? .green : .orange
                )
                PermissionRow(
                    title: "屏幕广播",
                    detail: "由 ReplayKit 系统广播选择器管理",
                    icon: "rectangle.inset.filled.and.person.filled",
                    tint: .blue
                )
            }

            Section("操作") {
                Button {
                    controller.refreshPermissions()
                } label: {
                    Label("重新检查权限", systemImage: "arrow.clockwise")
                }
                if let settingsURL {
                    Link(destination: settingsURL) {
                        Label("打开 iPhone 系统设置", systemImage: "gearshape")
                    }
                }
            }

            Section("使用说明") {
                Text("首次点击“准备 Sender 会话”时，系统会请求本地网络和运动与健身权限。")
                Text("屏幕采集需要在主页面点击系统广播按钮，并选择 PhoneTwin Broadcast。切换到其他 App 后，ReplayKit 继续采集。")
                Text("如果权限被拒绝，请在系统设置中打开：隐私与安全性 → 运动与健身，以及 PhoneTwin Sender 的本地网络访问。")
            }
        }
        .navigationTitle("权限设置")
        .onAppear { controller.refreshPermissions() }
    }
}

struct PermissionRow: View {
    let title: String
    let detail: String
    let icon: String
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct BroadcastPicker: UIViewRepresentable {
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        // Give ReplayKit a real UIKit frame. A zero-sized initial frame can
        // leave its private button unlaid-out when SwiftUI later applies a
        // frame modifier, which appears as an empty, non-clickable square.
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
        // This must match PhoneTwinBroadcast's PRODUCT_BUNDLE_IDENTIFIER in
        // native/project.yml exactly, otherwise iOS silently shows no picker.
        picker.preferredExtension = "com.img2threejs.PhoneTwinSender.Broadcast"
        picker.showsMicrophoneButton = false
        picker.isUserInteractionEnabled = true
        picker.tintColor = UIColor.label
        picker.backgroundColor = .clear
        return picker
    }

    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {
        uiView.preferredExtension = "com.img2threejs.PhoneTwinSender.Broadcast"
        uiView.showsMicrophoneButton = false
        uiView.isUserInteractionEnabled = true
        uiView.tintColor = UIColor.label
        uiView.setNeedsLayout()
        uiView.layoutIfNeeded()
    }
}

struct QRScannerView: UIViewControllerRepresentable {
    let onResult: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(onResult: onResult) }
    func makeUIViewController(context: Context) -> ScannerViewController {
        let controller = ScannerViewController()
        controller.onResult = onResult
        return controller
    }
    func updateUIViewController(_ uiViewController: ScannerViewController, context: Context) {}
    final class Coordinator {
        let onResult: (String) -> Void
        init(onResult: @escaping (String) -> Void) { self.onResult = onResult }
    }
}

final class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onResult: ((String) -> Void)?
    private let session = AVCaptureSession()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        session.stopRunning()
        onResult?(value)
    }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if session.isRunning { session.stopRunning() }
    }
}
