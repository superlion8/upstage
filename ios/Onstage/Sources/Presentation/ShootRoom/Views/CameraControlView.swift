import SwiftUI

/// Camera control overlay
struct CameraControlView: View {
    @Binding var position: CGPoint
    var onSettingsTap: () -> Void
    
    var body: some View {
        VStack {
            Spacer()
            
            HStack {
                Spacer()
                
                // Camera indicator
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Color.blue.opacity(0.3))
                            .frame(width: 50, height: 50)
                        
                        Image(systemName: "camera.fill")
                            .foregroundColor(.blue)
                    }
                    
                    Button(action: onSettingsTap) {
                        HStack(spacing: 4) {
                            Image(systemName: "slider.horizontal.3")
                            Text("设置")
                        }
                        .font(.caption)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                    }
                }
            }
            .padding()
        }
    }
}

#Preview {
    ZStack {
        Color.gray
        CameraControlView(
            position: .constant(CGPoint(x: 0.5, y: 0.8)),
            onSettingsTap: {}
        )
    }
}




