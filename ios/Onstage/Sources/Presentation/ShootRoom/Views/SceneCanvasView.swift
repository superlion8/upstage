import SwiftUI

/// Scene canvas view - displays the model silhouette and scene
struct SceneCanvasView: View {
    @ObservedObject var viewModel: ShootRoomViewModel
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Scene background
                if let scene = viewModel.selectedScene {
                    AsyncImage(url: URL(string: scene.url)) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Color(.systemGray5)
                    }
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()
                } else {
                    // Default gradient background
                    LinearGradient(
                        colors: [Color(.systemGray5), Color(.systemGray4)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                
                // Model silhouette
                ModelSilhouetteView(
                    hasModel: viewModel.selectedModel != nil,
                    hasProduct: viewModel.selectedProduct != nil
                )
                .frame(width: geometry.size.width * 0.4)
                .position(
                    x: geometry.size.width / 2,
                    y: geometry.size.height / 2
                )
                
                // Focal length preview overlay
                FocalLengthOverlay(
                    focalLength: viewModel.focalLength,
                    size: geometry.size
                )
            }
        }
    }
}

/// Model silhouette placeholder
struct ModelSilhouetteView: View {
    let hasModel: Bool
    let hasProduct: Bool
    
    var body: some View {
        ZStack {
            // Body outline
            Image(systemName: "figure.stand")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .foregroundColor(hasModel ? .accentColor.opacity(0.3) : .gray.opacity(0.3))
            
            // Status indicators
            VStack {
                if !hasModel {
                    StatusBadge(text: "选择模特", color: .orange)
                }
                if !hasProduct {
                    StatusBadge(text: "选择商品", color: .blue)
                }
            }
        }
    }
}

/// Status badge
struct StatusBadge: View {
    let text: String
    let color: Color
    
    var body: some View {
        Text(text)
            .font(.caption)
            .fontWeight(.medium)
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color)
            .clipShape(Capsule())
    }
}

/// Focal length preview overlay
struct FocalLengthOverlay: View {
    let focalLength: CGFloat
    let size: CGSize
    
    var body: some View {
        let cropFactor = calculateCropFactor()
        
        Rectangle()
            .strokeBorder(Color.white.opacity(0.5), lineWidth: 2)
            .frame(
                width: size.width * cropFactor,
                height: size.height * cropFactor
            )
            .overlay(alignment: .topLeading) {
                Text("\(Int(focalLength))mm")
                    .font(.caption)
                    .foregroundColor(.white)
                    .padding(4)
                    .background(Color.black.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .padding(4)
            }
    }
    
    private func calculateCropFactor() -> CGFloat {
        // Simulate field of view based on focal length
        // Lower focal length = wider view = smaller crop factor
        let normalized = (focalLength - 16) / (200 - 16) // 16mm to 200mm range
        return 0.4 + (normalized * 0.5) // 40% to 90%
    }
}

/// Light control view
struct LightControlView: View {
    @Binding var position: CGPoint
    @Binding var direction: CGFloat
    @Binding var intensity: CGFloat
    
    @State private var isDragging = false
    
    var body: some View {
        GeometryReader { geometry in
            let lightX = position.x * geometry.size.width
            let lightY = position.y * geometry.size.height
            
            ZStack {
                // Light source indicator
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color.yellow.opacity(intensity / 100),
                                Color.orange.opacity(intensity / 200),
                                Color.clear
                            ],
                            center: .center,
                            startRadius: 0,
                            endRadius: 50
                        )
                    )
                    .frame(width: 100, height: 100)
                    .position(x: lightX, y: lightY)
                
                // Draggable handle
                Circle()
                    .fill(Color.yellow)
                    .frame(width: 30, height: 30)
                    .overlay {
                        Image(systemName: "sun.max.fill")
                            .foregroundColor(.white)
                    }
                    .shadow(radius: 4)
                    .position(x: lightX, y: lightY)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                isDragging = true
                                position = CGPoint(
                                    x: min(max(value.location.x / geometry.size.width, 0), 1),
                                    y: min(max(value.location.y / geometry.size.height, 0), 1)
                                )
                            }
                            .onEnded { _ in
                                isDragging = false
                            }
                    )
                
                // Direction indicator (arrow)
                let arrowLength: CGFloat = 40
                let arrowEndX = lightX + cos(direction * .pi / 180) * arrowLength
                let arrowEndY = lightY + sin(direction * .pi / 180) * arrowLength
                
                Path { path in
                    path.move(to: CGPoint(x: lightX, y: lightY))
                    path.addLine(to: CGPoint(x: arrowEndX, y: arrowEndY))
                }
                .stroke(Color.yellow, lineWidth: 2)
                
                // Rotation handle
                Circle()
                    .fill(Color.orange)
                    .frame(width: 16, height: 16)
                    .position(x: arrowEndX, y: arrowEndY)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                let dx = value.location.x - lightX
                                let dy = value.location.y - lightY
                                direction = atan2(dy, dx) * 180 / .pi
                            }
                    )
            }
        }
        .allowsHitTesting(true)
    }
}

