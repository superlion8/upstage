import Foundation
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// MARK: - Models
struct BrandFlowAsset: Codable, Identifiable {
  let id: String
  let url: String
}

struct BrandFlowWebAnalysis: Codable {
  let modelImageRef: String
  let productImageRef: String
}

struct BrandFlowInsAnalysis: Codable {
  let finalImageRef: String
}

struct BrandFlowVideoAnalysis: Codable {
  let videoPrompt: String
}

struct BrandFlowGeneratedAssets: Codable {
  let webStyleImages: [BrandFlowAsset]
  let insStyleImages: [BrandFlowAsset]
  let productDisplayImages: [BrandFlowAsset]
}

struct BrandFlowResult: Codable {
  let brandKeywords: String
  let webAnalysis: BrandFlowWebAnalysis
  let insAnalysis: BrandFlowInsAnalysis
  let videoAnalysis: BrandFlowVideoAnalysis
  let generatedAssets: BrandFlowGeneratedAssets
}

// MARK: - Main View
struct BrandOnboardingView: SwiftUI.View {
  @SwiftUI.State private var webLink: String = ""
  @SwiftUI.State private var insLink: String = ""
  @SwiftUI.State private var videoUrl: String = ""
  @SwiftUI.State private var productImage: UIKit.UIImage? = nil
  @SwiftUI.State private var showingImagePicker: Bool = false

  @SwiftUI.State private var isAnalyzing: Bool = false
  @SwiftUI.State private var analysisProgress: Double = 0.0
  @SwiftUI.State private var statusMessage: String = ""

  @SwiftUI.State private var currentStep: OnboardingStep = .input
  @SwiftUI.State private var result: BrandFlowResult? = nil

  enum OnboardingStep {
    case input
    case analyzing
    case intermediate
    case results
  }

  var body: some SwiftUI.View {
    SwiftUI.NavigationView {
      SwiftUI.VStack {
        SwiftUI.Group {
          switch self.currentStep {
          case .input:
            self.inputForm
          case .analyzing:
            self.analysisView
          case .intermediate:
            self.intermediateView
          case .results:
            self.resultsView
          }
        }
      }
      .navigationTitle("品牌引导流程")
      .navigationBarTitleDisplayMode(.inline)
    }
    .sheet(isPresented: self.$showingImagePicker) {
      OnboardingImagePicker(image: self.$productImage)
    }
  }

  // MARK: - Step 1: Input Form
  private var inputForm: some SwiftUI.View {
    SwiftUI.Form {
      SwiftUI.Section(header: SwiftUI.Text("品牌资产链接")) {
        SwiftUI.TextField("官网商品详情页链接", text: self.$webLink)
          .autocapitalization(.none)
        SwiftUI.TextField("Instagram 内容链接", text: self.$insLink)
          .autocapitalization(.none)
        SwiftUI.TextField("UGC 讲解视频链接", text: self.$videoUrl)
          .autocapitalization(.none)
      }

      SwiftUI.Section(header: SwiftUI.Text("商品图")) {
        SwiftUI.Button(action: { self.showingImagePicker = true }) {
          if let image = self.productImage {
            SwiftUI.Image(uiImage: image)
              .resizable()
              .scaledToFit()
              .frame(height: 200)
          } else {
            SwiftUI.HStack {
              SwiftUI.Image(systemName: "photo.badge.plus")
              SwiftUI.Text("点击上传需要模特拍摄的商品图")
            }
            .foregroundColor(.accentColor)
          }
        }
      }

      SwiftUI.Button(action: { self.startAnalysis() }) {
        SwiftUI.Text("开始品牌分析")
          .frame(maxWidth: .infinity)
          .padding()
          .background(self.canStart ? SwiftUI.Color.accentColor : SwiftUI.Color.gray)
          .foregroundColor(.white)
          .cornerRadius(10)
      }
      .disabled(!self.canStart)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }

  // MARK: - Step 2: Analysis View
  private var analysisView: some SwiftUI.View {
    SwiftUI.VStack(spacing: 30) {
      SwiftUI.Spacer()
      SwiftUI.ProgressView(value: self.analysisProgress, total: 1.0)
        .progressViewStyle(SwiftUI.LinearProgressViewStyle())
        .padding()

      SwiftUI.Text(self.statusMessage)
        .font(.headline)

      SwiftUI.Text("正在分析品牌 DNA...")
        .font(.subheadline)
        .foregroundColor(.secondary)

      SwiftUI.Spacer()
    }
    .padding()
  }

  // MARK: - Step 3: Intermediate View
  private var intermediateView: some SwiftUI.View {
    SwiftUI.ScrollView {
      SwiftUI.VStack(alignment: .leading, spacing: 20) {
        SwiftUI.Text("分析完成！")
          .font(.title2).bold()

        SwiftUI.VStack(alignment: .leading, spacing: 10) {
          SwiftUI.Text("品牌风格关键词：").bold()
          SwiftUI.Text(self.result?.brandKeywords ?? "正在分析...")
            .padding()
            .background(SwiftUI.Color.secondary.opacity(0.1))
            .cornerRadius(8)
        }

        SwiftUI.VStack(alignment: .leading, spacing: 10) {
          SwiftUI.Text("反推短视频提示词：").bold()
          SwiftUI.Text(self.result?.videoAnalysis.videoPrompt ?? "正在生成...")
            .italic()
            .padding()
            .background(SwiftUI.Color.secondary.opacity(0.1))
            .cornerRadius(8)
        }

        SwiftUI.Spacer()

        SwiftUI.Button(action: { self.currentStep = .results }) {
          SwiftUI.Text("进入资产生成预览")
            .frame(maxWidth: .infinity)
            .padding()
            .background(SwiftUI.Color.accentColor)
            .foregroundColor(.white)
            .cornerRadius(10)
        }
      }
      .padding()
    }
  }

  // MARK: - Step 4: Results View
  private var resultsView: some SwiftUI.View {
    SwiftUI.List {
      if let assets = self.result?.generatedAssets {
        SwiftUI.Section(header: SwiftUI.Text("官网风格图 (2张)")) {
          BrandFlowAssetGrid(assets: assets.webStyleImages)
        }

        SwiftUI.Section(header: SwiftUI.Text("INS 风格图 (2张)")) {
          BrandFlowAssetGrid(assets: assets.insStyleImages)
        }

        if !assets.productDisplayImages.isEmpty {
          SwiftUI.Section(header: SwiftUI.Text("商品展示图")) {
            BrandFlowAssetGrid(assets: assets.productDisplayImages)
          }
        }
      }
    }
  }

  // MARK: - Logic
  private var canStart: Bool {
    return !self.webLink.isEmpty && !self.insLink.isEmpty && self.productImage != nil
  }

  private func startAnalysis() {
    self.currentStep = .analyzing
    self.statusMessage = "正在处理..."

    SwiftUI.withAnimation { self.analysisProgress = 0.2 }

    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      self.statusMessage = "分析中..."
      SwiftUI.withAnimation { self.analysisProgress = 0.5 }

      DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
        self.statusMessage = "生成提示词..."
        SwiftUI.withAnimation { self.analysisProgress = 0.8 }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
          self.statusMessage = "就绪"
          SwiftUI.withAnimation { self.analysisProgress = 1.0 }
          self.currentStep = .intermediate
          self.mockResult()
        }
      }
    }
  }

  private func mockResult() {
    let web = BrandFlowWebAnalysis(modelImageRef: "web_1", productImageRef: "web_2")
    let ins = BrandFlowInsAnalysis(finalImageRef: "ins_1")
    let video = BrandFlowVideoAnalysis(videoPrompt: "A model walking.")

    let assets = BrandFlowGeneratedAssets(
      webStyleImages: [BrandFlowAsset(id: "1", url: ""), BrandFlowAsset(id: "2", url: "")],
      insStyleImages: [BrandFlowAsset(id: "3", url: ""), BrandFlowAsset(id: "4", url: "")],
      productDisplayImages: [BrandFlowAsset(id: "5", url: "")]
    )

    self.result = BrandFlowResult(
      brandKeywords: "时尚, 前卫",
      webAnalysis: web,
      insAnalysis: ins,
      videoAnalysis: video,
      generatedAssets: assets
    )
  }
}

