import SwiftUI

/// Light control overlay
struct LightControlView: View {
    @Binding var position: CGPoint
    @Binding var direction: CGFloat
    @Binding var intensity: CGFloat
    
    var body: some View {
        VStack {
            Spacer()
            
            HStack {
                // Light position indicator (draggable)
                ZStack {
                    Circle()
                        .fill(Color.yellow.opacity(0.3))
                        .frame(width: 60, height: 60)
                    
                    Circle()
                        .fill(Color.yellow)
                        .frame(width: 30, height: 30)
                    
                    Image(systemName: "sun.max.fill")
                        .foregroundColor(.white)
                }
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            // Update position based on drag
                        }
                )
                
                Spacer()
                
                // Intensity slider
                VStack(spacing: 8) {
                    Text("亮度")
                        .font(.caption)
                        .foregroundColor(.white)
                    
                    Slider(value: $intensity, in: 0...100)
                        .frame(width: 100)
                        .tint(.yellow)
                }
                .padding()
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding()
        }
    }
}

#Preview {
    ZStack {
        Color.gray
        LightControlView(
            position: .constant(CGPoint(x: 0.3, y: 0.3)),
            direction: .constant(45),
            intensity: .constant(70)
        )
    }
}


