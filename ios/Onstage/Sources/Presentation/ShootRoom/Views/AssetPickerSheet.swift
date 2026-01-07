import SwiftUI

/// Asset picker sheet for selecting models, products, scenes
struct AssetPickerSheet: View {
    let type: Asset.AssetType
    let onSelect: (Asset) -> Void
    
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    
    // Demo assets
    private var demoAssets: [Asset] {
        switch type {
        case .model:
            return [
                Asset(id: UUID(), type: .model, name: "女模特 - 时尚", url: "", thumbnailUrl: nil, tags: ["女性", "时尚"], createdAt: Date()),
                Asset(id: UUID(), type: .model, name: "女模特 - 优雅", url: "", thumbnailUrl: nil, tags: ["女性", "优雅"], createdAt: Date()),
                Asset(id: UUID(), type: .model, name: "男模特 - 商务", url: "", thumbnailUrl: nil, tags: ["男性", "商务"], createdAt: Date()),
                Asset(id: UUID(), type: .model, name: "男模特 - 休闲", url: "", thumbnailUrl: nil, tags: ["男性", "休闲"], createdAt: Date()),
            ]
        case .product:
            return [
                Asset(id: UUID(), type: .product, name: "上传商品图片", url: "", thumbnailUrl: nil, tags: [], createdAt: Date()),
            ]
        case .scene:
            return [
                Asset(id: UUID(), type: .scene, name: "纯白背景", url: "", thumbnailUrl: nil, tags: ["简约"], createdAt: Date()),
                Asset(id: UUID(), type: .scene, name: "时尚街拍", url: "", thumbnailUrl: nil, tags: ["街拍"], createdAt: Date()),
                Asset(id: UUID(), type: .scene, name: "咖啡厅", url: "", thumbnailUrl: nil, tags: ["室内"], createdAt: Date()),
                Asset(id: UUID(), type: .scene, name: "海边日落", url: "", thumbnailUrl: nil, tags: ["户外"], createdAt: Date()),
            ]
        default:
            return []
        }
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 12) {
                    ForEach(demoAssets) { asset in
                        AssetGridItem(asset: asset) {
                            onSelect(asset)
                            dismiss()
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(type.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "搜索\(type.displayName)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
            }
        }
    }
}

/// Asset grid item
struct AssetGridItem: View {
    let asset: Asset
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray5))
                        .aspectRatio(1, contentMode: .fit)
                    
                    if let url = asset.thumbnailUrl ?? (asset.url.isEmpty ? nil : asset.url) {
                        AsyncImage(url: URL(string: url)) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            ProgressView()
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        Image(systemName: asset.type.iconName)
                            .font(.title)
                            .foregroundColor(.gray)
                    }
                }
                
                Text(asset.name ?? asset.type.displayName)
                    .font(.caption)
                    .lineLimit(1)
                    .foregroundColor(.primary)
            }
        }
    }
}

extension Asset.AssetType {
    var displayName: String {
        switch self {
        case .model: return "模特"
        case .product: return "商品"
        case .scene: return "场景"
        case .reference: return "参考图"
        case .generated: return "生成图"
        }
    }
    
    var iconName: String {
        switch self {
        case .model: return "person.fill"
        case .product: return "tshirt.fill"
        case .scene: return "photo.fill"
        case .reference: return "photo.on.rectangle"
        case .generated: return "sparkles"
        }
    }
}

#Preview {
    AssetPickerSheet(type: .model) { _ in }
}




