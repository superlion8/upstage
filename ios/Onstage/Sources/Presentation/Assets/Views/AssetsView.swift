import SwiftUI

/// Assets library view
struct AssetsView: View {
  @StateObject private var viewModel = AssetsViewModel()

  var body: some View {
    NavigationStack {
      ZStack {
        // Global Background
        Theme.Colors.bg0.ignoresSafeArea()

        VStack(spacing: 0) {
          // Header
          HStack {
            Text("Assets")
              .font(Theme.Typography.title)
              .foregroundColor(Theme.Colors.textPrimary)

            Spacer()

            Button {
              viewModel.showUploadSheet = true
            } label: {
              Image(systemName: "plus")
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(Theme.Colors.textPrimary)
                .frame(width: 40, height: 40)
                .background(Theme.Colors.surface2)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Colors.border, lineWidth: 1))
            }
          }
          .padding(.horizontal, Theme.Layout.sidePadding)
          .padding(.bottom, 16)
          .background(Theme.Colors.bg0)

          // Category Filter
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
              ForEach(AssetsViewModel.Category.allCases, id: \.self) { category in
                Chip(
                  title: category.title,
                  isSelected: viewModel.selectedCategory == category
                ) {
                  withAnimation {
                    viewModel.selectedCategory = category
                  }
                }
              }
            }
            .padding(.horizontal, Theme.Layout.sidePadding)
            .padding(.bottom, 16)
          }

          // Assets grid
          ScrollView {
            if viewModel.isLoading {
              ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.top, 100)
            } else if viewModel.assets.isEmpty {
              VStack(spacing: 16) {
                Image(systemName: "photo.on.rectangle.angled")
                  .font(.system(size: 48))
                  .foregroundColor(Theme.Colors.textTertiary)
                Text("No Assets")
                  .font(Theme.Typography.section)
                  .foregroundColor(Theme.Colors.textSecondary)
                Text("Upload or generate assets to see them here")
                  .font(Theme.Typography.body)
                  .foregroundColor(Theme.Colors.textTertiary)
                  .multilineTextAlignment(.center)
              }
              .padding(.top, 100)
            } else {
              LazyVGrid(
                columns: [
                  GridItem(.flexible(), spacing: 12),
                  GridItem(.flexible(), spacing: 12),
                  GridItem(.flexible(), spacing: 12),
                ], spacing: 12
              ) {
                ForEach(viewModel.assets) { asset in
                  AssetCard(asset: asset) {
                    viewModel.selectedAsset = asset
                  }
                }
              }
              .padding(.horizontal, Theme.Layout.sidePadding)
              .padding(.bottom, 32)
            }
          }
          .refreshable {
            await viewModel.loadAssets()
          }
        }
      }
      .navigationBarHidden(true)
      .sheet(item: $viewModel.selectedAsset) { asset in
        AssetDetailView(asset: asset)
      }
      .sheet(isPresented: $viewModel.showUploadSheet) {
        AssetUploadSheet(onUpload: viewModel.uploadAsset)
      }
    }
    .task {
      await viewModel.loadAssets()
    }
  }
}

/// Asset card in grid
struct AssetCard: View {
  let asset: Asset
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      VStack(spacing: 8) {
        AsyncImage(url: URL(string: asset.thumbnailUrl ?? asset.url)) { phase in
          switch phase {
          case .empty:
            Rectangle()
              .fill(Theme.Colors.surface1)
              .overlay(ProgressView())
          case .success(let image):
            image
              .resizable()
              .aspectRatio(contentMode: .fill)
          case .failure:
            Rectangle()
              .fill(Theme.Colors.surface1)
              .overlay(
                Image(systemName: "exclamationmark.triangle")
                  .foregroundColor(Theme.Colors.textTertiary)
              )
          @unknown default:
            EmptyView()
          }
        }
        .aspectRatio(1, contentMode: .fit)  // Square aspect ratio
        .clipShape(RoundedRectangle(cornerRadius: Theme.Layout.radiusCard))
        .overlay(
          RoundedRectangle(cornerRadius: Theme.Layout.radiusCard)
            .stroke(Theme.Colors.border, lineWidth: 1)
        )

        if let name = asset.name {
          Text(name)
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.textSecondary)
            .lineLimit(1)
        }
      }
    }
  }
}