/// Camera control view
struct CameraControlView: View {
    @Binding var position: CGPoint
    let onSettingsTap: () -> Void
    
    var body: some View {
        GeometryReader { geometry in
            let cameraX = position.x * geometry.size.width
            let cameraY = position.y * geometry.size.height
            
            ZStack {
                // Camera indicator
                VStack(spacing: 4) {
                    Image(systemName: "camera.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                    
                    Text("机位")
                        .font(.caption2)
                        .foregroundColor(.white)
                }
                .padding(8)
                .background(Color.accentColor)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .shadow(radius: 4)
                .position(x: cameraX, y: cameraY)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            position = CGPoint(
                                x: min(max(value.location.x / geometry.size.width, 0), 1),
                                y: min(max(value.location.y / geometry.size.height, 0.5), 1)
                            )
                        }
                )
                .onTapGesture {
                    onSettingsTap()
                }
                
                // View cone
                Path { path in
                    let coneWidth: CGFloat = 60
                    let coneHeight: CGFloat = 100
                    
                    path.move(to: CGPoint(x: cameraX, y: cameraY))
                    path.addLine(to: CGPoint(x: cameraX - coneWidth/2, y: cameraY - coneHeight))
                    path.addLine(to: CGPoint(x: cameraX + coneWidth/2, y: cameraY - coneHeight))
                    path.closeSubpath()
                }
                .fill(Color.accentColor.opacity(0.2))
            }
        }
    }
}

/// Camera settings sheet
struct CameraSettingsSheet: View {
    @ObservedObject var viewModel: ShootRoomViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            Form {
                Section("视角") {
                    Picker("拍摄角度", selection: $viewModel.cameraAngle) {
                        Text("俯拍").tag(ShootRoomConfig.CameraConfig.CameraAngle.high)
                        Text("平拍").tag(ShootRoomConfig.CameraConfig.CameraAngle.eye)
                        Text("仰拍").tag(ShootRoomConfig.CameraConfig.CameraAngle.low)
                    }
                    .pickerStyle(.segmented)
                }
                
                Section("焦距") {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("焦距")
                            Spacer()
                            Text("\(Int(viewModel.focalLength))mm")
                                .foregroundColor(.secondary)
                        }
                        
                        Slider(value: $viewModel.focalLength, in: 16...200, step: 1)
                        
                        HStack {
                            Text("广角")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Spacer()
                            Text("长焦")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                Section("光线强度") {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("强度")
                            Spacer()
                            Text("\(Int(viewModel.lightIntensity))%")
                                .foregroundColor(.secondary)
                        }
                        
                        Slider(value: $viewModel.lightIntensity, in: 0...100, step: 1)
                    }
                }
            }
            .navigationTitle("相机设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }
}

/// Asset picker sheet
struct AssetPickerSheet: View {
    let type: Asset.AssetType
    let onSelect: (Asset) -> Void
    
    @Environment(\.dismiss) private var dismiss
    @State private var assets: [Asset] = []
    @State private var presets: [Preset] = []
    
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 12) {
                    // User assets
                    ForEach(assets) { asset in
                        AssetGridItem(
                            url: asset.url,
                            name: asset.name
                        ) {
                            onSelect(asset)
                        }
                    }
                    
                    // System presets
                    ForEach(presets) { preset in
                        AssetGridItem(
                            url: preset.url,
                            name: preset.name
                        ) {
                            let asset = Asset(
                                id: preset.id,
                                type: type,
                                name: preset.name,
                                url: preset.url,
                                thumbnailUrl: preset.thumbnailUrl,
                                createdAt: Date(),
                                updatedAt: Date()
                            )
                            onSelect(asset)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(typeTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("取消") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            // Load assets
        }
    }
    
    private var typeTitle: String {
        switch type {
        case .model: return "选择模特"
        case .product: return "选择商品"
        case .scene: return "选择场景"
        default: return "选择素材"
        }
    }
}

/// Asset grid item
struct AssetGridItem: View {
    let url: String
    let name: String?
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 4) {
                AsyncImage(url: URL(string: url)) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color(.systemGray5)
                }
                .frame(height: 100)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                
                if let name = name {
                    Text(name)
                        .font(.caption)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
            }
        }
    }
}

#Preview {
    SceneCanvasView(viewModel: ShootRoomViewModel())
}





