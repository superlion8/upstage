import SwiftUI

/// Assets view model
@MainActor
final class AssetsViewModel: ObservableObject {
    // MARK: - Types
    
    enum Category: CaseIterable {
        case all
        case models
        case products
        case scenes
        case generated
        
        var title: String {
            switch self {
            case .all: return "全部"
            case .models: return "模特"
            case .products: return "商品"
            case .scenes: return "场景"
            case .generated: return "生成"
            }
        }
        
        var assetType: Asset.AssetType? {
            switch self {
            case .all: return nil
            case .models: return .model
            case .products: return .product
            case .scenes: return .scene
            case .generated: return .generated
            }
        }
    }
    
    // MARK: - Published
    
    @Published var selectedCategory: Category = .all {
        didSet {
            Task {
                await loadAssets()
            }
        }
    }
    @Published var assets: [Asset] = []
    @Published var isLoading: Bool = false
    @Published var error: String?
    @Published var selectedAsset: Asset?
    @Published var showUploadSheet: Bool = false
    
    // MARK: - Private
    
    private let apiClient = APIClient.shared
    
    // MARK: - Methods
    
    func loadAssets() async {
        isLoading = true
        error = nil
        
        do {
            struct Response: Decodable {
                let success: Bool
                let assets: [Asset]
            }
            
            let response = try await apiClient.request(
                .listAssets(
                    type: selectedCategory.assetType,
                    tags: nil,
                    search: nil,
                    limit: 50,
                    offset: 0
                ),
                responseType: Response.self
            )
            
            assets = response.assets
        } catch {
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func uploadAsset(type: Asset.AssetType, data: Data, name: String?) {
        Task {
            // TODO: Upload to storage first, then create asset record
            await loadAssets()
        }
    }
    
    func deleteAsset(_ asset: Asset) async {
        do {
            struct Response: Decodable {
                let success: Bool
            }
            
            _ = try await apiClient.request(
                .deleteAsset(id: asset.id),
                responseType: Response.self
            )
            
            assets.removeAll { $0.id == asset.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}



