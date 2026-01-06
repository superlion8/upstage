import SwiftUI

/// Input bar for chat
struct InputBarView: View {
    @Binding var text: String
    @Binding var selectedImages: [MessageImage]
    let isLoading: Bool
    let onSend: () -> Void
    let onAddImage: () -> Void
    let onRemoveImage: (Int) -> Void
    
    @FocusState private var isFocused: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            // Selected images preview
            if !selectedImages.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(selectedImages.enumerated()), id: \.element.id) { index, image in
                            SelectedImagePreview(
                                image: image,
                                onRemove: {
                                    onRemoveImage(index)
                                }
                            )
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .background(Color(.systemGray6))
            }
            
            // Input area
            HStack(alignment: .bottom, spacing: 12) {
                // Add image button
                Button {
                    onAddImage()
                } label: {
                    Image(systemName: "photo.badge.plus")
                        .font(.title2)
                        .foregroundColor(.accentColor)
                }
                .disabled(isLoading || selectedImages.count >= 5)
                
                // Text input
                TextField("输入消息或上传图片...", text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...5)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .focused($isFocused)
                
                // Send button
                Button {
                    onSend()
                    isFocused = false
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title)
                        .foregroundColor(canSend ? .accentColor : .gray)
                }
                .disabled(!canSend || isLoading)
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
        .background(Color(.systemBackground))
    }
    
    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !selectedImages.isEmpty
    }
}

/// Selected image preview
struct SelectedImagePreview: View {
    let image: MessageImage
    let onRemove: () -> Void
    
    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let uiImage = UIImage(data: image.data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 60, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            
            // Label
            Text(image.label)
                .font(.caption2)
                .fontWeight(.medium)
                .foregroundColor(.white)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(Color.black.opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .offset(x: -4, y: 4)
            
            // Remove button
            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundColor(.white)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }
            .offset(x: 6, y: -6)
        }
    }
}

#Preview {
    VStack {
        Spacer()
        InputBarView(
            text: .constant(""),
            selectedImages: .constant([]),
            isLoading: false,
            onSend: {},
            onAddImage: {},
            onRemoveImage: { _ in }
        )
    }
}



