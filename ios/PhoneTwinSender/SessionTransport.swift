import Foundation

protocol SessionTransport: AnyObject {
    func connect()
    func send<T: Encodable>(_ value: T)
    func send(binary data: Data)
    func close()
}

final class WebSocketSessionTransport: SessionTransport {
    private let url: URL
    private let sessionId: String
    private lazy var socket = URLSession.shared.webSocketTask(with: url)
    private var isOpen = false
    private var pendingMessages: [URLSessionWebSocketTask.Message] = []
    private let lock = NSLock()
    private var sentBinaryCount = 0
    private var binarySendInFlight = false
    private var pendingBinary: Data?

    init(url: URL, sessionId: String) {
        self.url = url
        self.sessionId = sessionId
    }

    func connect() {
        socket.resume()
        // URLSessionWebSocketTask queues sends made immediately after resume
        // until its HTTP upgrade completes. The hello must go out first so the
        // relay can associate subsequent binary screen frames with this session.
        lock.lock()
        isOpen = true
        lock.unlock()
        sendNow(.string("{\"type\":\"hello\",\"role\":\"ios-sender\",\"sessionId\":\"\(sessionId)\",\"capabilities\":[\"motion\",\"replaykit-screen\"]}"))
        flush()
        receiveLoop()
    }

    func send<T: Encodable>(_ value: T) {
        guard let data = try? JSONEncoder().encode(value),
              let text = String(data: data, encoding: .utf8) else { return }
        queue(.string(text))
    }

    func send(binary data: Data) {
        lock.lock()
        sentBinaryCount += 1
        let count = sentBinaryCount
        lock.unlock()
        if count == 1 || count % 30 == 0 {
            print("PhoneTwin screen frame \(count), bytes=\(data.count)")
        }
        lock.lock()
        if !isOpen {
            pendingBinary = data
            lock.unlock()
            return
        }
        if binarySendInFlight {
            // Replace an unsent stale frame with the newest capture. This
            // prevents Wi-Fi hiccups from turning into seconds of video lag.
            pendingBinary = data
            lock.unlock()
            return
        }
        binarySendInFlight = true
        lock.unlock()
        sendBinaryNow(data)
    }

    func close() {
        lock.lock()
        pendingMessages.removeAll()
        pendingBinary = nil
        binarySendInFlight = false
        isOpen = false
        lock.unlock()
        socket.cancel(with: .goingAway, reason: nil)
    }

    private func queue(_ message: URLSessionWebSocketTask.Message) {
        lock.lock()
        if !isOpen {
            pendingMessages.append(message)
            lock.unlock()
            return
        }
        lock.unlock()
        sendNow(message)
    }

    private func flush() {
        lock.lock()
        isOpen = true
        let messages = pendingMessages
        pendingMessages.removeAll()
        lock.unlock()
        messages.forEach(sendNow)
    }

    private func sendNow(_ message: URLSessionWebSocketTask.Message) {
        socket.send(message) { error in
            if let error { print("PhoneTwin transport send failed: \(error.localizedDescription)") }
        }
    }

    private func sendBinaryNow(_ data: Data) {
        socket.send(.data(data)) { [weak self] error in
            if let error { print("PhoneTwin binary send failed: \(error.localizedDescription)") }
            guard let self else { return }
            self.lock.lock()
            self.binarySendInFlight = false
            let next = self.isOpen ? self.pendingBinary : nil
            self.pendingBinary = nil
            if next != nil { self.binarySendInFlight = true }
            self.lock.unlock()
            if let next { self.sendBinaryNow(next) }
        }
    }

    private func receiveLoop() {
        socket.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.flush()
            case .failure(let error):
                print("PhoneTwin transport receive failed: \(error.localizedDescription)")
            }
            self.receiveLoop()
        }
    }
}
