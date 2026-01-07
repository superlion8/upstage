import Foundation

/// SSE Event types from backend
enum SSEEventType: String {
    case thinking
    case toolStart = "tool_start"
    case toolResult = "tool_result"
    case textDelta = "text_delta"
    case image
    case conversation
    case done
    case error
}

/// SSE Event data structures
struct SSEEvent {
    let type: SSEEventType
    let data: [String: Any]
    
    // Convenience accessors
    var thinkingContent: String? {
        data["content"] as? String
    }
    
    var toolName: String? {
        data["tool"] as? String
    }
    
    var toolDisplayName: String? {
        data["displayName"] as? String
    }
    
    var textDelta: String? {
        data["delta"] as? String
    }
    
    var imageUrl: String? {
        data["url"] as? String
    }
    
    var conversationId: String? {
        data["conversationId"] as? String
    }
    
    var messageId: String? {
        data["messageId"] as? String
    }
    
    var errorMessage: String? {
        data["message"] as? String
    }
    
    var toolResult: [String: Any]? {
        data["result"] as? [String: Any]
    }
    
    var arguments: [String: Any]? {
        data["arguments"] as? [String: Any]
    }
}

/// SSE Client for streaming chat responses
class SSEClient: NSObject, URLSessionDataDelegate {
    private var session: URLSession!
    private var task: URLSessionDataTask?
    private var buffer = ""
    
    private var onEvent: ((SSEEvent) -> Void)?
    private var onComplete: (() -> Void)?
    private var onError: ((Error) -> Void)?
    
    override init() {
        super.init()
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300 // 5 minutes for long-running streams
        config.timeoutIntervalForResource = 300
        session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }
    
    /// Start streaming from the chat endpoint
    func stream(
        text: String?,
        images: [MessageImage]?,
        conversationId: UUID?,
        token: String,
        onEvent: @escaping (SSEEvent) -> Void,
        onComplete: @escaping () -> Void,
        onError: @escaping (Error) -> Void
    ) {
        self.onEvent = onEvent
        self.onComplete = onComplete
        self.onError = onError
        self.buffer = ""
        
        // Build request
        guard let url = URL(string: "\(APIClient.shared.baseURL)/api/chat/stream") else {
            onError(NSError(domain: "SSEClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        // Build body
        var body: [String: Any] = [:]
        if let conversationId = conversationId {
            body["conversation_id"] = conversationId.uuidString
        }
        if let text = text {
            body["text"] = text
        }
        if let images = images {
            body["images"] = images.map { img in
                [
                    "id": img.id.uuidString,
                    "data": img.base64String,
                    "mime_type": img.mimeType
                ]
            }
        }
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            onError(error)
            return
        }
        
        task = session.dataTask(with: request)
        task?.resume()
        
        print("📡 SSE: Started streaming...")
    }
    
    /// Cancel the stream
    func cancel() {
        task?.cancel()
        task = nil
        print("📡 SSE: Cancelled")
    }
    
    // MARK: - URLSessionDataDelegate
    
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        
        buffer += text
        processBuffer()
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            // Ignore cancellation errors
            if (error as NSError).code == NSURLErrorCancelled {
                return
            }
            print("📡 SSE Error: \(error.localizedDescription)")
            onError?(error)
        } else {
            print("📡 SSE: Stream completed")
            onComplete?()
        }
    }
    
    // MARK: - Private
    
    private func processBuffer() {
        // SSE format: "event: <type>\ndata: <json>\n\n"
        let events = buffer.components(separatedBy: "\n\n")
        
        // Keep the last incomplete chunk in buffer
        if !buffer.hasSuffix("\n\n") {
            buffer = events.last ?? ""
        } else {
            buffer = ""
        }
        
        // Process complete events
        for event in events.dropLast(buffer.isEmpty ? 0 : 1) {
            if event.isEmpty { continue }
            parseEvent(event)
        }
    }
    
    private func parseEvent(_ eventString: String) {
        var eventType: String?
        var eventData: String?
        
        for line in eventString.components(separatedBy: "\n") {
            if line.hasPrefix("event: ") {
                eventType = String(line.dropFirst(7))
            } else if line.hasPrefix("data: ") {
                eventData = String(line.dropFirst(6))
            }
        }
        
        guard let type = eventType,
              let sseType = SSEEventType(rawValue: type),
              let dataString = eventData,
              let data = try? JSONSerialization.jsonObject(with: Data(dataString.utf8)) as? [String: Any]
        else {
            return
        }
        
        let event = SSEEvent(type: sseType, data: data)
        print("📡 SSE Event: \(type)")
        onEvent?(event)
    }
}

