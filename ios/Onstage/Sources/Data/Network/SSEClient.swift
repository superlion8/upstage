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

// MARK: - Notification Names
extension Notification.Name {
  static let userNeedsReAuth = Notification.Name("userNeedsReAuth")
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
    config.timeoutIntervalForRequest = 300  // 5 minutes for long-running streams
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

    // Build request - baseURL already includes /api
    guard let url = URL(string: "\(APIClient.shared.baseURL)/chat/stream") else {
      onError(
        NSError(domain: "SSEClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
      )
      return
    }

    // Upload images first if needed, then start SSE stream
    Task {
      do {
        var imageUrls: [String]? = nil

        // Step 1: Upload images if present
        if let images = images, !images.isEmpty {
          print("📡 SSE: Uploading \(images.count) images first...")
          imageUrls = try await APIClient.shared.uploadImages(images)
          print("📡 SSE: Images uploaded, got \(imageUrls?.count ?? 0) URLs")
        }

        // Step 2: Build and send SSE request with URLs instead of base64
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        // Build body with URLs (not base64)
        var body: [String: Any] = [:]
        if let conversationId = conversationId {
          body["conversation_id"] = conversationId.uuidString
        }
        if let text = text {
          body["text"] = text
        }
        if let urls = imageUrls {
          body["image_urls"] = urls  // New: send URLs, not base64
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        self.task = self.session.dataTask(with: request)
        self.task?.resume()

        print("📡 SSE: Started streaming...")

      } catch {
        onError(error)
      }
    }
  }

  /// Cancel the stream
  func cancel() {
    task?.cancel()
    task = nil
    print("📡 SSE: Cancelled")
  }

  // MARK: - URLSessionDataDelegate

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let httpResponse = response as? HTTPURLResponse else {
      completionHandler(.allow)
      return
    }

    // Check for 401 Unauthorized - user may need to re-authenticate
    if httpResponse.statusCode == 401 {
      print("📡 SSE: Received 401 - User needs re-authentication")
      // Post notification to trigger re-auth
      NotificationCenter.default.post(name: .userNeedsReAuth, object: nil)
      completionHandler(.cancel)
      onError?(
        NSError(domain: "SSEClient", code: 401, userInfo: [NSLocalizedDescriptionKey: "请重新登录"]))
      return
    }

    completionHandler(.allow)
  }

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
