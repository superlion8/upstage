import SwiftUI

/// Shoot Room main view
struct ShootRoomView: View {
    @StateObject private var viewModel = ShootRoomViewModel()
    
    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack {
                    // Background
                    Color(.systemGray6)
                        .ignoresSafeArea()
                    
                    VStack(spacing: 0) {
                        // Top bar - Asset selection
                        AssetSelectionBar(viewModel: viewModel)
                        
                        // Main canvas area
                        ZStack {
                            // Scene canvas
                            SceneCanvasView(viewModel: viewModel)
                            
                            // Light controller
                            if viewModel.showLightController {
                                LightControlView(
                                    position: $viewModel.lightPosition,
                                    direction: $viewModel.lightDirection,
                                    intensity: $viewModel.lightIntensity
                                )
                            }
                            
                            // Camera controller
                            if viewModel.showCameraController {
                                CameraControlView(
                                    position: $viewModel.cameraPosition,
                                    onSettingsTap: {
                                        viewModel.showCameraSettings = true
                                    }
                                )
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        
                        // Bottom controls
                        ControlsBar(viewModel: viewModel)
                    }
                }
            }
            .navigationTitle("拍摄室")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button {
                            viewModel.saveSession()
                        } label: {
                            Label("保存设置", systemImage: "square.and.arrow.down")
                        }
                        
                        Button {
                            viewModel.loadSession()
                        } label: {
                            Label("加载设置", systemImage: "folder")
                        }
                        
                        Button {
                            viewModel.resetToDefaults()
                        } label: {
                            Label("重置", systemImage: "arrow.counterclockwise")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $viewModel.showCameraSettings) {
                CameraSettingsSheet(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.showAssetPicker) {
                AssetPickerSheet(
                    type: viewModel.assetPickerType,
                    onSelect: viewModel.selectAsset
                )
            }
        }
    }
}

/// Asset selection bar at top
struct AssetSelectionBar: View {
    @ObservedObject var viewModel: ShootRoomViewModel
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                AssetSlot(
                    title: "模特",
                    icon: "person.fill",
                    imageUrl: viewModel.selectedModel?.url,
                    onTap: {
                        viewModel.assetPickerType = .model
                        viewModel.showAssetPicker = true
                    }
                )
                
                AssetSlot(
                    title: "商品",
                    icon: "tshirt.fill",
                    imageUrl: viewModel.selectedProduct?.url,
                    onTap: {
                        viewModel.assetPickerType = .product
                        viewModel.showAssetPicker = true
                    }
                )
                
                AssetSlot(
                    title: "场景",
                    icon: "photo.fill",
                    imageUrl: viewModel.selectedScene?.url,
                    onTap: {
                        viewModel.assetPickerType = .scene
                        viewModel.showAssetPicker = true
                    }
                )
            }
            .padding()
        }
        .background(Color(.systemBackground))
    }
}

/// Asset slot button
struct AssetSlot: View {
    let title: String
    let icon: String
    let imageUrl: String?
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray5))
                        .frame(width: 70, height: 70)
                    
                    if let url = imageUrl {
                        AsyncImage(url: URL(string: url)) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            ProgressView()
                        }
                        .frame(width: 70, height: 70)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        Image(systemName: icon)
                            .font(.title2)
                            .foregroundColor(.gray)
                    }
                }
                
                Text(title)
                    .font(.caption)
                    .foregroundColor(.primary)
            }
        }
    }
}

/// Bottom controls bar
struct ControlsBar: View {
    @ObservedObject var viewModel: ShootRoomViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            // Toggle buttons
            HStack(spacing: 24) {
                ControlToggle(
                    title: "光线",
                    icon: "sun.max.fill",
                    isOn: $viewModel.showLightController
                )
                
                ControlToggle(
                    title: "机位",
                    icon: "camera.fill",
                    isOn: $viewModel.showCameraController
                )
            }
            
            // Generate button
            Button {
                Task {
                    await viewModel.generate()
                }
            } label: {
                HStack {
                    if viewModel.isGenerating {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "sparkles")
                    }
                    Text(viewModel.isGenerating ? "生成中..." : "开始拍摄")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(viewModel.canGenerate ? Color.accentColor : Color.gray)
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!viewModel.canGenerate || viewModel.isGenerating)
        }
        .padding()
        .background(Color(.systemBackground))
    }
}

/// Control toggle button
struct ControlToggle: View {
    let title: String
    let icon: String
    @Binding var isOn: Bool
    
    var body: some View {
        Button {
            isOn.toggle()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.title2)
                Text(title)
                    .font(.caption)
            }
            .foregroundColor(isOn ? .accentColor : .gray)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(isOn ? Color.accentColor.opacity(0.15) : Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}

#Preview {
    ShootRoomView()
}



