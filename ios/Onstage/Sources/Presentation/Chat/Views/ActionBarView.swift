import SwiftUI

/// Action bar for quick actions
struct ActionBarView: View {
    let onAction: (ChatViewModel.ActionSheetType) -> Void
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ActionButton(
                    title: "换搭配",
                    icon: "tshirt",
                    color: .orange
                ) {
                    onAction(.changeOutfit)
                }
                
                ActionButton(
                    title: "换模特",
                    icon: "person.crop.rectangle",
                    color: .purple
                ) {
                    onAction(.changeModel)
                }
                
                ActionButton(
                    title: "复刻参考图",
                    icon: "photo.on.rectangle",
                    color: .blue
                ) {
                    onAction(.replicateReference)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color(.systemGray6).opacity(0.5))
    }
}

/// Individual action button
struct ActionButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.subheadline)
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            .foregroundColor(color)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
        }
    }
}

/// Action sheet view for structured input
struct ActionSheetView: View {
    let actionType: ChatViewModel.ActionSheetType
    let onSubmit: (MessageImage?, [MessageImage], String?) -> Void
    
    @Environment(\.dismiss) private var dismiss
    
    @State private var originalImage: MessageImage?
    @State private var additionalImages: [MessageImage] = []
    @State private var notes: String = ""
    @State private var showImagePicker: Bool = false
    @State private var pickingFor: ImagePickerTarget = .original
    
    enum ImagePickerTarget {
        case original
        case additional
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Instructions
                    instructionsSection
                    
                    // Original image
                    originalImageSection
                    
                    // Additional images
                    additionalImagesSection
                    
                    // Notes
                    notesSection
                }
                .padding()
            }
            .navigationTitle(actionType.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("取消") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("发送") {
                        onSubmit(originalImage, additionalImages, notes.isEmpty ? nil : notes)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(!canSubmit)
                }
            }
            .sheet(isPresented: $showImagePicker) {
                ImagePicker { data in
                    let image = MessageImage(
                        id: UUID(),
                        data: data,
                        mimeType: "image/jpeg",
                        label: pickingFor == .original ? "原图" : "图\(additionalImages.count + 1)"
                    )
                    
                    switch pickingFor {
                    case .original:
                        originalImage = image
                    case .additional:
                        additionalImages.append(image)
                    }
                }
            }
        }
    }
    
    // MARK: - Sections
    
    @ViewBuilder
    private var instructionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("操作说明")
                .font(.headline)
            
            Text(instructionText)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
    }
    
    @ViewBuilder
    private var originalImageSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(originalImageTitle)
                .font(.headline)
            
            if let image = originalImage, let uiImage = UIImage(data: image.data) {
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 200)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    
                    Button {
                        originalImage = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                    .offset(x: 8, y: -8)
                }
            } else {
                ImageUploadPlaceholder {
                    pickingFor = .original
                    showImagePicker = true
                }
            }
        }
    }
    
    @ViewBuilder
    private var additionalImagesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(additionalImagesTitle)
                .font(.headline)
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(additionalImages.enumerated()), id: \.element.id) { index, image in
                        if let uiImage = UIImage(data: image.data) {
                            ZStack(alignment: .topTrailing) {
                                Image(uiImage: uiImage)
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 100, height: 100)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                
                                Button {
                                    additionalImages.remove(at: index)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.white)
                                        .background(Circle().fill(Color.black.opacity(0.5)))
                                }
                                .offset(x: 6, y: -6)
                            }
                        }
                    }
                    
                    if additionalImages.count < maxAdditionalImages {
                        ImageUploadPlaceholder(size: 100) {
                            pickingFor = .additional
                            showImagePicker = true
                        }
                    }
                }
            }
        }
    }
    
    @ViewBuilder
    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("备注（可选）")
                .font(.headline)
            
            TextField("添加额外说明...", text: $notes, axis: .vertical)
                .lineLimit(2...4)
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
    
    // MARK: - Computed Properties
    
    private var instructionText: String {
        switch actionType {
        case .changeOutfit:
            return "上传原图和新的服装图片，AI 将保持模特和场景不变，替换服装。"
        case .changeModel:
            return "上传原图，可选上传模特参考图。AI 将保持服装和场景不变，替换模特。"
        case .replicateReference:
            return "上传商品图和参考图，AI 将参考目标图的构图和氛围生成新图片。"
        }
    }
    
    private var originalImageTitle: String {
        switch actionType {
        case .changeOutfit, .changeModel:
            return "原图"
        case .replicateReference:
            return "商品图"
        }
    }
    
    private var additionalImagesTitle: String {
        switch actionType {
        case .changeOutfit:
            return "新服装图片（1-3件）"
        case .changeModel:
            return "模特参考图（可选）"
        case .replicateReference:
            return "参考图"
        }
    }
    
    private var maxAdditionalImages: Int {
        switch actionType {
        case .changeOutfit:
            return 3
        case .changeModel, .replicateReference:
            return 1
        }
    }
    
    private var canSubmit: Bool {
        switch actionType {
        case .changeOutfit:
            return originalImage != nil && !additionalImages.isEmpty
        case .changeModel:
            return originalImage != nil
        case .replicateReference:
            return originalImage != nil && !additionalImages.isEmpty
        }
    }
}

/// Image upload placeholder
struct ImageUploadPlaceholder: View {
    var size: CGFloat = 150
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8]))
                .foregroundColor(.gray)
                .frame(width: size, height: size)
                .overlay {
                    VStack(spacing: 8) {
                        Image(systemName: "plus.circle")
                            .font(.title)
                        Text("添加图片")
                            .font(.caption)
                    }
                    .foregroundColor(.gray)
                }
        }
    }
}

#Preview {
    ActionBarView(onAction: { _ in })
}