// MARK: - Components
struct BrandFlowAssetGrid: SwiftUI.View {
  let assets: [BrandFlowAsset]
  var body: some SwiftUI.View {
    SwiftUI.LazyVGrid(
      columns: [SwiftUI.GridItem(.flexible()), SwiftUI.GridItem(.flexible())], spacing: 10
    ) {
      SwiftUI.ForEach(self.assets) { asset in
        SwiftUI.Group {
          if let image = self.decodeBase64(asset.url) {
            SwiftUI.Image(uiImage: image)
              .resizable()
              .aspectRatio(9.0 / 16.0, contentMode: .fill)
              .cornerRadius(8)
              .clipped()
          } else {
            SwiftUI.Rectangle()
              .fill(SwiftUI.Color.secondary.opacity(0.2))
              .aspectRatio(9.0 / 16.0, contentMode: .fill)
              .overlay(SwiftUI.Text("AI").font(.caption))
              .cornerRadius(8)
          }
        }
      }
    }
    .padding(.vertical, 10)
  }

  private func decodeBase64(_ url: String) -> UIKit.UIImage? {
    guard url.hasPrefix("data:image"),
      let base64String = url.components(separatedBy: ",").last,
      let data = Foundation.Data(base64Encoded: base64String, options: .ignoreUnknownCharacters)
    else {
      return nil
    }
    return UIKit.UIImage(data: data)
  }
}

struct OnboardingImagePicker: SwiftUI.UIViewControllerRepresentable {
  @SwiftUI.Binding var image: UIKit.UIImage?

  func makeUIViewController(context: Context) -> PhotosUI.PHPickerViewController {
    var config = PhotosUI.PHPickerConfiguration()
    config.filter = .images
    let picker = PhotosUI.PHPickerViewController(configuration: config)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: PhotosUI.PHPickerViewController, context: Context)
  {}

  func makeCoordinator() -> Coordinator {
    return Coordinator(self)
  }

  class Coordinator: NSObject, PhotosUI.PHPickerViewControllerDelegate {
    let parent: OnboardingImagePicker

    init(_ parent: OnboardingImagePicker) {
      self.parent = parent
    }

    func picker(
      _ picker: PhotosUI.PHPickerViewController, didFinishPicking results: [PhotosUI.PHPickerResult]
    ) {
      picker.dismiss(animated: true)

      guard let provider = results.first?.itemProvider,
        provider.canLoadObject(ofClass: UIKit.UIImage.self)
      else { return }

      provider.loadObject(ofClass: UIKit.UIImage.self) { image, _ in
        DispatchQueue.main.async {
          self.parent.image = image as? UIKit.UIImage
        }
      }
    }
  }
}
