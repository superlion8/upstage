import SwiftUI

/// Assets library view
struct AssetsView: View {
    @StateObject private var viewModel = AssetsViewModel()
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Category tabs
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(AssetsViewModel.Category.allCases, id: \.self) { category in
                            CategoryTab(
                                title: category.title,
                                isSelected: viewModel.selectedCategory == category
                            ) {
                                viewModel.selectedCategory = category
                            }
                        }
                    }
                    .padding()
                }
                
                // Assets grid
                ScrollView {
                    if viewModel.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .padding(.top, 100)
                    } else if viewModel.assets.isEmpty {
                        EmptyStateView(
                            icon: "photo.on.rectangle.angled",
                            title: "暂无素材",
                            message: "上传或生成的素材将显示在这里"
                        )
                        .padding(.top, 100)
                    } else {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 12) {
                            ForEach(viewModel.assets) { asset in
                                AssetCard(asset: asset) {
                                    viewModel.selectedAsset = asset
                                }
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("素材库")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        viewModel.showUploadSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(item: $viewModel.selectedAsset) { asset in
                AssetDetailView(asset: asset)
            }
            .sheet(isPresented: $viewModel.showUploadSheet) {
                AssetUploadSheet(onUpload: viewModel.uploadAsset)
            }
            .refreshable {
                await viewModel.loadAssets()
            }
        }
        .task {
            await viewModel.loadAssets()
        }
    }
}

/// Category tab button
struct CategoryTab: View {
    let title: String
    let isSelected: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            Text(title)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .foregroundColor(isSelected ? .white : .primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(isSelected ? Color.accentColor : Color(.systemGray6))
                .clipShape(Capsule())
        }
    }
}

/// Asset card in grid
struct AssetCard: View {
    let asset: Asset
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 4) {
                AsyncImage(url: URL(string: asset.thumbnailUrl ?? asset.url)) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color(.systemGray5)
                        .overlay {
                            ProgressView()
                        }
                }
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                
                if let name = asset.name {
                    Text(name)
                        .font(.caption)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
            }
        }
    }
}

/// Empty state view
struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 50))
                .foregroundColor(.gray)
            
            Text(title)
                .font(.headline)
            
            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

/// Asset detail view
struct AssetDetailView: View {
    let asset: Asset
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Image
                    AsyncImage(url: URL(string: asset.url)) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    } placeholder: {
                        ProgressView()
                    }
                    .frame(maxHeight: 400)
                    
                    // Info
                    VStack(alignment: .leading, spacing: 12) {
                        if let name = asset.name {
                            LabeledContent("名称", value: name)
                        }
                        
                        LabeledContent("类型", value: asset.type.rawValue)
                        LabeledContent("创建时间", value: asset.createdAt.formatted())
                        
                        if let tags = asset.tags, !tags.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("标签")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                
                                FlowLayout(spacing: 8) {
                                    ForEach(tags, id: \.self) { tag in
                                        Text(tag)
                                            .font(.caption)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color(.systemGray6))
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("素材详情")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .bottomBar) {
                    HStack {
                        Button {
                            // Use in chat
                        } label: {
                            Label("使用", systemImage: "arrow.right.circle")
                        }
                        
                        Spacer()
                        
                        Button {
                            // Share
                        } label: {
                            Label("分享", systemImage: "square.and.arrow.up")
                        }
                        
                        Spacer()
                        
                        Button(role: .destructive) {
                            // Delete
                        } label: {
                            Label("删除", systemImage: "trash")
                        }
                    }
                }
            }
        }
    }
}

/// Asset upload sheet
struct AssetUploadSheet: View {
    let onUpload: (Asset.AssetType, Data, String?) -> Void
    
    @Environment(\.dismiss) private var dismiss
    @State private var selectedType: Asset.AssetType = .product
    @State private var selectedImage: Data?
    @State private var name: String = ""
    @State private var showImagePicker = false
    
    var body: some View {
        NavigationStack {
            Form {
                Section("类型") {
                    Picker("素材类型", selection: $selectedType) {
                        Text("商品").tag(Asset.AssetType.product)
                        Text("模特").tag(Asset.AssetType.model)
                        Text("场景").tag(Asset.AssetType.scene)
                        Text("参考").tag(Asset.AssetType.reference)
                    }
                    .pickerStyle(.segmented)
                }
                
                Section("图片") {
                    if let imageData = selectedImage, let uiImage = UIImage(data: imageData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxHeight: 200)
                            .onTapGesture {
                                showImagePicker = true
                            }
                    } else {
                        Button {
                            showImagePicker = true
                        } label: {
                            HStack {
                                Image(systemName: "photo.badge.plus")
                                Text("选择图片")
                            }
                        }
                    }
                }
                
                Section("名称（可选）") {
                    TextField("输入名称", text: $name)
                }
            }
            .navigationTitle("上传素材")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("取消") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("上传") {
                        if let data = selectedImage {
                            onUpload(selectedType, data, name.isEmpty ? nil : name)
                            dismiss()
                        }
                    }
                    .disabled(selectedImage == nil)
                }
            }
            .sheet(isPresented: $showImagePicker) {
                ImagePicker { data in
                    selectedImage = data
                }
            }
        }
    }
}

/// Simple flow layout for tags
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        return layout(sizes: sizes, containerWidth: proposal.width ?? .infinity).size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let offsets = layout(sizes: sizes, containerWidth: bounds.width).offsets
        
        for (subview, offset) in zip(subviews, offsets) {
            subview.place(at: CGPoint(x: bounds.minX + offset.x, y: bounds.minY + offset.y), proposal: .unspecified)
        }
    }
    
    private func layout(sizes: [CGSize], containerWidth: CGFloat) -> (offsets: [CGPoint], size: CGSize) {
        var offsets: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var maxWidth: CGFloat = 0
        
        for size in sizes {
            if currentX + size.width > containerWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            
            offsets.append(CGPoint(x: currentX, y: currentY))
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
            maxWidth = max(maxWidth, currentX)
        }
        
        return (offsets, CGSize(width: maxWidth, height: currentY + lineHeight))
    }
}

#Preview {
    AssetsView()
}



