import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Image picker using PhotosUI
struct ImagePicker: UIViewControllerRepresentable {
  let onSelect: (Data) -> Void

  @Environment(\.dismiss) private var dismiss

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var config = PHPickerConfiguration()
    config.filter = .images
    config.selectionLimit = 1

    let picker = PHPickerViewController(configuration: config)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  class Coordinator: NSObject, PHPickerViewControllerDelegate {
    let parent: ImagePicker

    init(_ parent: ImagePicker) {
      self.parent = parent
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      parent.dismiss()

      guard let result = results.first else { return }

      result.itemProvider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) {
        data, error in
        guard let data = data else { return }

        // Compress if needed
        if let image = UIImage(data: data),
          let compressed = image.jpegData(compressionQuality: 0.8)
        {
          DispatchQueue.main.async {
            self.parent.onSelect(compressed)
          }
        } else {
          DispatchQueue.main.async {
            self.parent.onSelect(data)
          }
        }
      }
    }
  }
}

/// Multi-image picker
struct MultiImagePicker: UIViewControllerRepresentable {
  let maxSelection: Int
  let onSelect: ([Data]) -> Void

  @Environment(\.dismiss) private var dismiss

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var config = PHPickerConfiguration()
    config.filter = .images
    config.selectionLimit = maxSelection

    let picker = PHPickerViewController(configuration: config)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  class Coordinator: NSObject, PHPickerViewControllerDelegate {
    let parent: MultiImagePicker

    init(_ parent: MultiImagePicker) {
      self.parent = parent
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      parent.dismiss()

      guard !results.isEmpty else { return }

      var images: [Data] = []
      let group = DispatchGroup()

      for result in results {
        group.enter()
        result.itemProvider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) {
          data, error in
          defer { group.leave() }

          guard let data = data else { return }

          if let image = UIImage(data: data),
            let compressed = image.jpegData(compressionQuality: 0.8)
          {
            images.append(compressed)
          } else {
            images.append(data)
          }
        }
      }

      group.notify(queue: .main) {
        self.parent.onSelect(images)
      }
    }
  }
}

/// Camera picker
struct CameraPicker: UIViewControllerRepresentable {
  let onCapture: (Data) -> Void

  @Environment(\.dismiss) private var dismiss

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let parent: CameraPicker

    init(_ parent: CameraPicker) {
      self.parent = parent
    }

    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      parent.dismiss()

      if let image = info[.originalImage] as? UIImage,
        let data = image.jpegData(compressionQuality: 0.8)
      {
        parent.onCapture(data)
      }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      parent.dismiss()
    }
  }
}
