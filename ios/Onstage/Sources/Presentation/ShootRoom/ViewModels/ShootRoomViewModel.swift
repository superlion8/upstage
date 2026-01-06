import SwiftUI

/// Shoot Room view model
@MainActor
final class ShootRoomViewModel: ObservableObject {
    // MARK: - Selected Assets
    
    @Published var selectedModel: Asset?
    @Published var selectedProduct: Asset?
    @Published var selectedScene: Asset?
    
    // MARK: - Lighting
    
    @Published var showLightController: Bool = true
    @Published var lightPosition: CGPoint = CGPoint(x: 0.3, y: 0.3)
    @Published var lightDirection: CGFloat = 45 // degrees
    @Published var lightIntensity: CGFloat = 70 // 0-100
    
    // MARK: - Camera
    
    @Published var showCameraController: Bool = true
    @Published var cameraPosition: CGPoint = CGPoint(x: 0.5, y: 0.8)
    @Published var cameraAngle: ShootRoomConfig.CameraConfig.CameraAngle = .eye
    @Published var focalLength: CGFloat = 50 // mm
    
    // MARK: - UI State
    
    @Published var showCameraSettings: Bool = false
    @Published var showAssetPicker: Bool = false
    @Published var assetPickerType: Asset.AssetType = .model
    @Published var isGenerating: Bool = false
    @Published var error: String?
    @Published var generatedImages: [GeneratedImage] = []
    
    // MARK: - Computed
    
    var canGenerate: Bool {
        selectedProduct != nil
    }
    
    var currentConfig: ShootRoomConfig {
        ShootRoomConfig(
            model: selectedModel.map { ShootRoomConfig.AssetReference(id: $0.id.uuidString, url: $0.url) },
            product: selectedProduct.map { ShootRoomConfig.AssetReference(id: $0.id.uuidString, url: $0.url) },
            scene: selectedScene.map { ShootRoomConfig.AssetReference(id: $0.id.uuidString, url: $0.url) },
            lighting: ShootRoomConfig.LightingConfig(
                position: ShootRoomConfig.Position(x: lightPosition.x, y: lightPosition.y),
                direction: lightDirection,
                intensity: lightIntensity
            ),
            camera: ShootRoomConfig.CameraConfig(
                position: ShootRoomConfig.Position(x: cameraPosition.x, y: cameraPosition.y),
                angle: cameraAngle,
                focalLength: focalLength
            )
        )
    }
    
    // MARK: - Actions
    
    func selectAsset(_ asset: Asset) {
        switch asset.type {
        case .model:
            selectedModel = asset
        case .product:
            selectedProduct = asset
        case .scene:
            selectedScene = asset
        default:
            break
        }
        showAssetPicker = false
    }
    
    func generate() async {
        guard canGenerate else { return }
        
        isGenerating = true
        error = nil
        
        do {
            // TODO: Call API
            try await Task.sleep(nanoseconds: 2_000_000_000) // Simulate
            
            // Mock result
            generatedImages = [
                GeneratedImage(id: "1", url: "https://placeholder.com/1"),
                GeneratedImage(id: "2", url: "https://placeholder.com/2"),
            ]
        } catch {
            self.error = error.localizedDescription
        }
        
        isGenerating = false
    }
    
    func saveSession() {
        // TODO: Save to API
    }
    
    func loadSession() {
        // TODO: Load from API
    }
    
    func resetToDefaults() {
        selectedModel = nil
        selectedProduct = nil
        selectedScene = nil
        lightPosition = CGPoint(x: 0.3, y: 0.3)
        lightDirection = 45
        lightIntensity = 70
        cameraPosition = CGPoint(x: 0.5, y: 0.8)
        cameraAngle = .eye
        focalLength = 50
    }
}



