import Foundation

/// API Client for backend communication using URLSession
final class APIClient {
  static let shared = APIClient()

  let baseURL: String  // Internal for SSEClient access
  private let session: URLSession

  private init() {
    // Railway backend URL
    self.baseURL = "https://upstage-production.up.railway.app/api"

    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 120  // 增加到 120 秒，图像生成需要更长时间
    self.session = URLSession(configuration: config)
  }

  // MARK: - Generic Request

  func request<T: Decodable>(
    _ endpoint: APIEndpoint,
    responseType: T.Type
  ) async throws -> T {
    guard var urlComponents = URLComponents(string: baseURL + endpoint.path) else {
      throw APIError.unknown
    }

    // Handle GET parameters (Query String)
    if let params = endpoint.parameters, endpoint.method == "GET" {
      urlComponents.queryItems = params.map { key, value in
        URLQueryItem(name: key, value: "\(value)")
      }
    }

    guard let url = urlComponents.url else {
      throw APIError.unknown
    }

    var request = URLRequest(url: url)
    request.httpMethod = endpoint.method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    // Add auth token
    if let token = KeychainManager.shared.getAuthToken() {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    // Add parameters for POST/PUT
    if let params = endpoint.parameters, ["POST", "PUT", "PATCH"].contains(endpoint.method) {
      request.httpBody = try JSONSerialization.data(withJSONObject: params)
    }

    // 🔵 LOG: Request
    print("📤 [\(endpoint.method)] \(url.absoluteString)")
    if let body = request.httpBody, let bodyStr = String(data: body, encoding: .utf8) {
      print("📤 Body: \(bodyStr.prefix(500))")
    }

    let (data, response) = try await session.data(for: request)

    guard let httpResponse = response as? HTTPURLResponse else {
      print("❌ No HTTP response")
      throw APIError.unknown
    }

    // 🔵 LOG: Response
    let responseStr = String(data: data, encoding: .utf8) ?? "nil"
    print("📥 Status: \(httpResponse.statusCode)")
    print("📥 Response: \(responseStr.prefix(1000))")

    guard (200...299).contains(httpResponse.statusCode) else {
      print("❌ HTTP Error: \(httpResponse.statusCode)")
      throw APIError.from(statusCode: httpResponse.statusCode)
    }

    do {
      return try JSONDecoder.api.decode(T.self, from: data)
    } catch {
      print("❌ Decode Error: \(error)")
      print("❌ Expected Type: \(T.self)")
      throw error
    }
  }

  // MARK: - Multipart Upload

  func upload<T: Decodable>(
    _ endpoint: APIEndpoint,
    files: [(data: Data, name: String, fileName: String, mimeType: String)],
    responseType: T.Type
  ) async throws -> T {
    let url = URL(string: baseURL + endpoint.path)!
    var request = URLRequest(url: url)
    request.httpMethod = endpoint.method

    let boundary = UUID().uuidString
    request.setValue(
      "multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

    if let token = KeychainManager.shared.getAuthToken() {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    var body = Data()

    // Add files
    for file in files {
      body.append("--\(boundary)\r\n".data(using: .utf8)!)
      body.append(
        "Content-Disposition: form-data; name=\"\(file.name)\"; filename=\"\(file.fileName)\"\r\n"
          .data(using: .utf8)!)
      body.append("Content-Type: \(file.mimeType)\r\n\r\n".data(using: .utf8)!)
      body.append(file.data)
      body.append("\r\n".data(using: .utf8)!)
    }

    // Add parameters
    if let params = endpoint.parameters {
      for (key, value) in params {
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(value)\r\n".data(using: .utf8)!)
      }
    }

    body.append("--\(boundary)--\r\n".data(using: .utf8)!)
    request.httpBody = body

    let (data, response) = try await session.data(for: request)

    guard let httpResponse = response as? HTTPURLResponse,
      (200...299).contains(httpResponse.statusCode)
    else {
      throw APIError.from(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
    }

    return try JSONDecoder.api.decode(T.self, from: data)
  }

  // MARK: - Upload Images

  /// Upload images and get their URLs
  /// Call this before sending chat messages to avoid base64-in-JSON issues
  func uploadImages(_ images: [MessageImage]) async throws -> [String] {
    struct UploadResponse: Decodable {
      let success: Bool
      let urls: [String]
    }

    let files = images.enumerated().map { i, img in
      (data: img.data, name: "files", fileName: "image_\(i).jpg", mimeType: img.mimeType)
    }

    let response = try await upload(
      .uploadImages(images: images),
      files: files,
      responseType: UploadResponse.self
    )

    return response.urls
  }
}

// MARK: - JSON Decoder Extension

extension JSONDecoder {
  static let api: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }()
}

// MARK: - JSON Encoder Extension

extension JSONEncoder {
  static let api: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }()
}
