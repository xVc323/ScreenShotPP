import SwiftRs
import Foundation
import Vision
import CoreGraphics
import ImageIO

@_cdecl("ocr_recognize")
public func ocr_recognize(_ data: SRData) -> SRString {
    let cfData = Data(data.toArray()) as CFData
    guard let source = CGImageSourceCreateWithData(cfData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return SRString("")
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = true
    }
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return SRString("")
    }
    let lines: [String] = (request.results ?? []).compactMap { observation in
        observation.topCandidates(1).first?.string
    }
    return SRString(lines.joined(separator: "\n"))
}
