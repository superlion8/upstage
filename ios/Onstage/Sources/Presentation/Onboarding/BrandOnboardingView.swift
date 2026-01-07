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

enum OnboardingStep {
  case input
  case analyzing
  case intermediate
  case results
}

// MARK: - Main View
struct BrandOnboardingView: SwiftUI.View {
  @SwiftUI.State private var webLink: String =
    "https://wittmore.com/collections/gramicci/products/gramicci-charcoal-grey-mohair-sweater?variant=42259036897342"
  @SwiftUI.State private var insLink: String =
    "https://www.instagram.com/urbanoutfitters/p/DTDqX4mktXQ/?img_index=5"
  @SwiftUI.State private var videoUrl: String =
    "https://www.tiktok.com/@notbrookemonk/video/7455822281110064414?q=urban%20outfitter&t=1767776249851"
  @SwiftUI.State private var productImage: UIKit.UIImage? = nil
  @SwiftUI.State private var showingImagePicker: Bool = false

  @SwiftUI.State private var isAnalyzing: Bool = false
  @SwiftUI.State private var analysisProgress: Double = 0.0
  @SwiftUI.State private var statusMessage: String = ""

  @SwiftUI.State private var currentStep: OnboardingStep = .input
  @SwiftUI.State private var result: BrandFlowResult? = nil

  var body: some SwiftUI.View {
    SwiftUI.NavigationView {
      SwiftUI.VStack {
        caseStepView
      }
      .navigationTitle("品牌引导流程")
      .navigationBarTitleDisplayMode(.inline)
    }
    .sheet(isPresented: self.$showingImagePicker) {
      OnboardingImagePicker(image: self.$productImage)
    }
  }

  @ViewBuilder
  private var caseStepView: some SwiftUI.View {
    switch self.currentStep {
    case .input:
      InputStepView(
        webLink: self.$webLink,
        insLink: self.$insLink,
        videoUrl: self.$videoUrl,
        productImage: self.productImage,
        onShowPicker: { self.showingImagePicker = true },
        onStart: { self.startAnalysis() }
      )
    case .analyzing:
      AnalysisStepView(
        progress: self.analysisProgress,
        message: self.statusMessage
      )
    case .intermediate:
      IntermediateStepView(
        result: self.result,
        onNext: { self.currentStep = .results }
      )
    case .results:
      ResultsStepView(result: self.result)
    }
  }

  private func startAnalysis() {
    guard let image = self.productImage else { return }

    self.currentStep = .analyzing
    self.statusMessage = "正在连接服务器..."
    self.analysisProgress = 0.1

    Task {
      do {
        self.statusMessage = "正在分析品牌 DNA..."
        self.analysisProgress = 0.3

        let apiResult = try await OnboardingService.shared.runOnboarding(
          webLink: self.webLink,
          insLink: self.insLink,
          videoUrl: self.videoUrl,
          productImage: image
        )

        self.statusMessage = "生成资产中..."
        self.analysisProgress = 0.8

        // Map API response to local models
        let web = BrandFlowWebAnalysis(
          modelImageRef: apiResult.webAnalysis.modelImageRef,
          productImageRef: apiResult.webAnalysis.productImageRef
        )
        let ins = BrandFlowInsAnalysis(finalImageRef: apiResult.insAnalysis.finalImageRef)
        let video = BrandFlowVideoAnalysis(videoPrompt: apiResult.videoAnalysis.videoPrompt)

        let assets = BrandFlowGeneratedAssets(
          webStyleImages: apiResult.generatedAssets.webStyleImages.map {
            BrandFlowAsset(id: $0.id, url: $0.url)
          },
          insStyleImages: apiResult.generatedAssets.insStyleImages.map {
            BrandFlowAsset(id: $0.id, url: $0.url)
          },
          productDisplayImages: apiResult.generatedAssets.productDisplayImages.map {
            BrandFlowAsset(id: $0.id, url: $0.url)
          }
        )

        self.result = BrandFlowResult(
          brandKeywords: apiResult.brandKeywords,
          webAnalysis: web,
          insAnalysis: ins,
          videoAnalysis: video,
          generatedAssets: assets
        )

        self.analysisProgress = 1.0
        self.statusMessage = "完成"
        self.currentStep = .intermediate

      } catch {
        self.statusMessage = "错误: \(error.localizedDescription)"
        print("❌ Onboarding error: \(error)")
      }
    }
  }
}

// MARK: - Sub Views
struct InputStepView: SwiftUI.View {
  @SwiftUI.Binding var webLink: String
  @SwiftUI.Binding var insLink: String
  @SwiftUI.Binding var videoUrl: String
  let productImage: UIKit.UIImage?
  let onShowPicker: () -> Void
  let onStart: () -> Void

  var body: some SwiftUI.View {
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
        SwiftUI.Button(action: self.onShowPicker) {
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

      SwiftUI.Button(action: self.onStart) {
        SwiftUI.Text("开始品牌分析")
          .frame(maxWidth: .infinity)
          .padding()
          .background(canStart ? SwiftUI.Color.accentColor : SwiftUI.Color.gray)
          .foregroundColor(.white)
          .cornerRadius(10)
      }
      .disabled(!canStart)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }

  private var canStart: Bool {
    return !webLink.isEmpty && !insLink.isEmpty && productImage != nil
  }
}

struct AnalysisStepView: SwiftUI.View {
  let progress: Double
  let message: String

  var body: some SwiftUI.View {
    SwiftUI.VStack(spacing: 30) {
      SwiftUI.Spacer()
      SwiftUI.ProgressView(value: self.progress, total: 1.0)
        .progressViewStyle(SwiftUI.LinearProgressViewStyle())
        .padding()

      SwiftUI.Text(self.message)
        .font(.headline)

      SwiftUI.Text("正在分析品牌 DNA...")
        .font(.subheadline)
        .foregroundColor(.secondary)

      SwiftUI.Spacer()
    }
    .padding()
  }
}

struct IntermediateStepView: SwiftUI.View {
  let result: BrandFlowResult?
  let onNext: () -> Void

  var body: some SwiftUI.View {
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

        SwiftUI.Button(action: self.onNext) {
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
}

struct ResultsStepView: SwiftUI.View {
  let result: BrandFlowResult?

  var body: some SwiftUI.View {
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
      _ picker: PhotosUI.PHPickerViewController, didFinishPicking results: [PHPickerResult]
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
