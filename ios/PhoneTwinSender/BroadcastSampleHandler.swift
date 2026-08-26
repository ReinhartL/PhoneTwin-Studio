import ReplayKit
import VideoToolbox
import CoreImage

final class BroadcastSampleHandler: RPBroadcastSampleHandler {
    private var transport: SessionTransport?
    private var motion: MotionCapture?
    private let ciContext = CIContext(options: [.cacheIntermediates: false])
    private var lastFrameTime: TimeInterval = 0
    private var sampleCount = 0
    private var encodedCount = 0
    private let sessionId = UserDefaults(suiteName: "group.com.img2threejs.phonetwin")?.string(forKey: "sessionId") ?? UUID().uuidString

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        let endpoint = UserDefaults(suiteName: "group.com.img2threejs.phonetwin")?.string(forKey: "endpoint") ?? "ws://192.168.1.100:8788/native"
        print("PhoneTwin broadcastStarted endpoint=\(endpoint) session=\(sessionId)")
        guard let url = URL(string: endpoint) else { return }
        let transport = WebSocketSessionTransport(url: url, sessionId: sessionId)
        self.transport = transport
        transport.connect()
        let motion = MotionCapture(sessionId: sessionId, transport: transport)
        self.motion = motion
        motion.start()
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        sampleCount += 1
        if sampleCount == 1 || sampleCount % 30 == 0 {
            print("PhoneTwin processSampleBuffer count=\(sampleCount) type=\(sampleBufferType.rawValue)")
        }
        guard sampleBufferType == .video, let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let now = ProcessInfo.processInfo.systemUptime
        // ReplayKit may deliver 60 Hz samples. A 30 FPS JPEG stream is smooth
        // enough for interaction while staying within the extension's budget.
        guard now - lastFrameTime >= 1.0 / 30.0 else { return }
        lastFrameTime = now
        let image = CIImage(cvPixelBuffer: imageBuffer)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let jpeg = ciContext.jpegRepresentation(of: image, colorSpace: colorSpace, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.68]) else {
            print("PhoneTwin JPEG encoding failed")
            return
        }
        var envelope = Data("PTV1".utf8)
        var timestamp = UInt64(Date().timeIntervalSince1970 * 1_000).bigEndian
        withUnsafeBytes(of: &timestamp) { envelope.append(contentsOf: $0) }
        envelope.append(jpeg)
        encodedCount += 1
        if encodedCount == 1 || encodedCount % 30 == 0 {
            print("PhoneTwin sending screen frame=\(encodedCount) jpeg=\(jpeg.count) bytes")
        }
        transport?.send(binary: envelope)
    }

    override func broadcastFinished() {
        print("PhoneTwin broadcastFinished samples=\(sampleCount) frames=\(encodedCount)")
        motion?.stop()
        transport?.close()
    }
}
