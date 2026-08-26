import Foundation

struct MotionPacket: Codable {
    let type: String = "orientation"
    let source: String
    let sessionId: String
    let timestamp: TimeInterval
    let alpha: Double
    let beta: Double
    let gamma: Double
    let quaternion: Quaternion

    struct Quaternion: Codable {
        let x: Double
        let y: Double
        let z: Double
        let w: Double
    }
}

struct SenderHello: Codable {
    let type = "hello"
    let role = "ios-sender"
    let sessionId: String
    let capabilities = ["motion", "replaykit-screen"]
}
