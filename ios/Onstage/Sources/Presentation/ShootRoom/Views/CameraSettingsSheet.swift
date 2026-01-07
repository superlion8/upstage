import SwiftUI

/// Camera settings sheet
struct CameraSettingsSheet: View {
    @ObservedObject var viewModel: ShootRoomViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            Form {
                Section("机位角度") {
                    Picker("角度", selection: $viewModel.cameraAngle) {
                        ForEach(ShootRoomConfig.CameraConfig.CameraAngle.allCases, id: \.self) { angle in
                            Text(angle.displayName).tag(angle)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                
                Section("焦距") {
                    HStack {
                        Text("\(Int(viewModel.focalLength))mm")
                            .monospacedDigit()
                        Slider(value: $viewModel.focalLength, in: 24...200, step: 1)
                    }
                    
                    HStack(spacing: 12) {
                        ForEach([35, 50, 85, 135], id: \.self) { focal in
                            Button("\(focal)mm") {
                                viewModel.focalLength = CGFloat(focal)
                            }
                            .buttonStyle(.bordered)
                            .tint(viewModel.focalLength == CGFloat(focal) ? .accentColor : .gray)
                        }
                    }
                }
                
                Section("预设") {
                    Button("人像模式") {
                        viewModel.cameraAngle = .eye
                        viewModel.focalLength = 85
                    }
                    
                    Button("全身模式") {
                        viewModel.cameraAngle = .eye
                        viewModel.focalLength = 50
                    }
                    
                    Button("特写模式") {
                        viewModel.cameraAngle = .eye
                        viewModel.focalLength = 135
                    }
                }
            }
            .navigationTitle("相机设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }
}

extension ShootRoomConfig.CameraConfig.CameraAngle {
    var displayName: String {
        switch self {
        case .high: return "俯拍"
        case .eye: return "平视"
        case .low: return "仰拍"
        }
    }
}

#Preview {
    CameraSettingsSheet(viewModel: ShootRoomViewModel())
}




