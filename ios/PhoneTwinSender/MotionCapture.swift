import CoreMotion
import Foundation

final class MotionCapture {
    private let manager = CMMotionManager()
    private let sessionId: String
    private weak var transport: SessionTransport?

    init(sessionId: String, transport: SessionTransport) {
        self.sessionId = sessionId
        self.transport = transport
    }

    func start() {
        guard manager.isDeviceMotionAvailable else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        manager.startDeviceMotionUpdates(using: .xArbitraryCorrectedZVertical, to: .main) { [weak self] motion, _ in
            guard let self, let motion else { return }
            let q = motion.attitude.quaternion
            let packet = MotionPacket(
                source: "broadcast",
                sessionId: self.sessionId,
                timestamp: Date().timeIntervalSince1970,
                alpha: motion.attitude.yaw,
                beta: motion.attitude.pitch,
                gamma: motion.attitude.roll,
                quaternion: .init(x: q.x, y: q.y, z: q.z, w: q.w)
            )
            self.transport?.send(packet)
        }
    }

    func stop() { manager.stopDeviceMotionUpdates() }
}
