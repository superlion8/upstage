import SwiftUI

/// Scene canvas view - displays the model silhouette and scene
struct SceneCanvasView: View {
  @ObservedObject var viewModel: ShootRoomViewModel

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        // 1. Scene background
        Group {
          if let scene = viewModel.selectedScene {
            AsyncImage(url: URL(string: scene.url)) { image in
              image
                .resizable()
                .aspectRatio(contentMode: .fill)
            } placeholder: {
              Theme.Colors.bg1
            }
          } else {
            // Default Dark Gradient
            LinearGradient(
              colors: [Theme.Colors.bg0, Theme.Colors.bg1],
              startPoint: .top,
              endPoint: .bottom
            )
          }
        }
        .frame(width: geometry.size.width, height: geometry.size.height)
        .clipped()

        // 2. Model silhouette
        CanvasModelSilhouette(
          hasModel: viewModel.selectedModel != nil,
          hasProduct: viewModel.selectedProduct != nil
        )
        .frame(width: geometry.size.width * 0.4)
        .position(
          x: geometry.size.width / 2,
          y: geometry.size.height / 2
        )

        // 3. Focal length preview overlay
        CanvasFocalLengthOverlay(
          focalLength: viewModel.focalLength,
          size: geometry.size
        )

        // 4. Interactive Controllers
        if viewModel.showLightController {
          CanvasLightControl(
            position: $viewModel.lightPosition,
            direction: $viewModel.lightDirection,
            intensity: $viewModel.lightIntensity
          )
        }

        if viewModel.showCameraController {
          CanvasCameraControl(
            position: $viewModel.cameraPosition,
            onSettingsTap: {
              viewModel.showCameraSettings = true
            }
          )
        }
      }
    }
  }
}

/// Model silhouette placeholder
struct CanvasModelSilhouette: View {
  let hasModel: Bool
  let hasProduct: Bool

  var body: some View {
    ZStack {
      // Body outline
      Image(systemName: "figure.stand")
        .resizable()
        .aspectRatio(contentMode: .fit)
        .foregroundColor(
          hasModel ? Theme.Colors.accent.opacity(0.8) : Theme.Colors.textTertiary.opacity(0.3))

      // Status indicators
      VStack {
        if !hasModel {
          StatusChip(text: "Select Model", color: Theme.Colors.accent)
        }
        if !hasProduct {
          StatusChip(text: "Select Product", color: Theme.Colors.textSecondary)
        }
      }
    }
  }
}

struct StatusChip: View {
  let text: String
  let color: Color

  var body: some View {
    Text(text)
      .font(Theme.Typography.caption)
      .fontWeight(.medium)
      .foregroundColor(Theme.Colors.bg0)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(color)
      .clipShape(Capsule())
  }
}

/// Focal length preview overlay
struct CanvasFocalLengthOverlay: View {
  let focalLength: CGFloat
  let size: CGSize

  var body: some View {
    let cropFactor = calculateCropFactor()

    Rectangle()
      .strokeBorder(Color.white.opacity(0.3), lineWidth: 1)
      .frame(
        width: size.width * cropFactor,
        height: size.height * cropFactor
      )
      .overlay(alignment: .topLeading) {
        Text("\(Int(focalLength))mm")
          .font(Theme.Typography.caption)
          .foregroundColor(.white)
          .padding(4)
          .background(Color.black.opacity(0.5))
          .cornerRadius(4)
          .padding(8)
      }
  }

  private func calculateCropFactor() -> CGFloat {
    let normalized = (focalLength - 16) / (200 - 16)
    return 0.4 + (normalized * 0.5)
  }
}

