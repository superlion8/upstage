import Foundation
import UIKit

/// Service for Brand Onboarding API
final class OnboardingService {
  static let shared = OnboardingService()
  private init() {}

  struct OnboardingResponse: Decodable {
    let success: Bool
    let data: OnboardingData?
    let message: String?

    struct OnboardingData: Decodable {
      let brandKeywords: String
      let webAnalysis: WebAnalysis
      let insAnalysis: InsAnalysis
      let videoAnalysis: VideoAnalysis
      let generatedAssets: GeneratedAssets
    }

    struct WebAnalysis: Decodable {
      let modelImageRef: String
      let productImageRef: String
    }

    struct InsAnalysis: Decodable {
      let finalImageRef: String
    }

    struct VideoAnalysis: Decodable {
      let videoPrompt: String
    }

    struct GeneratedAssets: Decodable {
      let webStyleImages: [GeneratedAsset]
      let insStyleImages: [GeneratedAsset]
      let productDisplayImages: [GeneratedAsset]
      let videoPlaceholder: GeneratedAsset?
    }

    struct GeneratedAsset: Decodable, Identifiable {
      let id: String
      let url: String
    }
  }

  func runOnboarding(
    webLink: String,
    insLink: String,
    videoUrl: String,
    productImage: UIImage
  ) async throws -> OnboardingResponse.OnboardingData {

    guard let resizedImage = resizeImage(productImage, targetSize: CGSize(width: 800, height: 800)),
      let imageData = resizedImage.jpegData(compressionQuality: 0.6)
    else {
      throw NSError(
        domain: "OnboardingService", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Failed to encode image"])
    }

    let url = URL(string: APIClient.shared.baseURL + "/onboarding")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"

    // Use multipart form data instead of base64 JSON
    let boundary = UUID().uuidString
    request.setValue(
      "multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

    if let token = KeychainManager.shared.getAuthToken() {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    var body = Data()

    // Add text fields
    body.append(multipartField(name: "webLink", value: webLink, boundary: boundary))
    body.append(multipartField(name: "insLink", value: insLink, boundary: boundary))
    body.append(multipartField(name: "videoUrl", value: videoUrl, boundary: boundary))

    // Add image file
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append(
      "Content-Disposition: form-data; name=\"productImage\"; filename=\"product.jpg\"\r\n"
        .data(using: .utf8)!)
    body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
    body.append(imageData)
    body.append("\r\n".data(using: .utf8)!)

    // End boundary
    body.append("--\(boundary)--\r\n".data(using: .utf8)!)

    request.httpBody = body

    print("📤 [POST] \(url.absoluteString)")
    print("📤 Image size: \(imageData.count / 1024) KB")

    // Use custom session with longer timeout
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 300
    config.timeoutIntervalForResource = 300
    let session = URLSession(configuration: config)

    let (data, response) = try await session.data(for: request)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw NSError(
        domain: "OnboardingService", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
    }

    print("📥 Status: \(httpResponse.statusCode)")

    guard (200...299).contains(httpResponse.statusCode) else {
      let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown error"
      throw NSError(
        domain: "OnboardingService", code: httpResponse.statusCode,
        userInfo: [NSLocalizedDescriptionKey: errorMsg])
    }

    let decoded = try JSONDecoder.api.decode(OnboardingResponse.self, from: data)

    guard decoded.success, let resultData = decoded.data else {
      throw NSError(
        domain: "OnboardingService", code: 3,
        userInfo: [NSLocalizedDescriptionKey: decoded.message ?? "Unknown error"])
    }

    return resultData
  }

  private func multipartField(name: String, value: String, boundary: String) -> Data {
    var data = Data()
    data.append("--\(boundary)\r\n".data(using: .utf8)!)
    data.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
    data.append("\(value)\r\n".data(using: .utf8)!)
    return data
  }

  private func resizeImage(_ image: UIImage, targetSize: CGSize) -> UIImage? {
    let size = image.size

    let widthRatio = targetSize.width / size.width
    let heightRatio = targetSize.height / size.height

    // Use the smaller ratio to ensure the image fits within targetSize while maintaining aspect ratio
    let ratio = min(widthRatio, heightRatio)
    if ratio >= 1.0 { return image }  // No need to upscale

    let newSize = CGSize(width: size.width * ratio, height: size.height * ratio)
    let rect = CGRect(origin: .zero, size: newSize)

    UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
    image.draw(in: rect)
    let newImage = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()

    return newImage
  }
}