/// Asset detail view
struct AssetDetailView: View {
  let asset: Asset
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ZStack {
        Theme.Colors.bg0.ignoresSafeArea()

        ScrollView {
          VStack(spacing: 24) {
            // Image
            GlassCard(padding: 0) {
              AsyncImage(url: URL(string: asset.url)) { image in
                image
                  .resizable()
                  .aspectRatio(contentMode: .fit)
              } placeholder: {
                ProgressView().padding(40)
              }
            }
            .frame(maxHeight: 500)

            // Info Section
            VStack(alignment: .leading, spacing: 16) {
              if let name = asset.name {
                DetailRow(label: "Name", value: name)
              }

              DetailRow(label: "Type", value: asset.type.rawValue.capitalized)
              DetailRow(
                label: "Created",
                value: asset.createdAt.formatted(date: .abbreviated, time: .shortened))

              if let tags = asset.tags, !tags.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                  Text("Tags")
                    .font(Theme.Typography.caption)
                    .foregroundColor(Theme.Colors.textTertiary)

                  FlowLayout(spacing: 8) {
                    ForEach(tags, id: \.self) { tag in
                      Text(tag)
                        .font(Theme.Typography.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Theme.Colors.surface2)
                        .cornerRadius(8)
                        .foregroundColor(Theme.Colors.textSecondary)
                    }
                  }
                }
              }
            }
            .padding(.horizontal, Theme.Layout.padding)

            // Actions
            HStack(spacing: 16) {
              SecondaryButton("Delete", icon: "trash") {
                // Delete logic
              }

              PrimaryButton("Use", icon: "arrow.right") {
                // Use logic
              }
            }
            .padding(.horizontal, Theme.Layout.padding)
            .padding(.bottom, 32)
          }
          .padding(.vertical, 24)
        }
      }
      .navigationTitle("Details")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Done") {
            dismiss()
          }
        }
      }
    }
  }
}

struct DetailRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack {
      Text(label)
        .font(Theme.Typography.body)
        .foregroundColor(Theme.Colors.textTertiary)
      Spacer()
      Text(value)
        .font(Theme.Typography.body)
        .foregroundColor(Theme.Colors.textPrimary)
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
      ZStack {
        Theme.Colors.bg0.ignoresSafeArea()

        ScrollView {
          VStack(spacing: 24) {

            // Type Selection
            VStack(alignment: .leading, spacing: 8) {
              Text("Type")
                .font(Theme.Typography.caption)
                .foregroundColor(Theme.Colors.textTertiary)

              Picker("Type", selection: $selectedType) {
                Text("Product").tag(Asset.AssetType.product)
                Text("Model").tag(Asset.AssetType.model)
                Text("Scene").tag(Asset.AssetType.scene)
                Text("Reference").tag(Asset.AssetType.reference)
              }
              .pickerStyle(.segmented)
              .colorScheme(.dark)  // Enforce dark picker
            }

            // Image Selection
            VStack(alignment: .leading, spacing: 8) {
              Text("Image")
                .font(Theme.Typography.caption)
                .foregroundColor(Theme.Colors.textTertiary)

              Button {
                showImagePicker = true
              } label: {
                if let imageData = selectedImage, let uiImage = UIImage(data: imageData) {
                  Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxHeight: 300)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Layout.radiusCard))
                    .overlay(
                      RoundedRectangle(cornerRadius: Theme.Layout.radiusCard)
                        .stroke(Theme.Colors.border, lineWidth: 1)
                    )
                } else {
                  GlassCard {
                    VStack(spacing: 12) {
                      Image(systemName: "photo.badge.plus")
                        .font(.system(size: 32))
                        .foregroundColor(Theme.Colors.accent)
                      Text("Select Image")
                        .font(Theme.Typography.body)
                        .foregroundColor(Theme.Colors.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 200)
                  }
                }
              }
            }

            // Name Input
            VStack(alignment: .leading, spacing: 8) {
              Text("Name (Optional)")
                .font(Theme.Typography.caption)
                .foregroundColor(Theme.Colors.textTertiary)

              AppInput(text: $name, placeholder: "Enter name", icon: "pencil")
            }

            Spacer(minLength: 20)

            PrimaryButton("Upload", icon: "arrow.up.circle") {
              if let data = selectedImage {
                onUpload(selectedType, data, name.isEmpty ? nil : name)
                dismiss()
              }
            }
            .disabled(selectedImage == nil)
            .opacity(selectedImage == nil ? 0.5 : 1)
          }
          .padding(Theme.Layout.padding)
        }
      }
      .navigationTitle("Upload Asset")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarLeading) {
          Button("Cancel") { dismiss() }
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

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let offsets = layout(sizes: sizes, containerWidth: bounds.width).offsets

    for (subview, offset) in zip(subviews, offsets) {
      subview.place(
        at: CGPoint(x: bounds.minX + offset.x, y: bounds.minY + offset.y), proposal: .unspecified)
    }
  }

  private func layout(sizes: [CGSize], containerWidth: CGFloat) -> (
    offsets: [CGPoint], size: CGSize
  ) {
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
