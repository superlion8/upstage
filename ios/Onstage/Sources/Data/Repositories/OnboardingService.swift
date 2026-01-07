import Foundation
import UIKit

/// Service for Brand Onboarding API
final class OnboardingService {
  static let shared = OnboardingService()
  private init() {}

  struct OnboardingRequest: Encodable {
    let webLink: String
    let insLink: String
    let videoUrl: String
    let productImage: ProductImage

    struct ProductImage: Encodable {
      let id: String
      let data: String
      let mimeType: String
    }
  }

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

    guard let imageData = productImage.jpegData(compressionQuality: 0.8) else {
      throw NSError(
        domain: "OnboardingService", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Failed to encode image"])
    }

    let base64String = imageData.base64EncodedString()
    let imageId = "product_\(UUID().uuidString.prefix(8))"

    let requestBody = OnboardingRequest(
      webLink: webLink,
      insLink: insLink,
      videoUrl: videoUrl,
      productImage: OnboardingRequest.ProductImage(
        id: imageId,
        data: base64String,
        mimeType: "image/jpeg"
      )
    )

    let url = URL(string: APIClient.shared.baseURL + "/onboarding")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    if let token = KeychainManager.shared.getAuthToken() {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    request.httpBody = try JSONEncoder.api.encode(requestBody)

    print("📤 [POST] \(url.absoluteString)")

    let (data, response) = try await URLSession.shared.data(for: request)

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
}