/// Light control view
struct CanvasLightControl: View {
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
                Color.clear,
              ],
              center: .center,
              startRadius: 0,
              endRadius: 80
            )
          )
          .frame(width: 160, height: 160)
          .position(x: lightX, y: lightY)

        // Draggable handle
        Circle()
          .fill(Color.yellow)
          .frame(width: 36, height: 36)
          .overlay {
            Image(systemName: "sun.max.fill")
              .foregroundColor(Theme.Colors.bg0)
          }
          .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
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

        // Direction Arrow
        let arrowLength: CGFloat = 60
        let rad = direction * .pi / 180
        let arrowEndX = lightX + cos(rad) * arrowLength
        let arrowEndY = lightY + sin(rad) * arrowLength

        Path { path in
          path.move(to: CGPoint(x: lightX, y: lightY))
          path.addLine(to: CGPoint(x: arrowEndX, y: arrowEndY))
        }
        .stroke(Color.yellow, style: StrokeStyle(lineWidth: 2, dash: [4]))

        // Rotation Handle
        Circle()
          .fill(Color.orange)
          .frame(width: 20, height: 20)
          .overlay(Circle().stroke(Color.white, lineWidth: 1))
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
  }
}

/// Camera control view
struct CanvasCameraControl: View {
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
            .font(.system(size: 20))
            .foregroundColor(.white)

          Text("Angle")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white)
        }
        .frame(width: 60, height: 50)
        .background(Theme.Colors.accent)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 4)
        .position(x: cameraX, y: cameraY)
        .gesture(
          DragGesture()
            .onChanged { value in
              position = CGPoint(
                x: min(max(value.location.x / geometry.size.width, 0), 1),
                y: min(max(value.location.y / geometry.size.height, 0.1), 0.9)
              )
            }
        )
        .onTapGesture {
          onSettingsTap()
        }

        // View Cone
        Path { path in
          let coneWidth: CGFloat = 80
          let coneHeight: CGFloat = 120

          path.move(to: CGPoint(x: cameraX, y: cameraY))
          path.addLine(to: CGPoint(x: cameraX - coneWidth / 2, y: cameraY - coneHeight))
          path.addLine(to: CGPoint(x: cameraX + coneWidth / 2, y: cameraY - coneHeight))
          path.closeSubpath()
        }
        .fill(Theme.Colors.accent.opacity(0.15))
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
      ZStack {
        Theme.Colors.bg0.ignoresSafeArea()

        Form {
          Section("Angle") {
            Picker("Angle", selection: $viewModel.cameraAngle) {
              Text("High").tag(ShootRoomConfig.CameraConfig.CameraAngle.high)
              Text("Eye Level").tag(ShootRoomConfig.CameraConfig.CameraAngle.eye)
              Text("Low").tag(ShootRoomConfig.CameraConfig.CameraAngle.low)
            }
            .pickerStyle(.segmented)
          }

          Section("Focal Length") {
            VStack {
              HStack {
                Text("\(Int(viewModel.focalLength))mm")
                  .font(Theme.Typography.body)
                Spacer()
              }
              Slider(value: $viewModel.focalLength, in: 16...200, step: 1)
            }
          }

          Section("Lighting Intensity") {
            VStack {
              HStack {
                Text("\(Int(viewModel.lightIntensity))%")
                  .font(Theme.Typography.body)
                Spacer()
              }
              Slider(value: $viewModel.lightIntensity, in: 0...100, step: 1)
            }
          }
        }
        .scrollContentBackground(.hidden)  // Hide default gray background
      }
      .navigationTitle("Camera Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Done") { dismiss() }
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
      ZStack {
        Theme.Colors.bg0.ignoresSafeArea()

        ScrollView {
          LazyVGrid(
            columns: [
              GridItem(.flexible()),
              GridItem(.flexible()),
              GridItem(.flexible()),
            ], spacing: 12
          ) {
            ForEach(assets) { asset in
              AssetCard(asset: asset) {
                onSelect(asset)
                dismiss()
              }
            }

            // Fake Presets if empty
            if assets.isEmpty {
              VStack {
                Text("No Assets")
                  .foregroundColor(Theme.Colors.textTertiary)
              }
            }
          }
          .padding(Theme.Layout.padding)
        }
      }
      .navigationTitle(typeTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarLeading) {
          Button("Cancel") { dismiss() }
        }
      }
    }
    .task {
      // Load logic here
    }
  }

  private var typeTitle: String {
    switch type {
    case .model: return "Select Model"
    case .product: return "Select Product"
    case .scene: return "Select Scene"
    default: return "Select Asset"
    }
  }
}
