import SwiftUI

/// Shoot Room main view
struct ShootRoomView: View {
  @StateObject private var viewModel = ShootRoomViewModel()

  var body: some View {
    NavigationStack {
      ZStack {
        // Global Background
        Theme.Colors.bg0.ignoresSafeArea()

        // 1. Canvas Layer (Full Screen)
        SceneCanvasView(viewModel: viewModel)
          .edgesIgnoringSafeArea([.horizontal, .bottom])

        // 2. Interface Layer
        VStack(spacing: 0) {
          // Header
          HStack {
            Text("Studio")
              .font(Theme.Typography.title)
              .foregroundColor(Theme.Colors.textPrimary)

            Spacer()

            Menu {
              Button {
                viewModel.saveSession()
              } label: {
                Label("Save Session", systemImage: "square.and.arrow.down")
              }

              Button {
                viewModel.loadSession()
              } label: {
                Label("Load Session", systemImage: "folder")
              }

              Button(role: .destructive) {
                viewModel.resetToDefaults()
              } label: {
                Label("Reset", systemImage: "arrow.counterclockwise")
              }
            } label: {
              Image(systemName: "slider.horizontal.3")
                .font(.system(size: 20))
                .foregroundColor(Theme.Colors.textSecondary)
                .frame(width: 40, height: 40)
                .background(Theme.Colors.surface2)
                .clipShape(Circle())
            }
          }
          .padding(.horizontal, Theme.Layout.sidePadding)
          .padding(.top, 8)
          .background(
            LinearGradient(
              colors: [Theme.Colors.bg0, Theme.Colors.bg0.opacity(0)], startPoint: .top,
              endPoint: .bottom
            )
            .frame(height: 100)
            .edgesIgnoringSafeArea(.top)
          )

          // Asset Strip (Floating)
          AssetStrip(viewModel: viewModel)
            .padding(.top, 8)

          Spacer()

          // Control Dock (Floating)
          ControlDock(viewModel: viewModel)
            .padding(.bottom, 24)
        }
      }
      .navigationBarHidden(true)
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

/// Asset selection bar (Floating)
struct AssetStrip: View {
  @ObservedObject var viewModel: ShootRoomViewModel

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 16) {
        AssetSlot(
          title: "Model",
          icon: "person.fill",
          imageUrl: viewModel.selectedModel?.url,
          isActive: viewModel.assetPickerType == .model
        ) {
          viewModel.assetPickerType = .model
          viewModel.showAssetPicker = true
        }

        AssetSlot(
          title: "Product",
          icon: "tshirt.fill",
          imageUrl: viewModel.selectedProduct?.url,
          isActive: viewModel.assetPickerType == .product
        ) {
          viewModel.assetPickerType = .product
          viewModel.showAssetPicker = true
        }

        AssetSlot(
          title: "Scene",
          icon: "photo.fill",
          imageUrl: viewModel.selectedScene?.url,
          isActive: viewModel.assetPickerType == .scene
        ) {
          viewModel.assetPickerType = .scene
          viewModel.showAssetPicker = true
        }
      }
      .padding(.horizontal, Theme.Layout.sidePadding)
    }
  }
}

/// Asset slot button
struct AssetSlot: View {
  let title: String
  let icon: String
  let imageUrl: String?
  let isActive: Bool
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      GlassCard(padding: 0) {
        VStack(spacing: 0) {
          if let url = imageUrl {
            AsyncImage(url: URL(string: url)) { image in
              image
                .resizable()
                .aspectRatio(contentMode: .fill)
            } placeholder: {
              ProgressView()
            }
            .frame(width: 70, height: 70)
          } else {
            VStack(spacing: 4) {
              Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(Theme.Colors.textTertiary)
              Text("Select")
                .font(.system(size: 10))
                .foregroundColor(Theme.Colors.textTertiary)
            }
            .frame(width: 70, height: 70)
          }

          // Label
          HStack {
            Text(title)
              .font(.system(size: 10, weight: .medium))
              .foregroundColor(Theme.Colors.textSecondary)
          }
          .frame(width: 70, height: 24)
          .background(Theme.Colors.surface2)
        }
      }
      .frame(width: 70, height: 94)
    }
  }
}

/// Bottom controls dock
struct ControlDock: View {
  @ObservedObject var viewModel: ShootRoomViewModel

  var body: some View {
    GlassCard(padding: 8) {
      HStack(spacing: 24) {
        // Toggles
        HStack(spacing: 16) {
          DockToggle(
            icon: "sun.max.fill",
            isOn: $viewModel.showLightController
          )

          DockToggle(
            icon: "camera.fill",
            isOn: $viewModel.showCameraController
          )
        }

        // Divider
        Rectangle()
          .fill(Theme.Colors.border)
          .frame(width: 1, height: 32)

        // Generate Button
        Button {
          Task {
            await viewModel.generate()
          }
        } label: {
          HStack(spacing: 8) {
            if viewModel.isGenerating {
              ProgressView()
                .tint(.white)
            } else {
              Image(systemName: "sparkles")
            }
            Text(viewModel.isGenerating ? "Generating..." : "Shoot")
              .font(Theme.Typography.section)
          }
          .foregroundColor(.white)
          .padding(.horizontal, 24)
          .padding(.vertical, 12)
          .background(
            Group {
              if viewModel.canGenerate {
                Theme.Colors.accent
              } else {
                Theme.Colors.surface2
              }
            }
          )
          .cornerRadius(Theme.Layout.radiusPanel)
        }
        .disabled(!viewModel.canGenerate || viewModel.isGenerating)
      }
    }
  }
}

struct DockToggle: View {
  let icon: String
  @Binding var isOn: Bool

  var body: some View {
    Button {
      withAnimation {
        isOn.toggle()
      }
    } label: {
      Image(systemName: icon)
        .font(.system(size: 20))
        .foregroundColor(isOn ? .white : Theme.Colors.textTertiary)
        .frame(width: 44, height: 44)
        .background(
          isOn ? Theme.Colors.accent : Theme.Colors.surface2
        )
        .clipShape(Circle())
    }
  }
}
